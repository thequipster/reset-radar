//! reset-radar 数据层入口（RR08 实装）。
//! SWR 快照链（内存缓存 + last-snapshots.json 热启动 + 后台刷新事件）对齐
//! 参考项目 codex-cockpit src-tauri/src/lib.rs 2026-10-10 修复版行为
//! （MIT，TRUTH §1 来源 3；D005 stale-while-revalidate 内建 v1）。

mod codex;
mod models;
mod snapshots;
mod reset_status;
mod platform_history;
mod predictions;
mod observations;
mod calibration_summary;
mod shell;

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
    /// 公告缓存与额度缓存分开：quota可5min刷新，status只15min一拉。
    reset_status: tokio::sync::Mutex<Option<reset_status::ResetStatusService>>,
    /// 单飞锁。出处：参考 lib.rs:243 fetch_lock。
    fetch_lock: tokio::sync::Mutex<()>,
    /// 内存缓存（写入时刻 + 最新快照）。出处：参考 lib.rs:244 snapshot_cache。
    snapshot_cache: Mutex<Option<(Instant, Vec<ProviderSnapshot>)>>,
    /// last-snapshots.json 所在目录（app_config_dir，setup 时解析）。
    cache_dir: Mutex<Option<std::path::PathBuf>>,
}

/// 采集全部 provider（v1 仅 codex）。出处：参考 lib.rs:306 collect_snapshots_once 的精简。
async fn collect_snapshots(state: &AppState) -> Vec<ProviderSnapshot> {
    let (mut quota, status) = tokio::join!(codex::fetch_snapshot(), async {
        let mut service = state.reset_status.lock().await;
        service.get_or_insert_with(|| reset_status::ResetStatusService::new(None))
            .snapshot().await
    });
    quota.reset_status = Some(status);
    vec![quota]
}

