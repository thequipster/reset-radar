//! codex app-server 采集（RR08）：spawn `codex app-server --stdio` 走 JSON-RPC 握手
//! 读 rateLimits + rateLimitResetCredits（卡面：单次 read 同时拿两者，无 HTTP fallback）。
//! 握手序列与解析移植自参考实现 codex-cockpit src-tauri/src/codex.rs（MIT，TRUTH §1 来源 3），
//! 逐函数注明参考行号。

use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;

use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{ChildStdin, Command};
use tokio::time::timeout;

use crate::models::{ProviderSnapshot, RateLimitSnapshot, UsageWindow};

/// 周窗口时长（分钟）。出处：参考 codex.rs:27 WEEKLY_WINDOW_MINUTES。
const WEEKLY_WINDOW_MINUTES: u64 = 10_080;
/// 短窗口（5h）时长（分钟）。出处：参考 codex.rs:765 字面量 300。
const SHORT_WINDOW_MINUTES: u64 = 300;
/// app-server 响应超时。出处：参考 codex.rs:29 APP_SERVER_TIMEOUT（RR08 卡面：6s）。
const APP_SERVER_TIMEOUT: Duration = Duration::from_secs(6);

/// 定位 codex 可执行文件。出处：参考 codex.rs:588-617 codex_program
/// （CODEX_BIN → PATH 的 codex.exe/codex.cmd → home 的 AppData/Roaming/npm/codex.cmd）。
fn codex_program() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(path) = std::env::var_os("CODEX_BIN") {
        candidates.push(PathBuf::from(path));
    }
    if let Some(path) = std::env::var_os("PATH") {
        let directories: Vec<_> = std::env::split_paths(&path).collect();
        for directory in &directories {
            #[cfg(windows)]
            candidates.push(directory.join("codex.exe"));
            #[cfg(not(windows))]
            candidates.push(directory.join("codex"));
        }
        #[cfg(windows)]
        for directory in &directories {
            candidates.push(directory.join("codex.cmd"));
        }
    }
    if let Some(home) = dirs::home_dir() {
        #[cfg(not(windows))]
        candidates.push(home.join(".local/bin/codex"));
        #[cfg(windows)]
        candidates.push(home.join("AppData/Roaming/npm/codex.cmd"));
    }
    candidates.into_iter().find(|path| path.is_file())
}

/// 多键名取数（官方接口 camel/snake 两态兼容）。出处：参考 codex.rs:125-129。
fn number_with_key<'a>(value: &'a Value, keys: &[&'a str]) -> Option<(&'a str, f64)> {
    keys.iter()
        .find_map(|key| value.get(*key)?.as_f64().map(|number| (*key, number)))
}

/// u64 取数（负数拒收）。出处：参考 codex.rs:130-137 integer。
fn integer(value: &Value, keys: &[&str]) -> Option<u64> {
    keys.iter().find_map(|key| {
        let value = value.get(*key)?;
        value
            .as_u64()
            .or_else(|| value.as_i64().and_then(|item| u64::try_from(item).ok()))
    })
}

/// 时间戳取数：字符串直通 / Unix 秒转 RFC3339。出处：参考 codex.rs:139-151 timestamp。
fn timestamp(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        let item = value.get(*key)?;
        if let Some(text) = item.as_str() {
            return Some(text.to_owned());
        }
        item.as_i64()
            .and_then(|seconds| chrono::DateTime::from_timestamp(seconds, 0))
            .map(|time| time.to_rfc3339())
    })
}

/// 写一行 JSON-RPC 请求。出处：参考 codex.rs:620-628 write_app_server_request。
async fn write_app_server_request(stdin: &mut ChildStdin, value: Value) -> Result<(), String> {
    let mut line = serde_json::to_vec(&value)
        .map_err(|_| "Codex App Server request could not be encoded.".to_string())?;
    line.push(b'\n');
    stdin
        .write_all(&line)
        .await
        .map_err(|_| "Codex App Server did not accept the request.".to_string())
}

