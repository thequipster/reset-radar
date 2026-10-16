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
- （云端升级）"一定用卡"改为风险窗口优先：先选公告参考风险低、且避开已知重置前后各 12 小时的
  宽窗口，取可激活区间中点定用卡日；当前剩余额度不再决定用卡日期，只用来算"从哪天开始铺量"。
  公告数据缺失或超过 30 分钟未成功更新时明确说"先刷新公告"，不给日期；消耗期间公告参考风险
  超过 35% 时建议不冲刺（阈值是可调偏好，不是已验证结论）。
- （云端升级）概览新增"公告与概率"区：显示公告最近成功检查时间、完整历史覆盖与条数，
  一个"立即更新公告并重算"按钮——手动刷新会绕过 15 分钟轮询间隔立即拉公告（失败保留旧值），
  历史更新后自动重算模型与用卡窗口。未来 7 天小日历改为每天最小 88px、横向可滚动，不再挤压换行。
- （云端升级·工作台改版）展开面板改为 1080×800 左侧导航工作台（青绿深色 + 浅色两套）：
  用卡建议升为首屏主卡片，一键"先选用卡窗口，再安排用量"直接启用风险优先规划；
  概率雷达只展示真实的 24 小时平台公告参考概率（参考模型 · 非承诺）；
  公告来源与最近平台事件默认折叠；日程改时间线式。迷你圆 / 悬浮条 / 预览尺寸不变，
  620px 以下自动降为顶部导航 + 单列。四页签"今天怎么用 / 平台动态 / 我的设置 / 准不准"不变。
- （云端升级·悬浮件改版）迷你圆 / 悬浮条 / 预览卡换新视觉：迷你圆加雷达纹理与实时剩余弧、
  右键切指标标签；悬浮条变 60px 青绿胶囊，品牌图标 + 周 / 短窗双进度条 + 重置卡与展开触点；
  预览卡统一摘要与脚注版式。窗口尺寸与交互不变（72×72 / 460×76 / 460×212）。
  新增两款本地字体（Manrope + Radar Sans SC，后者由 Noto Sans SC 按 GB2312+ASCII 派生改名；
  SIL OFL 1.1，许可原文在 public/licenses/fonts/），不装系统、不请求 CDN。工作台新品牌图与卡片插画
  为 AI 生成装饰，不把数字或风险结论烘焙进图片。
- （云端升级·浅色与空闲优化）浅色主题换第一方 SVG 插画与纯白面板（不再用压暗的深色图），
  选中主题按钮有可见青绿底。调度侧：收起态迷你圆 / 悬浮条不再启动规划 worker，
  统一 15 分钟签名粒度并按输入身份记忆化；可见的预览 / 展开建议照常规划。
  实测（云端）：冷启动收起态 worker 构造 1→0，空闲动画 0，除启动窗口外进程树均值约 0.006 核。

本地验证：tsc、vite build、vitest 68 文件 596 项、Rust 单测 45 项通过；
浏览器 QA：qa-studio-ui（1080/460/360 × 深/浅）与 qa-floating-ui（悬浮三态 × 深/浅）各 6/6，
含字体就绪、资产加载、窗口边界与实时进度校验，零异常；
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
const ps = spawnSync("pwsh", ["-NoProfile", "-NonInteractive", "-Command",
  `Compress-Archive -LiteralPath '${pkg}\\reset-radar.exe','${pkg}\\WebView2Loader.dll','${pkg}\\使用说明.txt' -DestinationPath '${zip}' -CompressionLevel Optimal`],
  { stdio: "inherit" });
if (ps.status === 0 && existsSync(zip)) console.log(`${path.relative(root, zip)}\t${statSync(zip).size} bytes`);
else console.error(`zip failed (status ${ps.status}); package folder is still complete`);
process.exit(0);
