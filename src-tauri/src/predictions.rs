//! RR15：固定应用配置目录的预测日志IO，不实现日期/漂移/幂等业务规则。
//! ARCHITECTURE §2、D025；候选与判重唯一源src/lib/predictions.ts。
use std::{fs::{self, File, OpenOptions}, io::Write, path::{Path, PathBuf}};
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogRead { pub path: String, pub content: String }

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AppendResult { Appended, Conflict, Busy }

pub fn log_path(dir: &Path) -> PathBuf { dir.join("predictions.jsonl") }

pub fn read_log(dir: &Path) -> Result<LogRead, String> {
    let path = log_path(dir);
    let content = match fs::read_to_string(&path) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(error) => return Err(format!("prediction log read failed: {error}")),
    };
    Ok(LogRead { path: path.to_string_lossy().into_owned(), content })
}

/// Rust与Node共享create_new锁。只释放本次成功获得的锁；不猜他人锁是否过期。
struct FileLock { file: Option<File>, path: PathBuf }
impl Drop for FileLock {
    fn drop(&mut self) {
        drop(self.file.take()); // Windows先关句柄再删自己的锁文件。
        let _ = fs::remove_file(&self.path);
    }
}

/// expectedContent是核心判重所依据的原文；持锁CAS保证竞争者不能重复追加。
pub fn append_line(dir: &Path, expected_content: &str, line: &str) -> Result<AppendResult, String> {
    if line.contains(['\n', '\r']) { return Err("prediction record must be one JSON line".into()); }
    let value: serde_json::Value = serde_json::from_str(line).map_err(|e| format!("invalid prediction JSON: {e}"))?;
    if !value.is_object() || !value["date"].is_string() || !value["predictedRisk"].is_number()
        || !value["factorsDigest"].is_string() || !value["fetchedAt"].is_string() {
        return Err("prediction record missing contract fields".into());
    }
    fs::create_dir_all(dir).map_err(|e| format!("prediction directory failed: {e}"))?;
    let lock_path = dir.join("predictions.jsonl.lock");
    let file = match OpenOptions::new().write(true).create_new(true).open(&lock_path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => return Ok(AppendResult::Busy),
        Err(error) => return Err(format!("prediction lock failed: {error}")),
    };
    let mut lock = FileLock { file: Some(file), path: lock_path };
    // 仅诊断持有者，不据此自动删锁（进程崩溃需确认无写者后恢复）。
    lock.file.as_mut().unwrap().write_all(format!("{{\"pid\":{},\"createdAt\":\"{}\"}}\n",
        std::process::id(), chrono::Utc::now().to_rfc3339()).as_bytes())
        .map_err(|e| format!("prediction lock metadata failed: {e}"))?;
    let current = read_log(dir)?.content;
    if current != expected_content { return Ok(AppendResult::Conflict); }
    let mut file = OpenOptions::new().append(true).create(true).open(log_path(dir))
        .map_err(|e| format!("prediction append open failed: {e}"))?;
    let separator = if !current.is_empty() && !current.ends_with('\n') { "\n" } else { "" };
    file.write_all(format!("{separator}{line}\n").as_bytes()).map_err(|e| format!("prediction append failed: {e}"))?;
    file.sync_data().map_err(|e| format!("prediction sync failed: {e}"))?;
    Ok(AppendResult::Appended)
}

#[cfg(test)]
mod tests {
    use super::*;
    const ROW: &str = r#"{"date":"2026-10-11","predictedRisk":25.4,"factorsDigest":"weekday=3","fetchedAt":"2026-10-11T05:00:00Z"}"#;
    fn temp_dir(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("reset-radar-predictions-{name}-{}-{}", std::process::id(), chrono::Utc::now().timestamp_nanos_opt().unwrap()))
    }
    #[test]
    fn cold_read_and_compare_append_roundtrip() {
        let dir = temp_dir("roundtrip");
        assert_eq!(read_log(&dir).unwrap().content, "");
        assert_eq!(append_line(&dir, "", ROW).unwrap(), AppendResult::Appended);
        assert_eq!(read_log(&dir).unwrap().content, format!("{ROW}\n"));
        // 同一过期读取不能再次追加；业务是否需补行仍由TS决定。
        assert_eq!(append_line(&dir, "", ROW).unwrap(), AppendResult::Conflict);
        assert_eq!(read_log(&dir).unwrap().content, format!("{ROW}\n"));
        assert!(!dir.join("predictions.jsonl.lock").exists());
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn preserves_bad_lines_crlf_and_unterminated_tail_bytes() {
        let dir = temp_dir("bytes"); fs::create_dir_all(&dir).unwrap();
        let original = "bad-line\r\nnot-json";
        fs::write(log_path(&dir), original).unwrap();
        append_line(&dir, original, ROW).unwrap();
        assert_eq!(fs::read(log_path(&dir)).unwrap(), format!("{original}\n{ROW}\n").as_bytes());
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn busy_lock_does_not_remove_another_writers_lock() {
        let dir = temp_dir("busy");fs::create_dir_all(&dir).unwrap();
        let lock = dir.join("predictions.jsonl.lock");fs::write(&lock, "other-writer").unwrap();
        assert_eq!(append_line(&dir, "", ROW).unwrap(), AppendResult::Busy);
        assert_eq!(fs::read_to_string(&lock).unwrap(), "other-writer");
        assert!(!log_path(&dir).exists()); fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn contract_rejects_multiline_or_invalid_data_without_files() {
        let dir = temp_dir("invalid");
        for invalid in ["{}", "not-json", "[]", "{}\n{}"] { assert!(append_line(&dir, "", invalid).is_err()); }
        assert!(!dir.exists());
    }
    #[test]
    fn read_failure_is_not_reported_as_empty_history() {
        let dir = temp_dir("read-failure");fs::create_dir_all(log_path(&dir)).unwrap();
        assert!(read_log(&dir).is_err());fs::remove_dir_all(dir).unwrap();
    }
}
