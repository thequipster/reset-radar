fn main() {
    tauri_build::build();
    patch_test_manifest();
}

/// B08 正规化：windows-gnu 下 test exe 缺 Common-Controls 依赖的根治补法。
/// 机制链（TRUTH §2 B08）：tauri-build 的资源经 embed-resource 走
/// `cargo:rustc-link-arg-bins` 只进正式 bin；test exe 只剩 gcc spec
/// `%{!shared:%:if-exists(default-manifest.o%s)}` 链入的默认 manifest
/// （longPathAware/asInvoker，无 Common-Controls）→ tao/wry 静态导入的
/// TaskDialogIndirect 等符号只存在于 comctl32 v6 → 启动即 0xC0000139。
/// 这里给 test target 单独编一份与 bin 同源的 manifest（内容照抄
/// tauri-build 2.7.1 src/windows-app-manifest.xml，TRUTH §1 来源 3 同栈参考）。
/// MSVC 构建不进本分支（CI/官方工具链的 rc.exe 产物不受 gnu 默认 manifest 影响）。
fn patch_test_manifest() {
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let target_env = std::env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default();
    if target_os != "windows" || target_env != "gnu" {
        return;
    }
    let out_dir =
        std::path::PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR is set by cargo"));
    std::fs::write(out_dir.join("test-app-manifest.xml"), TEST_APP_MANIFEST)
        .expect("write gnu test manifest xml");
    std::fs::write(
        out_dir.join("test-manifest.rc"),
        "#define RT_MANIFEST 24\n1 RT_MANIFEST \"test-app-manifest.xml\"\n",
    )
    .expect("write gnu test manifest rc");
    let rc = out_dir.join("test-manifest.rc");
    // compile_for_everything：通用 cargo:rustc-link-arg 覆盖 #[test] unit test
    // binary（compile_for_tests 的 rustc-link-arg-tests 只认 [[test]] target，
    // 本包测试全在 lib 内会被 cargo 拒指令）。bin 会与 tauri-build 的资源
    // 重复一份同内容 manifest（都含 Common-Controls，加载器取任一都正确）。
    embed_resource::compile_for_everything(&rc, embed_resource::NONE)
        .manifest_required()
        .expect("compile gnu test manifest resource");
}

/// 与 tauri-build 2.7.1 windows-app-manifest.xml 逐字一致（Common-Controls v6 依赖）。
const TEST_APP_MANIFEST: &str = r#"<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
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
