//! RR46: 观测与用卡建议 JSONL 的通用 IO 薄壳。
//! 不解释金额、预测字段或决策语义；算法唯一源在 src/lib。
use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

use serde::Serialize;
use sha2::{Digest, Sha256};

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogRead {
    pub path: String,
    pub content: String,
}

/// RR56：日志指纹（字节数 + 内容 SHA-256）。前端缓存整份内容后，只用指纹做 CAS，
/// 不再每次追加都把整份 JSONL 往返 IPC 两遍。
#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogStat {
    pub path: String,
    pub bytes: u64,
    pub sha256: String,
}

pub fn content_sha256(content: &str) -> String {
    format!("{:x}", Sha256::digest(content.as_bytes()))
}

/// 指纹版写入的回执：无论成功与否都带回磁盘现状指纹，前端据此决定继续追加还是重读。
#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HashedWrite {
    pub status: AppendResult,
    pub bytes: u64,
    pub sha256: String,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AppendResult {
    Appended,
    Conflict,
    Busy,
}

fn file_name(kind: &str) -> Result<&'static str, String> {
    match kind {
        "usage" => Ok("observations.jsonl"),
        "cards" => Ok("card-decisions.jsonl"),
        _ => Err("unsupported observation log kind".into()),
    }
}

fn log_path(dir: &Path, kind: &str) -> Result<PathBuf, String> {
    Ok(dir.join(file_name(kind)?))
}

fn lock_path(dir: &Path, kind: &str) -> Result<PathBuf, String> {
    Ok(dir.join(format!("{}.lock", file_name(kind)?)))
}

pub fn read_log(dir: &Path, kind: &str) -> Result<LogRead, String> {
    let path = log_path(dir, kind)?;
    let content = match fs::read_to_string(&path) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(error) => return Err(format!("observation log read failed: {error}")),
    };
    Ok(LogRead { path: path.to_string_lossy().into_owned(), content })
}

pub fn stat_log(dir: &Path, kind: &str) -> Result<LogStat, String> {
    let read = read_log(dir, kind)?;
    Ok(LogStat { path: read.path, bytes: read.content.len() as u64, sha256: content_sha256(&read.content) })
}

/// create_new 与预测日志相同：锁冲突返回 Busy，不擅自清理其他写者的锁。
struct FileLock {
    file: Option<File>,
    path: PathBuf,
}

impl Drop for FileLock {
    fn drop(&mut self) {
        drop(self.file.take()); // Windows 上先关闭句柄，再删除自己持有的锁。
        let _ = fs::remove_file(&self.path);
    }
}

fn validate_line(line: &str) -> Result<(), String> {
    if line.contains(['\n', '\r']) {
        return Err("observation record must be one JSON line".into());
    }
    let value: serde_json::Value =
        serde_json::from_str(line).map_err(|error| format!("invalid observation JSON: {error}"))?;
    if !value.is_object() || !value["id"].is_string() || !value["observedAt"].is_string() {
        return Err("observation record requires string id and observedAt".into());
    }
    Ok(())
}

/// RR56：锁文件只在一次追加/重写期间存在（毫秒到百毫秒级）。进程被强杀或断电会留下孤儿锁，
/// 此前会让所有后续写入永远返回 Busy；超过此时长的锁视为陈旧，清掉后重试一次。
const STALE_LOCK_AFTER: std::time::Duration = std::time::Duration::from_secs(120);

fn lock_is_stale(path: &Path) -> bool {
    fs::metadata(path)
        .and_then(|meta| meta.modified())
        .ok()
        .and_then(|modified| modified.elapsed().ok())
        .map(|age| age > STALE_LOCK_AFTER)
        .unwrap_or(false)
}