/// spawn app-server 完成握手并读回 rateLimits 结果。
/// 序列：initialize(id=1) → initialized(通知) → account/rateLimits/read(id=2)。
/// 出处：参考 codex.rs:630-703 read_app_server_rate_limits
/// （kill_on_drop + Windows CREATE_NO_WINDOW=0x0800_0000 + 6s 超时 + id=2 过滤）。
async fn read_app_server_rate_limits() -> Result<(Value, String), String> {
    let program = codex_program().ok_or_else(|| "Codex App Server was not found.".to_string())?;
    let mut command = Command::new(program);
    #[cfg(windows)]
    command.creation_flags(0x0800_0000);
    let mut child = command
        .args(["app-server", "--stdio"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .map_err(|_| "Codex App Server could not be started.".to_string())?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Codex App Server stdin is unavailable.".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Codex App Server stdout is unavailable.".to_string())?;

    let requests = [
        json!({
            "id": 1,
            "method": "initialize",
            "params": {"clientInfo": {"name": "reset-radar", "version": env!("CARGO_PKG_VERSION")}}
        }),
        json!({"method": "initialized"}),
        json!({"id": 2, "method": "account/rateLimits/read", "params": null}),
    ];
    for request in requests {
        if let Err(error) = write_app_server_request(&mut stdin, request).await {
            let _ = child.kill().await;
            let _ = child.wait().await;
            return Err(error);
        }
    }
    stdin
        .flush()
        .await
        .map_err(|_| "Codex App Server did not flush the request.".to_string())?;

    let mut lines = BufReader::new(stdout).lines();
    let response = timeout(APP_SERVER_TIMEOUT, async {
        loop {
            let line = lines
                .next_line()
                .await
                .map_err(|_| "Codex App Server output could not be read.".to_string())?
                .ok_or_else(|| {
                    "Codex App Server stopped before returning quota data.".to_string()
                })?;
            let Ok(value) = serde_json::from_str::<Value>(&line) else {
                continue;
            };
            if value.get("id").and_then(Value::as_i64) != Some(2) {
                continue;
            }
            if value.get("error").is_some() {
                return Err("Codex App Server rejected the quota read.".to_string());
            }
            return value
                .get("result")
                .cloned()
                .ok_or_else(|| "Codex App Server returned no quota result.".to_string());
        }
    })
    .await
    .map_err(|_| "Codex App Server quota read timed out.".to_string())?;
    let _ = child.kill().await;
    let _ = child.wait().await;
    Ok((response?, chrono::Utc::now().to_rfc3339()))
}

/// 窗口解析：remaining=100-used（clamp 0..100）、分钟转秒。出处：参考 codex.rs:705-717。
fn parse_app_server_window(value: &Value) -> Option<UsageWindow> {
    let used_percent = number_with_key(value, &["usedPercent", "used_percent"])?.1;
    if !used_percent.is_finite() {
        return None;
    }
    Some(UsageWindow {
        remaining_percent: (100.0 - used_percent).clamp(0.0, 100.0),
        resets_at: timestamp(value, &["resetsAt", "resets_at"]),
        window_seconds: integer(value, &["windowDurationMins", "window_duration_mins"])
            .unwrap_or_default()
            .saturating_mul(60),
    })
}

/// 定位 codex 限额桶：优先 rateLimitsByLimitId.codex。出处：参考 codex.rs:719-725。
fn find_app_server_bucket(result: &Value) -> Option<&Value> {
    result
        .get("rateLimitsByLimitId")
        .and_then(|value| value.get("codex"))
        .or_else(|| result.get("rateLimits"))
}

/// 在 primary/secondary 中按 windowDurationMins 挑出目标窗口。
/// 出处：参考 codex.rs:726-751 find_app_server_window（含无 duration 元数据时的
/// 单窗 legacy 兜底——仅在无歧义时使用，防止 5h 窗被误标为周窗）。
fn find_app_server_window(bucket: &Value, expected_minutes: u64) -> Option<&Value> {
    let windows = ["primary", "secondary"]
        .iter()
        .filter_map(|key| bucket.get(*key));
    if let Some(window) = windows.clone().find(|value| {
        integer(value, &["windowDurationMins", "window_duration_mins"])
            .is_some_and(|minutes| minutes.abs_diff(expected_minutes) <= 1)
    }) {
        return Some(window);
    }
    if expected_minutes == WEEKLY_WINDOW_MINUTES {
        let mut usable = windows.filter(|value| {
            number_with_key(value, &["usedPercent", "used_percent"]).is_some()
                && integer(value, &["windowDurationMins", "window_duration_mins"]).is_none()
        });
        let first = usable.next();
        if first.is_some() && usable.next().is_none() {
            return first;
        }
    }
    None
}

/// 组装 ProviderSnapshot（周窗必选/短窗可选/credits/plan）。
/// 出处：参考 codex.rs:753-810 parse_app_server_snapshot。
fn parse_app_server_snapshot(result: &Value, observed_at: String) -> Result<ProviderSnapshot, String> {
    let bucket = find_app_server_bucket(result)
        .ok_or_else(|| "Codex App Server response has no Codex quota bucket.".to_string())?;
    let weekly_value = find_app_server_window(bucket, WEEKLY_WINDOW_MINUTES)
        .ok_or_else(|| "Codex App Server response has no usable quota window.".to_string())?;
    let weekly_window = parse_app_server_window(weekly_value)
        .ok_or_else(|| "Codex App Server weekly quota window is incomplete.".to_string())?;
    let used_percent = number_with_key(weekly_value, &["usedPercent", "used_percent"])
        .map(|(_, value)| value.clamp(0.0, 100.0))
        .ok_or_else(|| "Codex App Server weekly usage is missing.".to_string())?;
    let short_window = ["primary", "secondary"]
        .iter()
        .filter_map(|key| bucket.get(*key))
        .find(|value| {
            integer(value, &["windowDurationMins", "window_duration_mins"])
                .is_some_and(|minutes| minutes.abs_diff(SHORT_WINDOW_MINUTES) <= 1)
        })
        .and_then(parse_app_server_window);
    let reset_credits = result
        .get("rateLimitResetCredits")
        .and_then(|value| integer(value, &["availableCount", "available_count"]));
    let plan = bucket
        .get("planType")
        .and_then(Value::as_str)
        .map(|value| value.to_uppercase());
    let rate_limit_snapshot = RateLimitSnapshot {
        source: "app-server".into(),
        used_percent,
        window_duration_mins: integer(
            weekly_value,
            &["windowDurationMins", "window_duration_mins"],
        ),
        resets_at: timestamp(weekly_value, &["resetsAt", "resets_at"]),
        observed_at: observed_at.clone(),
    };
    Ok(ProviderSnapshot {
        provider: "codex".into(),
        display_name: "CODEX".into(),
        plan,
        short_window,
        weekly_window: Some(weekly_window),
        reset_credits,
        rate_limit_snapshot: Some(rate_limit_snapshot),
        updated_at: observed_at,
        status: "ok".into(),
        message: None,
    })
}

/// 采集入口：失败降级为 unavailable 快照（由 SWR 后台循环重试）。v1 无 legacy HTTP 路径。
pub async fn fetch_snapshot() -> ProviderSnapshot {
    match read_app_server_rate_limits().await {
        Ok((result, observed_at)) => match parse_app_server_snapshot(&result, observed_at) {
            Ok(snapshot) => snapshot,
            Err(message) => ProviderSnapshot::failure("unavailable", &message),
        },
        Err(message) => ProviderSnapshot::failure("unavailable", &message),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 官方 app-server 响应夹具。出处：参考 codex.rs:1168-1198（原样移植）。
    fn official_result() -> Value {
        json!({
            "rateLimits": {
                "limitId": "codex",
                "primary": {
                    "usedPercent": 26,
                    "windowDurationMins": 10080,
                    "resetsAt": 1787200981_i64
                },
                "secondary": {
                    "usedPercent": 7,
                    "windowDurationMins": 300,
                    "resetsAt": 1786400000_i64
                },
                "planType": "prolite"
            },
            "rateLimitsByLimitId": {
                "codex": {
                    "primary": {
                        "usedPercent": 26,
                        "windowDurationMins": 10080,
                        "resetsAt": 1787200981_i64
                    },
                    "secondary": {
                        "usedPercent": 7,
                        "windowDurationMins": 300,
                        "resetsAt": 1786400000_i64
                    },
                    "planType": "prolite"
                },
                "codex_bengalfox": {
                    "primary": {
                        "usedPercent": 99,
                        "windowDurationMins": 10080,
                        "resetsAt": 1787200981_i64
                    }
                }
            },
            "rateLimitResetCredits": {"availableCount": 0}
        })
    }

    /// 出处：参考 codex.rs:1167-1215 parses_official_app_server_weekly_snapshot（断言原样）。
    #[test]
    fn parses_official_app_server_weekly_snapshot() {
        let snapshot =
            parse_app_server_snapshot(&official_result(), "2026-08-13T08:30:00Z".into())
                .expect("official app-server snapshot");
        assert_eq!(snapshot.plan.as_deref(), Some("PROLITE"));
        assert_eq!(snapshot.weekly_window.unwrap().remaining_percent, 74.0);
        assert_eq!(snapshot.short_window.unwrap().remaining_percent, 93.0);
        assert_eq!(snapshot.reset_credits, Some(0));
        let official = snapshot.rate_limit_snapshot.expect("official metadata");
        assert_eq!(official.source, "app-server");
        assert_eq!(official.used_percent, 26.0);
        assert_eq!(official.window_duration_mins, Some(WEEKLY_WINDOW_MINUTES));
        assert_eq!(
            official.resets_at.as_deref(),
            Some("2026-08-20T04:43:01+00:00")
        );
    }

    /// 出处：参考 codex.rs:1218-1228 does_not_mislabel_short_app_server_window_as_weekly。
    #[test]
    fn does_not_mislabel_short_app_server_window_as_weekly() {
        let result = json!({
            "rateLimits": {
                "primary": {"usedPercent": 26, "windowDurationMins": 300},
                "secondary": null
            }
        });
        let error = parse_app_server_snapshot(&result, "2026-08-13T08:30:00Z".into())
            .expect_err("short-only response should not be accepted as weekly");
        assert!(error.contains("no usable quota window"));
    }

    /// bucket 优先级：rateLimitsByLimitId.codex 压过顶层 rateLimits。
    /// 出处：参考 codex.rs:719-725 find_app_server_bucket 的 or_else 顺序。
    #[test]
    fn prefers_rate_limits_by_limit_id_bucket() {
        let mut result = official_result();
        result["rateLimits"]["primary"]["usedPercent"] = json!(99);
        let snapshot =
            parse_app_server_snapshot(&result, "2026-08-13T08:30:00Z".into()).unwrap();
        assert_eq!(snapshot.weekly_window.unwrap().remaining_percent, 74.0);
    }

    /// remaining clamp 边界：used=100 → remaining=0。出处：参考 codex.rs:712 clamp(0.0,100.0)。
    #[test]
    fn clamps_remaining_into_0_100() {
        let window = parse_app_server_window(&json!({
            "usedPercent": 100,
            "windowDurationMins": 10080
        }))
        .unwrap();
        assert_eq!(window.remaining_percent, 0.0);
    }

    /// snake_case 键名兼容（resets_at 字符串直通）。出处：参考 codex.rs:125-151 双键名工具。
    #[test]
    fn accepts_snake_case_keys() {
        let window = parse_app_server_window(&json!({
            "used_percent": 40,
            "resets_at": "2026-08-20T00:00:00Z",
            "window_duration_mins": 10080
        }))
        .unwrap();
        assert_eq!(window.remaining_percent, 60.0);
        assert_eq!(window.window_seconds, 604_800);
        assert_eq!(window.resets_at.as_deref(), Some("2026-08-20T00:00:00Z"));
    }

    /// Unix 秒 → RFC3339。出处：参考 codex.rs:139-151 timestamp 与 :1211 断言原文。
    #[test]
    fn timestamp_converts_unix_seconds_to_rfc3339() {
        let value = json!({"resetsAt": 1787200981_i64});
        assert_eq!(
            timestamp(&value, &["resetsAt"]).as_deref(),
            Some("2026-08-20T04:43:01+00:00")
        );
    }
}
