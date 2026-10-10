//! reset-radar 数据层入口（RR08 实装）。
//! SWR 快照链（内存缓存 + last-snapshots.json 热启动 + 后台刷新事件）对齐
//! 参考项目 codex-cockpit src-tauri/src/lib.rs 2026-10-10 修复版行为
//! （MIT，TRUTH §1 来源 3；D005 stale-while-revalidate 内建 v1）。

mod codex;
mod models;
mod snapshots;

use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager, State};

use models::ProviderSnapshot;

/// 内存缓存 TTL：期内 get_snapshots 直返缓存。出处：参考 lib.rs:81 SNAPSHOT_CACHE_TTL=30s。
const SNAPSHOT_CACHE_TTL: Duration = Duration::from_secs(30);
/// 单飞合并窗口：并发实取合并为一次。出处：参考 lib.rs:84 SNAPSHOT_CACHE_COLLAPSE_WINDOW=10s。
const SNAPSHOT_CACHE_COLLAPSE_WINDOW: Duration = Duration::from_secs(10);
/// 后台首刷延迟：让窗口先画 stale 值再刷。出处：参考 lib.rs:80 =500ms。
const BACKGROUND_FIRST_REFRESH_DELAY: Duration = Duration::from_millis(500);
/// 后台刷新间隔。出处：参考 lib.rs:77 BACKGROUND_REFRESH_INTERVAL=5min。
const BACKGROUND_REFRESH_INTERVAL: Duration = Duration::from_secs(5 * 60);
/// 后台刷新完成事件（RR09 前端 listen）。参考 emit_to("widget","background-snapshots-updated")；
/// 本项目单窗口，全局 emit 同名事件。
const BACKGROUND_SNAPSHOTS_UPDATED_EVENT: &str = "background-snapshots-updated";

#[derive(Default)]
struct AppState {
    /// 单飞锁。出处：参考 lib.rs:243 fetch_lock。
    fetch_lock: tokio::sync::Mutex<()>,
    /// 内存缓存（写入时刻 + 最新快照）。出处：参考 lib.rs:244 snapshot_cache。
    snapshot_cache: Mutex<Option<(Instant, Vec<ProviderSnapshot>)>>,
    /// last-snapshots.json 所在目录（app_config_dir，setup 时解析）。
    cache_dir: Mutex<Option<std::path::PathBuf>>,
}

/// 采集全部 provider（v1 仅 codex）。出处：参考 lib.rs:306 collect_snapshots_once 的精简。
async fn collect_snapshots() -> Vec<ProviderSnapshot> {
    vec![codex::fetch_snapshot().await]
}

/// 后台刷新：实取 → 更新内存缓存 → 持久化 → 推事件。
/// 出处：参考 lib.rs:359-369 refresh_snapshots_in_background。
async fn refresh_snapshots_in_background(app: &AppHandle) {
    let state = app.state::<AppState>();
    let _guard = state.fetch_lock.lock().await;
    let values = collect_snapshots().await;
    if let Ok(mut cache) = state.snapshot_cache.lock() {
        *cache = Some((Instant::now(), values.clone()));
    }
    if let Ok(dir) = state.cache_dir.lock() {
        if let Some(dir) = dir.as_ref() {
            // best effort：写失败只损失下次热启动速度（参考 lib.rs:407-409 口径）。
            let _ = snapshots::persist_snapshot_cache(
                dir,
                &values,
                &chrono::Utc::now().to_rfc3339(),
            );
        }
    }
    let _ = app.emit(BACKGROUND_SNAPSHOTS_UPDATED_EVENT, &values);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();
            let config_dir = app.path().app_config_dir().ok();
            if let Some(dir) = &config_dir {
                let _ = std::fs::create_dir_all(dir);
            }
            let state = AppState {
                cache_dir: Mutex::new(config_dir.clone()),
                ..Default::default()
            };
            // 热启动：载入上次快照（标 stale）作缓存锚点，冷启动则留空待实取。
            // 出处：参考 lib.rs:415-441 load_persisted_snapshot_cache + run_background_refresh_loop。
            if let Some(dir) = config_dir.as_ref() {
                if let Some(saved) =
                    snapshots::load_persisted_snapshot_cache(dir, chrono::Utc::now())
                {
                    let anchor = Instant::now()
                        .checked_sub(saved.age)
                        .unwrap_or_else(Instant::now);
                    *state.snapshot_cache.lock().unwrap() = Some((anchor, saved.snapshots));
                }
            }
            app.manage(state);
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(BACKGROUND_FIRST_REFRESH_DELAY).await;
                loop {
                    refresh_snapshots_in_background(&handle).await;
                    tokio::time::sleep(BACKGROUND_REFRESH_INTERVAL).await;
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_snapshots, refresh_snapshots])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// SWR 三段式：TTL 内直返缓存 → 有 stale 先返旧值+后台刷新 → 无缓存单飞实取。
/// 出处：参考 lib.rs:651-693 get_snapshots。
#[tauri::command]
async fn get_snapshots(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<ProviderSnapshot>, String> {
    if let Ok(cache) = state.snapshot_cache.lock() {
        if let Some((time, values)) = &*cache {
            if time.elapsed() < SNAPSHOT_CACHE_TTL {
                return Ok(values.clone());
            }
        }
    }
    // stale 缓存（典型为热启动后）：立即返回旧值让 UI 先画，后台刷新落地后走事件。
    let stale = state
        .snapshot_cache
        .lock()
        .ok()
        .and_then(|cache| cache.as_ref().map(|(_, values)| values.clone()));
    if let Some(values) = stale {
        let background = app.clone();
        tauri::async_runtime::spawn(async move {
            refresh_snapshots_in_background(&background).await;
        });
        return Ok(values);
    }
    // 无缓存：实取（fetch_lock 单飞 + collapse 双检）。
    let _guard = state.fetch_lock.lock().await;
    if let Ok(cache) = state.snapshot_cache.lock() {
        if let Some((time, values)) = &*cache {
            if time.elapsed() < SNAPSHOT_CACHE_COLLAPSE_WINDOW {
                return Ok(values.clone());
            }
        }
    }
    let values = collect_snapshots().await;
    if let Ok(mut cache) = state.snapshot_cache.lock() {
        *cache = Some((Instant::now(), values.clone()));
    }
    if let Ok(dir) = state.cache_dir.lock() {
        if let Some(dir) = dir.as_ref() {
            let _ = snapshots::persist_snapshot_cache(
                dir,
                &values,
                &chrono::Utc::now().to_rfc3339(),
            );
        }
    }
    Ok(values)
}

/// 手动刷新（RR09 UI 下拉/按钮用）。出处：参考 lib.rs:696-703 refresh_snapshots。
#[tauri::command]
async fn refresh_snapshots(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<ProviderSnapshot>, String> {
    let _guard = state.fetch_lock.lock().await;
    let values = collect_snapshots().await;
    if let Ok(mut cache) = state.snapshot_cache.lock() {
        *cache = Some((Instant::now(), values.clone()));
    }
    if let Ok(dir) = state.cache_dir.lock() {
        if let Some(dir) = dir.as_ref() {
            let _ = snapshots::persist_snapshot_cache(
                dir,
                &values,
                &chrono::Utc::now().to_rfc3339(),
            );
        }
    }
    let _ = app.emit(BACKGROUND_SNAPSHOTS_UPDATED_EVENT, &values);
    Ok(values)
}
