//! 快照持久化：last-snapshots.json 原子写（tmp+rename）与热启动 stale 载入（D005）。
//! 移植自参考实现 codex-cockpit src-tauri/src/lib.rs:83-441 快照链
//! （MIT，TRUTH §1 来源 3），逐函数注明参考行号。

use std::path::Path;
use std::time::Duration;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::models::ProviderSnapshot;

/// 热启动缓存文件名。出处：参考 lib.rs:85 SNAPSHOT_CACHE_FILE。
pub const SNAPSHOT_CACHE_FILE: &str = "last-snapshots.json";

/// fetchedAt 解析失败时的兜底缓存年龄。出处：参考 lib.rs:421-425（24h）。
const MAX_CACHE_AGE_FALLBACK: Duration = Duration::from_secs(24 * 60 * 60);

/// 热启动载荷。出处：参考 lib.rs:378-384 PersistedSnapshots（camelCase serde）。
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedSnapshots {
    fetched_at: String,
    snapshots: Vec<ProviderSnapshot>,
}

/// 热启动载入结果：快照列表 + 距 fetchedAt 的年龄（换算内存缓存锚点用）。
pub struct PersistedCache {
    pub snapshots: Vec<ProviderSnapshot>,
    pub age: Duration,
}

/// 原子写：先写 .tmp 再 rename（失败只损失下次热启动速度，不影响正确性）。
/// 出处：参考 lib.rs:396-413 persist_snapshot_cache。
pub fn persist_snapshot_cache(
    dir: &Path,
    values: &[ProviderSnapshot],
    fetched_at: &str,
) -> std::io::Result<()> {
    let path = dir.join(SNAPSHOT_CACHE_FILE);
    let payload = PersistedSnapshots {
        fetched_at: fetched_at.to_owned(),
        snapshots: values.to_vec(),
    };
    let serialized = serde_json::to_vec_pretty(&payload)
        .map_err(|error| std::io::Error::other(error.to_string()))?;
    let temporary = path.with_extension("json.tmp");
    std::fs::write(&temporary, &serialized)?;
    std::fs::rename(&temporary, &path)
}

/// 把 ok 快照标记为 stale（热启动先画旧值的口径）。
/// 出处：参考 lib.rs:426-435（status=stale + 固定 message）。
fn mark_stale(values: Vec<ProviderSnapshot>) -> Vec<ProviderSnapshot> {
    let mut values = values;
    for snapshot in &mut values {
        if snapshot.status == "ok" {
            snapshot.status = "stale".into();
            snapshot.message = Some("Last known quota; refreshing live data.".into());
        }
    }
    values
}

/// fetchedAt → 缓存年龄；解析失败回退 24h。出处：参考 lib.rs:419-425。
fn cache_age(fetched_at: &str, now: DateTime<Utc>) -> Duration {
    DateTime::parse_from_rfc3339(fetched_at)
        .ok()
        .and_then(|fetched_at| (now - fetched_at.with_timezone(&Utc)).to_std().ok())
        .unwrap_or(MAX_CACHE_AGE_FALLBACK)
}

/// 读取持久化缓存并标 stale；文件缺失/损坏返回 None（走冷启动实取）。
/// 出处：参考 lib.rs:415-441 load_persisted_snapshot_cache（IO 部分抽本函数，纯逻辑拆出）。
pub fn load_persisted_snapshot_cache(dir: &Path, now: DateTime<Utc>) -> Option<PersistedCache> {
    let raw = std::fs::read_to_string(dir.join(SNAPSHOT_CACHE_FILE)).ok()?;
    let saved: PersistedSnapshots = serde_json::from_str(&raw).ok()?;
    let age = cache_age(&saved.fetched_at, now);
    Some(PersistedCache {
        snapshots: mark_stale(saved.snapshots),
        age,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ok_snapshot() -> ProviderSnapshot {
        ProviderSnapshot {
            provider: "codex".into(),
            display_name: "CODEX".into(),
            plan: Some("PRO".into()),
            short_window: None,
            weekly_window: Some(crate::models::UsageWindow {
                remaining_percent: 74.0,
                resets_at: Some("2026-08-20T04:43:01+00:00".into()),
                window_seconds: 604_800,
            }),
            reset_credits: Some(2),
            rate_limit_snapshot: None,
            updated_at: "2026-10-11T04:00:00+00:00".into(),
            status: "ok".into(),
            message: None,
        }
    }

    /// 独立临时目录（免 tempfile 依赖）。
    fn temp_dir(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("reset-radar-rr08-{}-{}", tag, std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// 落盘 → camelCase 键 → 读回 roundtrip。出处：PersistedSnapshots serde 口径。
    #[test]
    fn persist_then_load_roundtrips_with_camel_case_keys() {
        let dir = temp_dir("roundtrip");
        let now = "2026-10-11T04:10:00+00:00".parse::<DateTime<Utc>>().unwrap();
        persist_snapshot_cache(&dir, &[ok_snapshot()], "2026-10-11T04:00:00+00:00").unwrap();
        let raw = std::fs::read_to_string(dir.join(SNAPSHOT_CACHE_FILE)).unwrap();
        assert!(raw.contains("\"fetchedAt\""));
        assert!(raw.contains("\"weeklyWindow\""));
        assert!(!raw.contains("\"fetched_at\""));
        let loaded = load_persisted_snapshot_cache(&dir, now).unwrap();
        // ok → stale 标记（见下一测试），此处先验值与年龄。
        assert_eq!(loaded.snapshots.len(), 1);
        assert_eq!(loaded.age, Duration::from_secs(600));
        std::fs::remove_dir_all(&dir).ok();
    }

    /// 热启动载入必须把 ok 标 stale。出处：参考 lib.rs:426-435。
    #[test]
    fn load_marks_ok_snapshots_stale() {
        let dir = temp_dir("stale");
        let now = "2026-10-11T04:10:00+00:00".parse::<DateTime<Utc>>().unwrap();
        persist_snapshot_cache(&dir, &[ok_snapshot()], "2026-10-11T04:00:00+00:00").unwrap();
        let loaded = load_persisted_snapshot_cache(&dir, now).unwrap();
        let snapshot = &loaded.snapshots[0];
        assert_eq!(snapshot.status, "stale");
        assert_eq!(
            snapshot.message.as_deref(),
            Some("Last known quota; refreshing live data.")
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    /// 文件缺失 → None（冷启动）。出处：参考 lib.rs:415-417 read .ok() 链。
    #[test]
    fn load_missing_file_returns_none() {
        let dir = temp_dir("missing");
        let now = Utc::now();
        assert!(load_persisted_snapshot_cache(&dir, now).is_none());
        std::fs::remove_dir_all(&dir).ok();
    }

    /// fetchedAt 损坏 → 年龄回退 24h。出处：参考 lib.rs:421-425 unwrap_or(24h)。
    #[test]
    fn unparsable_fetched_at_defaults_to_24h() {
        assert_eq!(
            cache_age("not-a-timestamp", Utc::now()),
            MAX_CACHE_AGE_FALLBACK
        );
    }
}