fn acquire_lock(dir: &Path, kind: &str) -> Result<Option<FileLock>, String> {
    let lock_path = lock_path(dir, kind)?;
    fs::create_dir_all(dir).map_err(|error| format!("observation directory failed: {error}"))?;
    let mut lock_file = None;
    for attempt in 0..2 {
        match OpenOptions::new().write(true).create_new(true).open(&lock_path) {
            Ok(file) => { lock_file = Some(file); break; }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                if attempt == 0 && lock_is_stale(&lock_path) {
                    let _ = fs::remove_file(&lock_path);
                    continue;
                }
                return Ok(None);
            }
            Err(error) => return Err(format!("observation lock failed: {error}")),
        }
    }
    let Some(lock_file) = lock_file else { return Ok(None) };
    let mut lock = FileLock { file: Some(lock_file), path: lock_path };
    lock.file
        .as_mut()
        .expect("newly acquired lock has an open file")
        .write_all(
            format!(
                "{{\"pid\":{},\"createdAt\":\"{}\"}}\n",
                std::process::id(),
                chrono::Utc::now().to_rfc3339()
            )
            .as_bytes(),
        )
        .map_err(|error| format!("observation lock metadata failed: {error}"))?;
    Ok(Some(lock))
}

/// 持锁 CAS 追加：`matches` 判断磁盘现状是否仍是调用者据以构造新行的那一份。
fn append_line_matching(
    dir: &Path,
    kind: &str,
    matches: impl Fn(&str) -> bool,
    line: &str,
) -> Result<AppendResult, String> {
    let path = log_path(dir, kind)?;
    validate_line(line)?;
    let _lock = match acquire_lock(dir, kind)? {
        Some(lock) => lock,
        None => return Ok(AppendResult::Busy),
    };
    let current = read_log(dir, kind)?.content;
    if !matches(&current) {
        return Ok(AppendResult::Conflict);
    }
    let mut file = OpenOptions::new()
        .append(true)
        .create(true)
        .open(path)
        .map_err(|error| format!("observation append open failed: {error}"))?;
    let separator = if !current.is_empty() && !current.ends_with('\n') { "\n" } else { "" };
    file.write_all(format!("{separator}{line}\n").as_bytes())
        .map_err(|error| format!("observation append failed: {error}"))?;
    file.sync_data().map_err(|error| format!("observation sync failed: {error}"))?;
    Ok(AppendResult::Appended)
}

/// expected_content 是调用者据以构造追加行的原文；持锁 CAS 防止并发覆盖或重复写入。
pub fn append_line(
    dir: &Path,
    kind: &str,
    expected_content: &str,
    line: &str,
) -> Result<AppendResult, String> {
    append_line_matching(dir, kind, |current| current == expected_content, line)
}

/// RR56：同一 CAS 语义，但调用者只提交 SHA-256 指纹（由 stat_log / 上次成功写入推得），
/// 整份内容留在前端内存里。
pub fn append_line_by_hash(
    dir: &Path,
    kind: &str,
    expected_sha256: &str,
    line: &str,
) -> Result<HashedWrite, String> {
    let expected = expected_sha256.trim().to_ascii_lowercase();
    let status = append_line_matching(dir, kind, |current| content_sha256(current) == expected, line)?;
    let stat = stat_log(dir, kind)?;
    Ok(HashedWrite { status, bytes: stat.bytes, sha256: stat.sha256 })
}

/// RR56：持锁 CAS 整体重写（用于压缩无人回读的大行）。先把原文件完整备份为 `<name>.bak`，
/// 再写临时文件并原子换名；指纹不符返回 Conflict，不动原文件。
pub fn rewrite_log(
    dir: &Path,
    kind: &str,
    expected_sha256: &str,
    content: &str,
) -> Result<HashedWrite, String> {
    let status = rewrite_log_status(dir, kind, expected_sha256, content)?;
    let stat = stat_log(dir, kind)?;
    Ok(HashedWrite { status, bytes: stat.bytes, sha256: stat.sha256 })
}

