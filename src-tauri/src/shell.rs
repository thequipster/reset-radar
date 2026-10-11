//! RR43 悬浮外壳：系统托盘常驻 + 关窗仅收起 + 窗口几何 OS 基元。
//! 分工（RUNBOOK §1.4 多目标同步）：几何数值全部由 TS 侧（src/ui/dockGeometry.ts +
//! widgetWindow.ts）算好再传进来，Rust 只执行「设坐标 / 显隐 / 退出」这类 OS 基元，
//! 不在 Rust 侧复算任何摆放规则。
//! 本地优先：本模块不发起网络请求、不落任何遥测（ARCHITECTURE §1）。
//! 托盘形态参考 codex-cockpit（MIT，TRUTH §1 来源 3）的常驻做法，实现为本项目自有代码。

use std::sync::atomic::{AtomicBool, Ordering};

use serde::Serialize;
use tauri::{
    menu::{MenuBuilder, MenuItem, SubmenuBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Runtime, WebviewWindow,
};

/// 托盘菜单动作事件名；与前端 shellBridge.ts SHELL_ACTION_EVENT 同名。
pub const SHELL_ACTION_EVENT: &str = "rr-shell-action";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// 窗口 + 所在显示器的几何，一律逻辑像素（物理 → 逻辑的换算在这里做最后一次）。
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellGeometry {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub scale_factor: f64,
    pub monitor: ShellRect,
}

/// 退出闸门：只有托盘「退出 reset-radar」会置真，关窗（CloseRequested）一律只收起。
pub struct ShellState {
    quitting: AtomicBool,
}

impl Default for ShellState {
    fn default() -> Self {
        Self {
            quitting: AtomicBool::new(false),
        }
    }
}

impl ShellState {
    pub fn quitting(&self) -> bool {
        self.quitting.load(Ordering::SeqCst)
    }

    pub fn request_quit(&self) {
        self.quitting.store(true, Ordering::SeqCst);
    }
}

fn safe_scale(value: f64) -> f64 {
    if value > 0.0 && value.is_finite() {
        value
    } else {
        1.0
    }
}

fn geometry<R: Runtime>(window: &WebviewWindow<R>) -> Result<ShellGeometry, String> {
    let scale = safe_scale(window.scale_factor().map_err(|error| error.to_string())?);
    let position = window.outer_position().map_err(|error| error.to_string())?;
    let size = window.outer_size().map_err(|error| error.to_string())?;
    let monitor = window
        .current_monitor()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "no monitor available".to_string())?;
    let monitor_scale = safe_scale(monitor.scale_factor());
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    Ok(ShellGeometry {
        x: position.x as f64 / scale,
        y: position.y as f64 / scale,
        width: size.width as f64 / scale,
        height: size.height as f64 / scale,
        scale_factor: scale,
        monitor: ShellRect {
            x: monitor_position.x as f64 / monitor_scale,
            y: monitor_position.y as f64 / monitor_scale,
            width: monitor_size.width as f64 / monitor_scale,
            height: monitor_size.height as f64 / monitor_scale,
        },
    })
}

/// 读取窗口几何（逻辑像素）。前端贴边/摆位的输入源。
#[tauri::command]
pub fn shell_geometry(window: WebviewWindow) -> Result<ShellGeometry, String> {
    geometry(&window)
}

/// 设置窗口坐标与尺寸（逻辑像素，缩放由 Tauri 换算）。
#[tauri::command]
pub fn shell_set_bounds(
    window: WebviewWindow,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    window
        .set_position(LogicalPosition::new(x, y))
        .map_err(|error| error.to_string())?;
    window
        .set_size(LogicalSize::new(width, height))
        .map_err(|error| error.to_string())?;
    Ok(())
}

/// 显示 / 隐藏窗口。关窗只收起（见 lib.rs 的 CloseRequested 拦截），进程常驻托盘。
#[tauri::command]
pub fn shell_set_visible(window: WebviewWindow, visible: bool) -> Result<(), String> {
    if visible {
        window.show().map_err(|error| error.to_string())?;
        let _ = window.set_focus();
    } else {
        window.hide().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn shell_is_visible(window: WebviewWindow) -> Result<bool, String> {
    window.is_visible().map_err(|error| error.to_string())
}

/// 彻底退出：先置闸门再 exit，避免被关窗拦截逻辑当成“收起”。
#[tauri::command]
pub fn shell_quit(app: AppHandle, state: tauri::State<'_, ShellState>) -> Result<(), String> {
    state.request_quit();
    app.exit(0);
    Ok(())
}

/// 建系统托盘：左键点击切换显隐；右键菜单给「显隐 / 展开 / 形态 / 迷你圆指标 / 退出」。
/// 菜单动作以事件形式发给前端，展示层状态机仍是唯一改状态的地方（ARCHITECTURE §2）。
pub fn build_tray<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let menu = MenuBuilder::new(app)
        .item(&MenuItem::with_id(app, "toggle", "显示 / 隐藏", true, None::<&str>).map_err(|e| e.to_string())?)
        .item(&MenuItem::with_id(app, "expand", "展开面板", true, None::<&str>).map_err(|e| e.to_string())?)
        .item(
            &SubmenuBuilder::new(app, "悬浮形态")
                .item(&MenuItem::with_id(app, "form:orb", "迷你圆", true, None::<&str>).map_err(|e| e.to_string())?)
                .item(&MenuItem::with_id(app, "form:bar", "悬浮条", true, None::<&str>).map_err(|e| e.to_string())?)
                .build()
                .map_err(|e| e.to_string())?,
        )
        .item(
            &SubmenuBuilder::new(app, "迷你圆显示")
                .item(&MenuItem::with_id(app, "metric:pace", "今日建议配速", true, None::<&str>).map_err(|e| e.to_string())?)
                .item(&MenuItem::with_id(app, "metric:risk", "24h 重置风险", true, None::<&str>).map_err(|e| e.to_string())?)
                .item(&MenuItem::with_id(app, "metric:remaining", "周额度剩余", true, None::<&str>).map_err(|e| e.to_string())?)
                .build()
                .map_err(|e| e.to_string())?,
        )
        .separator()
        .item(&MenuItem::with_id(app, "quit", "退出 reset-radar", true, None::<&str>).map_err(|e| e.to_string())?)
        .build()
        .map_err(|e| e.to_string())?;

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("reset-radar")
        .menu(&menu)
        .on_menu_event(|app, event| {
            let _ = app.emit(SHELL_ACTION_EVENT, event.id().as_ref());
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    match window.is_visible() {
                        Ok(true) => {
                            let _ = window.hide();
                        }
                        _ => {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                }
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder.build(app).map_err(|e| e.to_string())?;
    Ok(())
}
