//! 数据层纯数据模型（RR08）。
//! 字段对齐参考实现 codex-cockpit src-tauri/src/models.rs（MIT，TRUTH §1 来源 3）；
//! v1 只走 codex app-server 路径，裁剪其不产出的 monthly/balance/resetCreditExpiresAt 字段。

use serde::{Deserialize, Serialize};

/// 用量窗口（周窗/短窗共用形状）。出处：参考 models.rs UsageWindow（camelCase serde）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UsageWindow {
    pub remaining_percent: f64,
    pub resets_at: Option<String>,
    pub window_seconds: u64,
}

/// 官方接口原始元数据（对账留档）。出处：参考 models.rs RateLimitSnapshot。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RateLimitSnapshot {
    pub source: String,
    pub used_percent: f64,
    pub window_duration_mins: Option<u64>,
    pub resets_at: Option<String>,
    pub observed_at: String,
}

/// 单 provider 快照。出处：参考 models.rs ProviderSnapshot（裁剪见模块注释）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSnapshot {
    pub provider: String,
    pub display_name: String,
    pub plan: Option<String>,
    pub short_window: Option<UsageWindow>,
    pub weekly_window: Option<UsageWindow>,
    pub reset_credits: Option<u64>,
    pub rate_limit_snapshot: Option<RateLimitSnapshot>,
    pub updated_at: String,
    pub status: String,
    pub message: Option<String>,
}

impl ProviderSnapshot {
    /// 失败快照（unavailable/signed_out 等）。出处：参考 models.rs ProviderSnapshot::failure。
    pub fn failure(status: &str, message: &str) -> Self {
        Self {
            provider: "codex".into(),
            display_name: "CODEX".into(),
            plan: None,
            short_window: None,
            weekly_window: None,
            reset_credits: None,
            rate_limit_snapshot: None,
            updated_at: chrono::Utc::now().to_rfc3339(),
            status: status.into(),
            message: Some(message.into()),
        }
    }
}