fn rewrite_log_status(
    dir: &Path,
    kind: &str,
    expected_sha256: &str,
    content: &str,
) -> Result<AppendResult, String> {
    let path = log_path(dir, kind)?;
    for (index, line) in content.split('\n').enumerate() {
        if line.is_empty() { continue; }
        validate_line(line).map_err(|error| format!("rewrite line {} rejected: {error}", index + 1))?;
    }
    if !content.is_empty() && !content.ends_with('\n') {
        return Err("rewritten log must end with a newline".into());
    }
    let _lock = match acquire_lock(dir, kind)? {
        Some(lock) => lock,
        None => return Ok(AppendResult::Busy),
    };
    let current = read_log(dir, kind)?.content;
    if content_sha256(&current) != expected_sha256.trim().to_ascii_lowercase() {
        return Ok(AppendResult::Conflict);
    }
    if path.exists() {
        let backup = path.with_extension("jsonl.bak");
        fs::copy(&path, &backup).map_err(|error| format!("observation backup failed: {error}"))?;
    }
    let temp = path.with_extension("jsonl.tmp");
    {
        let mut file = File::create(&temp).map_err(|error| format!("observation temp create failed: {error}"))?;
        file.write_all(content.as_bytes()).map_err(|error| format!("observation temp write failed: {error}"))?;
        file.sync_data().map_err(|error| format!("observation temp sync failed: {error}"))?;
    }
    fs::rename(&temp, &path).map_err(|error| format!("observation replace failed: {error}"))?;
    Ok(AppendResult::Appended)
}

#[cfg(test)]
mod tests {
    use super::*;

    const USAGE: &str = r#"{"id":"u-1","observedAt":"2026-10-12T04:00:00Z","remaining":42}"#;
    const CARD: &str = r#"{"id":"c-1","observedAt":"2026-10-12T04:00:00Z","decision":"hold"}"#;

