// RR18：原始历史由采集脚本生成，事件选择唯一实现位于纯核心；UI只做接线。
import historyFixture from "../../data/resets-history.json";
import { selectQuotaResetHistory } from "../lib";
export const RESET_HISTORY_SOURCE = historyFixture;
export const RESET_HISTORY_ANNOUNCED_AT: readonly string[] = selectQuotaResetHistory(historyFixture.events);
