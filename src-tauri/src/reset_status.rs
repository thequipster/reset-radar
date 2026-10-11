//! codex-resets.com /api/v1/status 运行时快照。
//! 计划公告保留为上游事实，不把计划状态解释成已发生事件或概率。

use std::time::Duration;

use chrono::{DateTime, SecondsFormat, Utc};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::time::Instant;

/// 公开端点：TRUTH §2 B07。
const STATUS_URL: &str = "https://codex-resets.com/api/v1/status";
/// 上游4秒总超时，出处：参考reset_forecast.rs:334。
const REQUEST_TIMEOUT: Duration = Duration::from_secs(4);
/// 运行时轮询周期，出处：BACKLOG RR23。
pub const STATUS_POLL_INTERVAL: Duration = Duration::from_secs(15 * 60);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledResetSource {
    #[serde(rename = "type")]
    pub source_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledReset {
    pub id: String,
    pub status: String,
    #[serde(alias = "reset_type")]
    pub reset_type: String,
    #[serde(alias = "announced_at")]
    pub announced_at: String,
    #[serde(alias = "scheduled_for")]
    pub scheduled_for: String,
    pub text: String,
    pub source: ScheduledResetSource,
}

/// 公告/API快照，与Codex额度快照生命周期独立。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ResetStatusSnapshot {
    pub scheduled_reset: Option<ScheduledReset>,
    pub active_watch: Option<Value>,
    pub latest_reset: Option<Value>,
    pub fetched_at: Option<String>,
    pub fresh_until: Option<String>,
    pub generated_at: Option<String>,
    pub last_attempt_at: String,
    pub status: String,
    pub message: Option<String>,
}

pub struct ResetStatusService {
    client: Result<Client, String>,
    snapshot: Option<ResetStatusSnapshot>,
    /// 单调尝试锚点；磁盘快照启动时不建立新锚点，首刷必须实拉。
    last_attempt_instant: Option<Instant>,
}

impl ResetStatusService {
    /// 可用磁盘缓存作为旧数据，但不信任持久化的单调年龄；首次必联网。
    pub fn new(saved: Option<ResetStatusSnapshot>) -> Self {
        let client = Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()
            .map_err(|error| format!("status client construction failed: {error}"));
        Self {
            client,
            snapshot: saved,
            last_attempt_instant: None,
        }
    }

    /// 周期内返回来源缓存，到边界后刷新。
    pub async fn snapshot(&mut self) -> ResetStatusSnapshot {
        let now = Instant::now();
        if !self.refresh_due(now) {
            if let Some(snapshot) = &self.snapshot {
                return snapshot.clone();
            }
        }

        let attempted_at = Utc::now().to_rfc3339_opts(SecondsFormat::AutoSi, true);
        let result = self.fetch().await;
        self.apply_fetch_result(result, &attempted_at, Instant::now());
        self.snapshot.clone().unwrap_or_else(|| ResetStatusSnapshot {
            scheduled_reset: None,
            active_watch: None,
            latest_reset: None,
            fetched_at: None,
            fresh_until: None,
            generated_at: None,
            last_attempt_at: attempted_at,
            status: "error".into(),
            message: Some("status fetch produced no snapshot".into()),
        })
    }

    fn refresh_due(&self, now: Instant) -> bool {
        self.last_attempt_instant
            .map(|last| now.duration_since(last) >= STATUS_POLL_INTERVAL)
            .unwrap_or(true)
    }

    async fn fetch(&self) -> Result<ResetStatusSnapshot, String> {
        let client = self.client.as_ref().map_err(|error| error.to_owned())?;
        let response = client
            .get(STATUS_URL)
            .header(reqwest::header::ACCEPT, "application/json")
            .send()
            .await
            .map_err(|error| format!("status request failed: {error}"))?
            .error_for_status()
            .map_err(|error| format!("status endpoint returned an error: {error}"))?;
        let raw = response
            .text()
            .await
            .map_err(|error| format!("status response read failed: {error}"))?;
        let fetched_at = Utc::now().to_rfc3339_opts(SecondsFormat::AutoSi, true);
        parse_status(&raw, &fetched_at)
    }