    fn temp_dir(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "reset-radar-observations-{name}-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap()
        ))
    }

    #[test]
    fn both_whitelisted_logs_round_trip_to_fixed_paths() {
        let dir = temp_dir("roundtrip");
        for (kind, line, expected_name) in [
            ("usage", USAGE, "observations.jsonl"),
            ("cards", CARD, "card-decisions.jsonl"),
        ] {
            assert_eq!(read_log(&dir, kind).unwrap().content, "");
            assert_eq!(append_line(&dir, kind, "", line).unwrap(), AppendResult::Appended);
            let read = read_log(&dir, kind).unwrap();
            assert!(read.path.ends_with(expected_name));
            assert_eq!(read.content, format!("{line}\n"));
            assert_eq!(append_line(&dir, kind, "", line).unwrap(), AppendResult::Conflict);
        }
        assert!(!dir.join("observations.jsonl.lock").exists());
        assert!(!dir.join("card-decisions.jsonl.lock").exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn kind_is_a_path_whitelist() {
        let dir = temp_dir("kind");
        for kind in ["", "prediction", "../outside", "usage.jsonl"] {
            assert!(read_log(&dir, kind).is_err());
            assert!(append_line(&dir, kind, "", USAGE).is_err());
        }
        assert!(!dir.exists());
    }

    #[test]
    fn appends_without_rewriting_existing_bytes_or_unterminated_tail() {
        let dir = temp_dir("bytes");
        fs::create_dir_all(&dir).unwrap();
        let original = "bad-line\r\nnot-json";
        fs::write(log_path(&dir, "usage").unwrap(), original).unwrap();
        assert_eq!(append_line(&dir, "usage", original, USAGE).unwrap(), AppendResult::Appended);
        assert_eq!(fs::read(log_path(&dir, "usage").unwrap()).unwrap(),
            format!("{original}\n{USAGE}\n").as_bytes());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn busy_lock_is_preserved_and_returns_without_writing() {
        let dir = temp_dir("busy");
        fs::create_dir_all(&dir).unwrap();
        let lock = lock_path(&dir, "cards").unwrap();
        fs::write(&lock, "other writer").unwrap();
        assert_eq!(append_line(&dir, "cards", "", CARD).unwrap(), AppendResult::Busy);
        assert_eq!(fs::read_to_string(lock).unwrap(), "other writer");
        assert!(!log_path(&dir, "cards").unwrap().exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn stale_orphan_lock_is_reclaimed_but_fresh_lock_is_respected() {
        let dir = temp_dir("stale-lock");
        fs::create_dir_all(&dir).unwrap();
        let lock = lock_path(&dir, "cards").unwrap();
        fs::write(&lock, "crashed writer").unwrap();
        let old = std::time::SystemTime::now() - std::time::Duration::from_secs(10 * 60);
        File::options().write(true).open(&lock).unwrap().set_modified(old).unwrap();
        assert_eq!(append_line(&dir, "cards", "", CARD).unwrap(), AppendResult::Appended);
        assert!(!lock.exists(), "reclaimed lock must be released after the write");
        assert_eq!(read_log(&dir, "cards").unwrap().content, format!("{CARD}\n"));
        // 新鲜的锁（刚写的）仍然是别的写者在用：Busy，不动它。
        fs::write(&lock, "live writer").unwrap();
        assert_eq!(append_line(&dir, "cards", &format!("{CARD}\n"), USAGE).unwrap(), AppendResult::Busy);
        assert_eq!(fs::read_to_string(&lock).unwrap(), "live writer");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn contract_rejects_multiline_invalid_json_and_missing_string_fields() {
        let dir = temp_dir("invalid");
        for line in ["{}", r#"{"id":1,"observedAt":"now"}"#,
            r#"{"id":"x","observedAt":null}"#, "not-json", "{}\n{}"] {
            assert!(append_line(&dir, "usage", "", line).is_err());
        }
        assert!(!dir.exists());
    }

    #[test]
    fn hash_cas_and_rewrite_follow_the_same_lock_contract() {
        let dir = temp_dir("hash");
        let written = append_line_by_hash(&dir, "cards", &content_sha256(""), CARD).unwrap();
        let first = read_log(&dir, "cards").unwrap().content;
        assert_eq!(written, HashedWrite { status: AppendResult::Appended, bytes: first.len() as u64, sha256: content_sha256(&first) });
        let stat = stat_log(&dir, "cards").unwrap();
        assert_eq!(stat.bytes as usize, first.len());
        assert_eq!(stat.sha256, content_sha256(&first));
        // 过期指纹 → Conflict，文件不变，回执带回真实指纹。
        let conflict = append_line_by_hash(&dir, "cards", &content_sha256(""), USAGE).unwrap();
        assert_eq!(conflict.status, AppendResult::Conflict);
        assert_eq!(conflict.sha256, stat.sha256);
        assert_eq!(read_log(&dir, "cards").unwrap().content, first);
        // 大写指纹同样接受。
        assert_eq!(append_line_by_hash(&dir, "cards", &stat.sha256.to_ascii_uppercase(), USAGE).unwrap().status, AppendResult::Appended);
        let second = read_log(&dir, "cards").unwrap().content;
        assert_eq!(second, format!("{first}{USAGE}\n"));
        // 重写：指纹不符拒绝；指纹相符则换名，并留下 .bak 备份原文。
        let compact = format!("{CARD}\n");
        assert_eq!(rewrite_log(&dir, "cards", &content_sha256(&first), &compact).unwrap().status, AppendResult::Conflict);
        assert_eq!(read_log(&dir, "cards").unwrap().content, second);
        assert!(rewrite_log(&dir, "cards", &content_sha256(&second), "{}\n").is_err());
        assert!(rewrite_log(&dir, "cards", &content_sha256(&second), CARD).is_err());
        let rewritten = rewrite_log(&dir, "cards", &content_sha256(&second), &compact).unwrap();
        assert_eq!(rewritten, HashedWrite { status: AppendResult::Appended, bytes: compact.len() as u64, sha256: content_sha256(&compact) });
        assert_eq!(read_log(&dir, "cards").unwrap().content, compact);
        assert_eq!(fs::read_to_string(dir.join("card-decisions.jsonl.bak")).unwrap(), second);
        assert!(!dir.join("card-decisions.jsonl.tmp").exists());
        assert!(!dir.join("card-decisions.jsonl.lock").exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn read_errors_are_not_reported_as_empty_logs() {
        let dir = temp_dir("read-error");
        fs::create_dir_all(log_path(&dir, "usage").unwrap()).unwrap();
        assert!(read_log(&dir, "usage").is_err());
        fs::remove_dir_all(dir).unwrap();
    }
}
