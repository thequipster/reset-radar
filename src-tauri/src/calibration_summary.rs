//! RR28：应用配置目录 calibration.json 的只读IO（脚本 refresh-calibration 是唯一写者）。
//! 零业务：不解析JSON语义、不算指标、不判新鲜度——校验与映射唯一源
//! src/lib/calibrationSummary.ts（ARCHITECTURE §2；02-spec「只读桥接」）。
use std::{fs, path::{Path, PathBuf}};
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SummaryRead { pub path: String, pub content: String }

pub fn summary_path(dir: &Path) -> PathBuf { dir.join("calibration.json") }

/// 文件缺失=空内容（TS侧判missing）；其他读取失败报错，不冒充缺失。
pub fn read_summary(dir: &Path) -> Result<SummaryRead, String> {
    let path = summary_path(dir);
    let content = match fs::read_to_string(&path) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(error) => return Err(format!("calibration summary read failed: {error}")),
    };
    Ok(SummaryRead { path: path.to_string_lossy().into_owned(), content })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_file_reads_as_empty_not_error() {
        let dir = std::env::temp_dir().join(format!("reset-radar-summary-missing-{}", std::process::id()));
        let read = read_summary(&dir).unwrap();
        assert_eq!(read.content, "");
        assert!(read.path.ends_with("calibration.json"));
    }

    #[test]
    fn roundtrip_reads_writer_bytes_verbatim() {
        let dir = std::env::temp_dir().join(format!("reset-radar-summary-round-{}-{}",
            std::process::id(), chrono::Utc::now().timestamp_nanos_opt().unwrap()));
        fs::create_dir_all(&dir).unwrap();
        let bytes = "{\"schema\":\"reset-radar/calibration@1\"}\n";
        fs::write(summary_path(&dir), bytes).unwrap();
        assert_eq!(read_summary(&dir).unwrap().content, bytes);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn read_failure_is_not_reported_as_missing() {
        // 目录占住文件路径 → 读为目录报错：必须Err，不得当空摘要（predictions.rs 同款口径）。
        let dir = std::env::temp_dir().join(format!("reset-radar-summary-fail-{}-{}",
            std::process::id(), chrono::Utc::now().timestamp_nanos_opt().unwrap()));
        fs::create_dir_all(summary_path(&dir)).unwrap();
        assert!(read_summary(&dir).is_err());
        fs::remove_dir_all(&dir).unwrap();
    }
}
