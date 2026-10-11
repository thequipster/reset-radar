# 生产预测日志汇流（RR15）

生产路径为Tauri app_config_dir中的`predictions.jsonl`，Windows即`%APPDATA%/app.resetradar.desktop/predictions.jsonl`，与额度缓存同目录。Rust不接受任意路径，两个命令分别读取原文和比较原文后追加新JSON行。

## 单一业务实现

`buildDashboard`把风险评估时刻、状态和风险交给`src/lib/predictions.ts`生成候选。真实有效风险评估才触发`usePredictionLog`；浏览器预览不落盘，公告来源失败/过期不冒充新预测。风险与额度独立：来源新鲜时额度失败仍记录风险；无来源旧契约依quota观测时刻，热启动stale不落盘。目标date按评估时刻的北京日键，记录执行时间fetchedAt另存，跨日不能混用。

`src/data/predictionLog.ts`读取原文并调用既有`appendPredictionLog`：每日首条追加、与同日最后条漂移严格大于0.5补行。Rust只做结构校验/持锁CAS/追加/同步磁盘，没有日期公式、漂移常数或风险算法。并发冲突重读核心判断，最多5次重试；写入失败向hook返回error和message，RR27将排版呈现。

## 文件安全与脚本

- Node与Rust共用`predictions.jsonl.lock`排他create_new锁，写入持有者PID和创建时间方便诊断；只清理自身成功获得的锁。锁忙不会删除他人的锁，也不根据年龄擅自判断进程已死。
- 保留所有已有字节（包括坏JSON、CRLF和未结尾的残行）；必要时仅追加换行分隔符，再追加核心生成的新行。文件不被truncate，不回写修复历史。
- 正常写入后同步到磁盘。若写盘途中失败，错误原样报告，已存在残行仍保留；下次追加会分隔残行。异常退出可能遗留锁，须确认PID及其他写者均已停止后处理；应用会报告占用，避免无限等待。
- `node scripts/log-prediction.mjs`默认写生产文件；`--path <file>`仅指定该文件。脚本评估仍以历史fetchedAt为as_of，先运行fetch-history可保证新鲜；RR18负责统一历史刷新和regular筛选。
- `node scripts/calibrate.mjs`默认读取仓库data/predictions.jsonl与生产文件，同一路径去重；有效fetchedAt按执行时间稳定排序，同时间归档先；缺/非法时间置于有效时间之后且保留源内行序。计分继续核心同日首条与完结北京日规则，坏行计数、文件缺失明确标注、读取错误退出1。
- `node scripts/calibrate.mjs --path <file>`仅读取指定文件，方便对独立归档复现。脚本不把生产日志偷偷改写到版本化夹具。RR17/RR28沿本路径读取。

## 来源与验证

路径依据本仓tauri.conf.json:5 identifier、lib.rs setup调用app_config_dir；安装依赖tauri2.12.2 src/path/desktop.rs:239直接使用dirs::config_dir()/identifier，当前未配置目录override。Windows运行事实以本轮生产落盘证据为准，mac/Linux仅路径分支单测，没有冒称在这些平台运行。

官方路径语义：[Tauri appConfigDir/configDir](https://v2.tauri.app/reference/javascript/api/namespacepath/#appconfigdir)。业务依据ARCHITECTURE分层、D004北京日边界、D019单一幂等核心与D025路径汇流。RR15卡面提及D020路径裁决编号已有DPI事项占用，本轮顺延D025，未修改历史编号。

门禁、变异红恢复与生产程序自动写入/脚本互读/重启幂等实证见主仓task_logs/RR15_done.md及RR15_artifacts。本卡不重构视觉，无新UI截图；全项目最终完成仍依赖后续历史、校准与RR27参考图界面。