/// 后台刷新：实取 → 更新内存缓存 → 持久化 → 推事件。
/// 出处：参考 lib.rs:359-369 refresh_snapshots_in_background。
async fn refresh_snapshots_in_background(app: &AppHandle) {
    let state = app.state::<AppState>();
    let _guard = state.fetch_lock.lock().await;
    let values = collect_snapshots(&state).await;
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
        // RR43：退出闸门常驻——关窗只收起，彻底退出由托盘菜单置位后才真关（见 shell.rs）。
        .manage(shell::ShellState::default())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let quitting = window.state::<shell::ShellState>().quitting();
                if !quitting {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            let handle = app.handle().clone();
            let config_dir = app.path().app_config_dir().ok();
            if let Some(dir) = &config_dir {
                let _ = std::fs::create_dir_all(dir);
            }
            let mut state = AppState {
                cache_dir: Mutex::new(config_dir.clone()),
                ..Default::default()
            };
            // 热启动：载入上次快照（标 stale）作缓存锚点，冷启动则留空待实取。
            // 出处：参考 lib.rs:415-441 load_persisted_snapshot_cache + run_background_refresh_loop。
            if let Some(dir) = config_dir.as_ref() {
                if let Some(saved) =
                    snapshots::load_persisted_snapshot_cache(dir, chrono::Utc::now())
                {
                    let saved_status = saved.snapshots.iter().find_map(|snapshot| snapshot.reset_status.clone());
                    *state.reset_status.get_mut() = Some(reset_status::ResetStatusService::new(saved_status));
                    let anchor = Instant::now()
                        .checked_sub(saved.age)
                        .unwrap_or_else(Instant::now);
                    *state.snapshot_cache.lock().unwrap() = Some((anchor, saved.snapshots));
                }
            }
            app.manage(state);
            // RR43：系统托盘常驻（关窗仅收起 / 展开 / 形态 / 迷你圆指标 / 彻底退出）。
            // 托盘不可用时只写 stderr 不阻断——降级不静默，悬浮窗本体仍可用。
            if let Err(error) = shell::build_tray(app.handle()) {
                eprintln!("[reset-radar] tray unavailable: {error}");
            }
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(BACKGROUND_FIRST_REFRESH_DELAY).await;
                loop {
                    refresh_snapshots_in_background(&handle).await;
                    tokio::time::sleep(BACKGROUND_REFRESH_INTERVAL).await;
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_snapshots, refresh_snapshots, platform_history::fetch_platform_history, read_observation_log, append_observation_log, stat_observation_log, append_observation_log_by_hash, rewrite_observation_log, read_prediction_log, append_prediction_log, read_calibration_summary,
            shell::shell_geometry, shell::shell_set_bounds, shell::shell_set_visible, shell::shell_is_visible, shell::shell_quit
        ])
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
    let values = collect_snapshots(&state).await;
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
    let values = collect_snapshots(&state).await;
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

/// B08/B10 回归哨兵：gnu 全产物 manifest 必须同时保留 Common-Controls v6 依赖
/// （B08：丢了 test exe 启动即 0xC0000139）与 PerMonitorV2 DPI 声明
/// （B10：丢了 200% 缩放下 CSS 视口=窗宽/2）。build.rs 无条件落盘该 xml
/// （embed 仅 gnu），MSVC/CI 编译本测试同样可读。
#[cfg(test)]
mod build_manifest {
    const APP_MANIFEST: &str = include_str!(concat!(env!("OUT_DIR"), "/app-manifest.xml"));

    #[test]
    fn manifest_keeps_common_controls_v6_dependency() {
        assert!(
            APP_MANIFEST.contains(r#"name="Microsoft.Windows.Common-Controls""#),
            "B08 回归：manifest 丢了 Common-Controls v6 依赖"
        );
    }

    #[test]
    fn manifest_declares_per_monitor_dpi_awareness() {
        assert!(
            APP_MANIFEST.contains(">PerMonitorV2,PerMonitor<"),
            "B10 回归：manifest 丢了 dpiAwareness PerMonitorV2"
        );
        assert!(
            APP_MANIFEST.contains("<dpiAware "),
            "B10 回归：manifest 丢了 legacy dpiAware（true/PM）声明"
        );
    }
}

/// RR15固定app_config_dir读取日志；不接受调用者传路径。
#[tauri::command]
fn read_prediction_log(state: State<'_, AppState>) -> Result<predictions::LogRead, String> {
    let dir = state.cache_dir.lock().map_err(|e| e.to_string())?;
    predictions::read_log(dir.as_ref().ok_or("application config directory unavailable")?)
}

/// 只追加TS核心已生成的新行；文件级锁与expectedContent保证跨写者串行。
#[tauri::command]
fn append_prediction_log(state: State<'_, AppState>, expected_content: String, line: String) -> Result<predictions::AppendResult, String> {
    let dir = state.cache_dir.lock().map_err(|e| e.to_string())?;
    predictions::append_line(dir.as_ref().ok_or("application config directory unavailable")?, &expected_content, &line)
}

/// RR28只读校准摘要：固定app_config_dir，不接受调用者传路径；内容校验在TS核心。
#[tauri::command]
fn read_calibration_summary(state: State<'_, AppState>) -> Result<calibration_summary::SummaryRead, String> {
    let dir = state.cache_dir.lock().map_err(|e| e.to_string())?;
    calibration_summary::read_summary(dir.as_ref().ok_or("application config directory unavailable")?)
}

/// RR46 两类观测日志：目录固定，路径白名单在 IO 薄壳内验证。
#[tauri::command]
fn read_observation_log(state: State<'_, AppState>, kind: String) -> Result<observations::LogRead, String> {
    let dir = state.cache_dir.lock().map_err(|e| e.to_string())?;
    observations::read_log(dir.as_ref().ok_or("application config directory unavailable")?, &kind)
}
#[tauri::command]
fn append_observation_log(state: State<'_, AppState>, kind: String, expected_content: String, line: String) -> Result<observations::AppendResult, String> {
    let dir = state.cache_dir.lock().map_err(|e| e.to_string())?;
    observations::append_line(dir.as_ref().ok_or("application config directory unavailable")?, &kind, &expected_content, &line)
}
/// RR56：指纹版 CAS 三件——前端缓存整份日志，IPC 只传指纹与新行，不再每次追加往返十几 MB。
#[tauri::command]
fn stat_observation_log(state: State<'_, AppState>, kind: String) -> Result<observations::LogStat, String> {
    let dir = state.cache_dir.lock().map_err(|e| e.to_string())?;
    observations::stat_log(dir.as_ref().ok_or("application config directory unavailable")?, &kind)
}
#[tauri::command]
fn append_observation_log_by_hash(state: State<'_, AppState>, kind: String, expected_sha256: String, line: String) -> Result<observations::HashedWrite, String> {
    let dir = state.cache_dir.lock().map_err(|e| e.to_string())?;
    observations::append_line_by_hash(dir.as_ref().ok_or("application config directory unavailable")?, &kind, &expected_sha256, &line)
}
#[tauri::command]
fn rewrite_observation_log(state: State<'_, AppState>, kind: String, expected_sha256: String, content: String) -> Result<observations::HashedWrite, String> {
    let dir = state.cache_dir.lock().map_err(|e| e.to_string())?;
    observations::rewrite_log(dir.as_ref().ok_or("application config directory unavailable")?, &kind, &expected_sha256, &content)
}
