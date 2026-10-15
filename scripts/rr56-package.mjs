// RR56：把 release 产物打成本地体验包。Bridge 对 cargo 硬链接产物（target/release/reset-radar.exe）拒绝直接
// stat/copy，所以用 node 复制成普通文件：release-qa/RR56-package/{reset-radar.exe, WebView2Loader.dll, 使用说明.txt}
// 并顺手刷新 release-qa 顶层的 exe/说明（与之前各轮一致），再用 PowerShell Compress-Archive 打 zip。
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exe = path.join(root, "src-tauri", "target", "release", "reset-radar.exe");
const loader = [path.join(root, "release-qa", "WebView2Loader.dll"), path.join(root, "release-qa", "RR55-package", "WebView2Loader.dll")].find((p) => existsSync(p));
if (!existsSync(exe)) { console.error(`missing ${exe}`); process.exit(1); }
if (!loader) { console.error("missing WebView2Loader.dll"); process.exit(1); }

const pkg = path.join(root, "release-qa", "RR56-package");
mkdirSync(pkg, { recursive: true });
const notes = `重置雷达 — RR56/RR57 本地体验包（性能 + 可用性 + 人话文案 + 用卡日程）

1. 若旧版仍运行，先从托盘退出。
2. 把本文件夹完整解压到一个新目录，保留 reset-radar.exe 与 WebView2Loader.dll 同目录。
3. 双击 reset-radar.exe。此包沿用原应用标识 app.resetradar.desktop 与原有本地数据，无需删除缓存或日志。
   首次启动会自动把 card-decisions.jsonl（约 16 MB）里从不回读的"规划"大行压缩成摘要（约 2–3 MB），
   原文件会完整备份为 card-decisions.jsonl.bak；概览页底部会出现一次"已整理"提示。

本包修了什么：
- 风扇 / 卡顿：此前每 60 秒重跑一次要算两分钟左右的蒙特卡洛规划，并且每分钟向 16 MB 的日志追加 8 行
  （每行都把整份日志在 IPC 上搬两遍）。现在：①规划器本身提速（同一世界只建一次时间轴、
  无后续查看时段时同首动作共享结果等，结果逐位不变）——你这份数据从约 115 秒降到几秒；
  ②规划按"输入签名"缓存（面板展开 15 分钟一桶、收起 60 分钟）；③日志改为 SHA-256 指纹校验 + 内存缓存，
  预测行只在每小时 / 输入实质变化 / 北京时间 09:00 写入；④移除了"后台不节流"的 WebView 设置。
  实测（本机真实数据、默认收起）：启动后约 10 秒内算完，之后 2 分钟 CPU 占用为 0。
- "今日建议量"选不了：原生下拉 / 日期选择器一弹出，外壳就失焦，600 ms 后面板自动缩成圆。
  现在指针仍在窗口内、或焦点停在输入控件上时不会收起；"今天忙不忙"也改成概览页直接点的按钮。
- 文案改成人话：概览三句话——今天最多用多少 / 卡现在用还是留着、最晚哪天用掉 / 照这个用法撑到几号，
  外加未来 7 天小日历（标出用卡日、到期日、恢复日）。原来的模型术语全部收进"专业细节"折叠区。
  页签改为：今天怎么用 / 平台动态 / 我的设置 / 准不准。
- （RR57）收起态悬浮条 / 面板四周的一圈矩形底色：外壳阴影超出了窗口 8 px 透明边，被窗口边界切成方框；
  现在外壳只用一圈收在边距内的小阴影，窗口大小不变。
- （RR57）"这周期我一定会用卡，告诉我哪天用"：概览页"重置卡"下方新增开关。打开后按最快用法
  （一个 5 小时短窗用完 = 周额度 1/6，连续用 30 小时用完一整周；可选每天 8/12/16/24 小时）排日程，
  逐张卡给出"哪天几点用 + 为什么 + 最晚什么时候"；规则是额度刚用光那一刻用卡最不浪费，
  快要自然恢复时先等恢复，永远不晚于到期前 30 分钟。要先在"我的设置 → 我的卡"登记卡的到期时间。

本地验证：tsc、vite build、vitest 65 文件 559 项、Rust 单测 45 项通过；
构建带 tauri/custom-protocol；本包不是新的远端发布，版本号保持 0.2.0。
`.replace(/\n/g, "\r\n");

for (const dir of [pkg, path.join(root, "release-qa")]) {
  copyFileSync(exe, path.join(dir, "reset-radar.exe"));
  if (path.resolve(path.join(dir, "WebView2Loader.dll")) !== path.resolve(loader)) copyFileSync(loader, path.join(dir, "WebView2Loader.dll"));
  writeFileSync(path.join(dir, "使用说明.txt"), "\ufeff" + notes, "utf8");
  for (const name of ["reset-radar.exe", "WebView2Loader.dll", "使用说明.txt"]) {
    console.log(`${path.relative(root, path.join(dir, name))}\t${statSync(path.join(dir, name)).size} bytes`);
  }
}

const zip = path.join(root, "release-qa", "reset-radar-RR56.zip");
if (existsSync(zip)) rmSync(zip);
const ps = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
  `Compress-Archive -LiteralPath '${pkg}\\reset-radar.exe','${pkg}\\WebView2Loader.dll','${pkg}\\使用说明.txt' -DestinationPath '${zip}' -CompressionLevel Optimal`],
  { stdio: "inherit" });
if (ps.status === 0 && existsSync(zip)) console.log(`${path.relative(root, zip)}\t${statSync(zip).size} bytes`);
else console.error(`zip failed (status ${ps.status}); package folder is still complete`);
process.exit(0);
