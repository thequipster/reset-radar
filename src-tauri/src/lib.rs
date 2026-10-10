// reset-radar 数据层入口（RR01 最小骨架）。
// 结构对齐参考项目 codex-cockpit src-tauri/src/{main.rs,lib.rs}（MIT，TRUTH §1 来源 3）；
// 采集/快照/SWR 等实装自 RR08 起，本文件先保持最小可运行。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