    fn apply_fetch_result(
        &mut self,
        result: Result<ResetStatusSnapshot, String>,
        attempted_at: &str,
        attempted_instant: Instant,
    ) {
        self.last_attempt_instant = Some(attempted_instant);
        match result {
            Ok(mut snapshot) => {
                snapshot.status = "ok".into();
                snapshot.message = None;
                snapshot.last_attempt_at = attempted_at.to_owned();
                self.snapshot = Some(snapshot);
            }
            Err(message) => {
                let snapshot = self.snapshot.get_or_insert_with(|| ResetStatusSnapshot {
                    scheduled_reset: None,
                    active_watch: None,
                    latest_reset: None,
                    fetched_at: None,
                    fresh_until: None,
                    generated_at: None,
                    last_attempt_at: attempted_at.to_owned(),
                    status: "error".into(),
                    message: Some(message.clone()),
                });
                snapshot.last_attempt_at = attempted_at.to_owned();
                snapshot.status = "error".into();
                snapshot.message = Some(message);
            }
        }
    }
}

impl Default for ResetStatusService {
    fn default() -> Self {
        Self::new(None)
    }
}

/// 解析与校验上游信封，不执行IO。
pub fn parse_status(raw: &str, fetched_at: &str) -> Result<ResetStatusSnapshot, String> {
    let fetched_at_parsed = DateTime::parse_from_rfc3339(fetched_at)
        .map_err(|error| format!("invalid fetched_at RFC3339 timestamp: {error}"))?;
    let fetched_at_utc = fetched_at_parsed.with_timezone(&Utc);
    let fresh_until = (fetched_at_utc + chrono::Duration::from_std(STATUS_POLL_INTERVAL)
        .map_err(|error| format!("invalid polling interval: {error}"))?)
    .to_rfc3339_opts(SecondsFormat::AutoSi, true);

    let root: Value = serde_json::from_str(raw)
        .map_err(|error| format!("invalid status JSON: {error}"))?;
    let data = root
        .get("data")
        .and_then(Value::as_object)
        .ok_or_else(|| "status response missing object data".to_owned())?;

    let scheduled_reset = match required(data, "scheduled_reset")? {
        Value::Null => None,
        value @ Value::Object(_) => Some(
            serde_json::from_value(value.clone())
                .map_err(|error| format!("invalid scheduled_reset object: {error}"))?,
        ),
        _ => return Err("scheduled_reset must be an object or null".into()),
    };
    let active_watch = object_or_null(required(data, "active_watch")?, "active_watch")?;
    let latest_reset = object_or_null(required(data, "latest_reset")?, "latest_reset")?;

    let meta = root
        .get("meta")
        .and_then(Value::as_object)
        .ok_or_else(|| "status response missing object meta".to_owned())?;
    let generated_at = match meta.get("generated_at") {
        None | Some(Value::Null) => None,
        Some(Value::String(value)) => Some(value.clone()),
        Some(_) => return Err("meta.generated_at must be a string or null".into()),
    };

    Ok(ResetStatusSnapshot {
        scheduled_reset,
        active_watch,
        latest_reset,
        fetched_at: Some(fetched_at.to_owned()),
        fresh_until: Some(fresh_until),
        generated_at,
        last_attempt_at: fetched_at.to_owned(),
        status: "ok".into(),
        message: None,
    })
}

fn required<'a>(
    data: &'a serde_json::Map<String, Value>,
    key: &str,
) -> Result<&'a Value, String> {
    data.get(key)
        .ok_or_else(|| format!("status response missing data.{key}"))
}

