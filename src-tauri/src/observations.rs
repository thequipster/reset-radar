//! RR46: 观测与用卡建议 JSONL 的通用 IO 薄壳。
//! 不解释金额、预测字段或决策语义；算法唯一源在 src/lib。
use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

use serde::Serialize;

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogRead {
    pub path: String,
    pub content: String,
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

/// expected_content 是调用者据以构造追加行的原文；持锁 CAS 防止并发覆盖或重复写入。
pub fn append_line(
    dir: &Path,
    kind: &str,
    expected_content: &str,
    line: &str,
) -> Result<AppendResult, String> {
    let path = log_path(dir, kind)?;
    let lock_path = lock_path(dir, kind)?;
    if line.contains(['\n', '\r']) {
        return Err("observation record must be one JSON line".into());
    }
    let value: serde_json::Value =
        serde_json::from_str(line).map_err(|error| format!("invalid observation JSON: {error}"))?;
    if !value.is_object() || !value["id"].is_string() || !value["observedAt"].is_string() {
        return Err("observation record requires string id and observedAt".into());
    }

    fs::create_dir_all(dir).map_err(|error| format!("observation directory failed: {error}"))?;
    let lock_file = match OpenOptions::new().write(true).create_new(true).open(&lock_path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            return Ok(AppendResult::Busy)
        }
        Err(error) => return Err(format!("observation lock failed: {error}")),
    };
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

    let current = read_log(dir, kind)?.content;
    if current != expected_content {
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
    fn contract_rejects_multiline_invalid_json_and_missing_string_fields() {
        let dir = temp_dir("invalid");
        for line in ["{}", r#"{"id":1,"observedAt":"now"}"#,
            r#"{"id":"x","observedAt":null}"#, "not-json", "{}\n{}"] {
            assert!(append_line(&dir, "usage", "", line).is_err());
        }
        assert!(!dir.exists());
    }

    #[test]
    fn read_errors_are_not_reported_as_empty_logs() {
        let dir = temp_dir("read-error");
        fs::create_dir_all(log_path(&dir, "usage").unwrap()).unwrap();
        assert!(read_log(&dir, "usage").is_err());
        fs::remove_dir_all(dir).unwrap();
    }
}
