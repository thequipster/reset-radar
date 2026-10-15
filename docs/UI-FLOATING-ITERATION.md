# Floating UI / 字体与资产迭代（2026-10-15）

## 实现范围
- Orb：保持 72×72 外窗、56px 主体与原交互，增加雷达纹理、实时剩余弧、周余/公告/预算指标标签。
- Compact：保持 460×76 窗口，60px 青绿胶囊、品牌图标、周/短窗两条真实进度、重置卡与44px展开触点。
- Peek：保持 460×212 窗口，两行摘要与统一脚注/操作区；当前演示内容下卡片底部192px，留有安全边界。
- Legacy CompactBar/PeekCard 与 V3 组件均接入同一 floating theme marker。深浅主题使用相同的青绿语义。
- Dashboard：新品牌图和卡片插画、本地字体；功能/模型/原生窗口几何不改。

## 资产与字体
- AI 生成装饰资产：radar-emblem.webp（192px，4126B）及 reset-card-art.webp（480×320，8182B）。不把数字/风险结论烘焙成图。
- Manrope variable WOFF：67912B，数字/英文。
- Radar Sans SC variable WOFF：2602664B，由 Noto Sans SC 按 GB2312+ASCII/CJK/全角标点生成并改名；生僻字走系统回退。
- 不安装到系统；运行时不请求字体 CDN；font-display:swap。
- 原始 OFL、版权、来源及派生说明在 public/licenses/fonts/；Vite 复制到 dist/licenses/fonts/。

## 验证
- TypeScript noEmit：0；Vite production build：0（原有 Tauri dynamic/static import 提示保留）。
- Vitest：67 suites / 571 tests 全部通过；新增 floating-family 3项测试覆盖主题标记、实时文本与本地字体/许可。
- scripts/qa-floating-ui.mjs：6个模式×主题组合（orb/bar/peek × dark/light），等待document.fonts.ready，校验字库/图片加载、窗口边界、实时进度、无运行异常；另测右键切指标、Enter从球展开到条、条及预览展开主面板。
- scripts/qa-studio-ui.mjs：1080/460/360 × dark/light 共6项，字体就绪后校验主面板、导航、日历与无根溢出。
- 截图为 isolated headless Edge 渲染最新 dist 的页面，不是生成概念图，也不代表已完成原生桌面安装包验收。
- QA 使用临时浏览器配置，不读写用户浏览器/桌面应用配置。

## 交付边界
修改源码与前端构建；没有重建/替换原生exe，没有安装软件、提交、推送或改其他项目。


## 2026-10-16 后续
浅色独立矢量资产、按需规划/校准计算、原生 CPU 复测及最新交付范围见 `UI-LIGHT-IDLE-OPTIMIZATION.md`；本页前文记录上一轮状态。
