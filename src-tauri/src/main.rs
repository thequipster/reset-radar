// 防止 Windows release 构建弹出控制台窗口（Tauri 桌面惯例）
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    reset_radar_lib::run()
}