fn object_or_null(value: &Value, key: &str) -> Result<Option<Value>, String> {
    match value {
        Value::Null => Ok(None),
        Value::Object(_) => Ok(Some(value.clone())),
        _ => Err(format!("data.{key} must be an object or null")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const FETCHED_AT: &str = "2026-10-11T05:00:00Z";
    const RAW: &str = r#"{
      "data": {
        "scheduled_reset": {
          "id": "r-1", "status": "scheduled", "reset_type": "regular",
          "announced_at": "2026-10-10T22:16:00Z", "scheduled_for": "2026-10-11T07:00:00Z",
          "text": "Global reset by EOD", "source": {"type": "tracker", "author": "Ada", "url": "https://example.test/source"}
        },
        "active_watch": {"reset_chance_percent": 80, "text": "watch"},
        "latest_reset": {"id": "r-0", "announced_at": "2026-10-08T00:00:00Z"}
      },
      "meta": {"generated_at": "2026-10-11T04:59:00Z"}
    }"#;

    fn sample_snapshot() -> ResetStatusSnapshot {
        parse_status(RAW, FETCHED_AT).unwrap()
    }

    fn raw_with_data(data: Value) -> String {
        json!({ "data": data, "meta": { "generated_at": "2026-10-11T04:59:00Z" } }).to_string()
    }

    #[test]
    fn parses_status_contract_and_preserves_upstream_fields() {
        let snapshot = parse_status(RAW, FETCHED_AT).unwrap();
        let reset = snapshot.scheduled_reset.unwrap();
        assert_eq!(reset.reset_type, "regular");
        assert_eq!(reset.announced_at, "2026-10-10T22:16:00Z");
        assert_eq!(reset.scheduled_for, "2026-10-11T07:00:00Z");
        assert_eq!(reset.text, "Global reset by EOD");
        assert_eq!(reset.source.source_type, "tracker");
        assert_eq!(reset.source.author.as_deref(), Some("Ada"));
        assert_eq!(snapshot.generated_at.as_deref(), Some("2026-10-11T04:59:00Z"));
        assert_eq!(snapshot.fetched_at.as_deref(), Some(FETCHED_AT));
        assert_eq!(snapshot.fresh_until.as_deref(), Some("2026-10-11T05:15:00Z"));
        assert_eq!(snapshot.status, "ok");
    }

    #[test]
    fn successful_null_schedule_replaces_the_previous_plan() {
        let mut service = ResetStatusService::new(Some(sample_snapshot()));
        let raw = raw_with_data(json!({
            "scheduled_reset": null,
            "active_watch": null,
            "latest_reset": null
        }));
        let fresh = parse_status(&raw, "2026-10-11T05:10:00Z").unwrap();
        service.apply_fetch_result(Ok(fresh), "2026-10-11T05:10:00Z", Instant::now());
        let snapshot = service.snapshot.as_ref().unwrap();
        assert_eq!(snapshot.status, "ok");
        assert!(snapshot.scheduled_reset.is_none());
        assert!(snapshot.active_watch.is_none());
        assert!(snapshot.latest_reset.is_none());
    }

    #[test]
    fn cached_success_is_reused_until_the_poll_interval_boundary() {
        let mut service = ResetStatusService::new(Some(sample_snapshot()));
        let start = Instant::now();
        service.last_attempt_instant = Some(start);
        assert!(!service.refresh_due(start + Duration::from_secs(899)));
        assert!(service.refresh_due(start + Duration::from_secs(900)));

        // 磁盘快照没有单调锚点，首次调用必须执行真实请求。
        let saved = ResetStatusService::new(Some(sample_snapshot()));
        assert!(saved.refresh_due(start));
    }

    #[test]
    fn fetch_error_preserves_last_success_fields_and_updates_attempt_state() {
        let mut service = ResetStatusService::new(Some(sample_snapshot()));
        let before = service.snapshot.as_ref().unwrap().clone();
        service.apply_fetch_result(
            Err("network timeout".into()),
            "2026-10-11T05:20:00Z",
            Instant::now(),
        );
        let after = service.snapshot.as_ref().unwrap();
        assert_eq!(after.scheduled_reset, before.scheduled_reset);
        assert_eq!(after.active_watch, before.active_watch);
        assert_eq!(after.latest_reset, before.latest_reset);
        assert_eq!(after.fetched_at, before.fetched_at);
        assert_eq!(after.fresh_until, before.fresh_until);
        assert_eq!(after.generated_at, before.generated_at);
        assert_eq!(after.status, "error");
        assert_eq!(after.message.as_deref(), Some("network timeout"));
        assert_eq!(after.last_attempt_at, "2026-10-11T05:20:00Z");
    }

    #[test]
    fn error_without_saved_data_returns_an_error_snapshot() {
        let mut service = ResetStatusService::new(None);
        service.apply_fetch_result(
            Err("offline".into()),
            "2026-10-11T05:20:00Z",
            Instant::now(),
        );
        let snapshot = service.snapshot.as_ref().unwrap();
        assert_eq!(snapshot.status, "error");
        assert_eq!(snapshot.message.as_deref(), Some("offline"));
        assert!(snapshot.fetched_at.is_none());
        assert!(snapshot.fresh_until.is_none());
    }

    #[test]
    fn required_keys_and_json_shapes_are_validated() {
        for missing in ["scheduled_reset", "active_watch", "latest_reset"] {
            let mut data = json!({
                "scheduled_reset": null,
                "active_watch": null,
                "latest_reset": null
            });
            data.as_object_mut().unwrap().remove(missing);
            assert!(parse_status(&raw_with_data(data), FETCHED_AT).is_err(), "{missing}");
        }
        for (key, value) in [
            ("scheduled_reset", json!("not-object")),
            ("active_watch", json!([])),
            ("latest_reset", json!(false)),
        ] {
            let mut data = json!({
                "scheduled_reset": null,
                "active_watch": null,
                "latest_reset": null
            });
            data[key] = value;
            assert!(parse_status(&raw_with_data(data), FETCHED_AT).is_err(), "{key}");
        }
        assert!(parse_status(RAW, "not-rfc3339").is_err());
    }

    #[test]
    fn malformed_envelope_and_missing_or_non_object_data_meta_are_rejected() {
        assert!(parse_status("{bad json", FETCHED_AT).is_err());
        assert!(parse_status(r#"{"meta":{}}"#, FETCHED_AT).is_err());
        assert!(parse_status(r#"{"data":[],"meta":{}}"#, FETCHED_AT).is_err());

        let data = json!({
            "scheduled_reset": null,
            "active_watch": null,
            "latest_reset": null
        });
        assert!(parse_status(&json!({ "data": data }).to_string(), FETCHED_AT).is_err());
        assert!(parse_status(
            &json!({ "data": data, "meta": [] }).to_string(),
            FETCHED_AT,
        )
        .is_err());
    }

    #[test]
    fn scheduled_reset_object_requires_its_contract_fields() {
        let mut data: Value = serde_json::from_str::<Value>(RAW).unwrap()["data"].clone();
        data["scheduled_reset"].as_object_mut().unwrap().remove("scheduled_for");
        assert!(parse_status(&raw_with_data(data), FETCHED_AT).is_err());
    }

    #[tokio::test]
    async fn client_build_error_returns_error_snapshot_without_network() {
        let mut cold = ResetStatusService::new(None);
        cold.client = Err("invalid resolver".into());
        let cold_result = cold.snapshot().await;
        assert_eq!(cold_result.status, "error");
        assert!(cold_result.message.as_deref().unwrap().contains("invalid resolver"));
        assert!(cold_result.fetched_at.is_none());
        assert!(cold_result.fresh_until.is_none());
        DateTime::parse_from_rfc3339(&cold_result.last_attempt_at).unwrap();

        let saved = sample_snapshot();
        let mut warm = ResetStatusService::new(Some(saved.clone()));
        warm.client = Err("invalid resolver".into());
        let warm_result = warm.snapshot().await;
        assert_eq!(warm_result.status, "error");
        assert!(warm_result.message.as_deref().unwrap().contains("invalid resolver"));
        assert_ne!(warm_result.last_attempt_at, saved.last_attempt_at);
        assert_eq!(warm_result.fetched_at, saved.fetched_at);
        assert_eq!(warm_result.fresh_until, saved.fresh_until);
        assert_eq!(warm_result.scheduled_reset, saved.scheduled_reset);
        assert_eq!(warm_result.active_watch, saved.active_watch);
        assert_eq!(warm_result.latest_reset, saved.latest_reset);
        assert_eq!(warm_result.generated_at, saved.generated_at);
    }

    #[test]
    fn serialization_uses_camel_case_snapshot_and_announcement_keys() {
        let value = serde_json::to_value(sample_snapshot()).unwrap();
        assert!(value.get("fetchedAt").is_some());
        assert!(value.get("freshUntil").is_some());
        assert!(value.get("lastAttemptAt").is_some());
        let reset = &value["scheduledReset"];
        assert!(reset.get("resetType").is_some());
        assert!(reset.get("announcedAt").is_some());
        assert!(reset.get("scheduledFor").is_some());
        assert_eq!(reset["source"]["type"], "tracker");
        assert!(reset.get("scheduled_for").is_none());
    }

    #[tokio::test]
    #[ignore = "manual live TLS probe; run explicitly with --ignored"]
    async fn live_status_tls_probe() {
        let service = ResetStatusService::new(None);
        let response = service
            .client
            .as_ref()
            .expect("reqwest client construction should succeed")
            .get(STATUS_URL)
            .header(reqwest::header::ACCEPT, "application/json")
            .send()
            .await
            .expect("live HTTPS request should succeed")
            .error_for_status()
            .expect("status endpoint should return success");
        let raw = response.text().await.expect("response body should be readable");
        let fetched_at = Utc::now().to_rfc3339_opts(SecondsFormat::AutoSi, true);
        let parsed = parse_status(&raw, &fetched_at).expect("live response should match schema");
        println!("raw status response: {raw}\nparsed status snapshot: {parsed:#?}");
    }
}
