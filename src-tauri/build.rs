fn main() {
    tauri_build::build();
    patch_gnu_manifest();
}

/// B08 正规化 + B10 根治：windows-gnu 下给 bin/test 补齐 manifest。
/// 机制链（TRUTH §2）：
/// - B08：tauri-build 的资源经 embed-resource 走 `cargo:rustc-link-arg-bins` 只进正式
///   bin；test exe 只剩 gcc spec `%{!shared:%:if-exists(default-manifest.o%s)}` 链入的
///   默认 manifest（longPathAware/asInvoker，无 Common-Controls）→ tao/wry 静态导入的
///   TaskDialogIndirect 等符号只存在于 comctl32 v6 → 启动即 0xC0000139。
/// - B10：tauri-build 2.7.1 的 windows-app-manifest.xml 本身不含任何 dpiAware（registry
///   源码核实，crate 内零命中）；官方 Tauri v2 靠 tao 运行时调
///   SetProcessDpiAwarenessContext(PER_MONITOR_AWARE_V2)（tao-0.37.1
///   event_loop.rs:185 → dpi.rs:20 become_dpi_aware），本机 gnu exe 实测未生效 →
///   进程 DPI 无感知，200% 缩放下 CSS 视口=窗宽/2。manifest 显式声明 DPI 感知由加载器
///   在进程创建时生效，不依赖运行时调用，是为根治。
/// xml/rc 无条件落盘（lib 的回归哨兵测试 include_str! 要读，MSVC/CI 也能编译）；
/// embed_resource 仅 windows-gnu（MSVC 走 tauri-build 自有 rc.exe 路径，不进本分支）。
fn patch_gnu_manifest() {
    let out_dir =
        std::path::PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR is set by cargo"));
    std::fs::write(out_dir.join("app-manifest.xml"), GNU_APP_MANIFEST)
        .expect("write app manifest xml");
    std::fs::write(
        out_dir.join("app-manifest.rc"),
        "#define RT_MANIFEST 24\n1 RT_MANIFEST \"app-manifest.xml\"\n",
    )
    .expect("write app manifest rc");
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let target_env = std::env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default();
    if target_os != "windows" || target_env != "gnu" {
        return;
    }
    let rc = out_dir.join("app-manifest.rc");
    // compile_for_everything：通用 cargo:rustc-link-arg 覆盖 #[test] unit test
    // binary（compile_for_tests 的 rustc-link-arg-tests 只认 [[test]] target，
    // 本包测试全在 lib 内会被 cargo 拒指令）。bin 会与 tauri-build 的资源
    // 重复一份 manifest（ld 报 .rsrc merge failure 取任一份；两份内容均含
    // Common-Controls + dpiAware，加载器取任一都正确，见 B08 勘正）。
    embed_resource::compile_for_everything(&rc, embed_resource::NONE)
        .manifest_required()
        .expect("compile gnu app manifest resource");
}

/// gnu 全产物 manifest：Common-Controls v6 依赖（B08，逐字沿 tauri-build 2.7.1
/// windows-app-manifest.xml）+ asmv3 windowsSettings 的 DPI 感知声明（B10 补）。
/// dpiAware=true/PM（Win8.1+ legacy 写法）与 dpiAwareness=PerMonitorV2,PerMonitor
/// （Win10 1703+ 主选，逗号列表为回退序）并存时，新系统只认 dpiAwareness。
const GNU_APP_MANIFEST: &str = r#"<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0" xmlns:asmv3="urn:schemas-microsoft-com:asm.v3">
  <asmv3:application>
    <asmv3:windowsSettings>
      <dpiAware xmlns="http://schemas.microsoft.com/SMI/2005/WindowsSettings">true/PM</dpiAware>
      <dpiAwareness xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">PerMonitorV2,PerMonitor</dpiAwareness>
    </asmv3:windowsSettings>
  </asmv3:application>
  <dependency>
    <dependentAssembly>
      <assemblyIdentity
        type="win32"
        name="Microsoft.Windows.Common-Controls"
        version="6.0.0.0"
        processorArchitecture="*"
        publicKeyToken="6595b64144ccf1df"
        language="*"
      />
    </dependentAssembly>
  </dependency>
</assembly>
"#;
