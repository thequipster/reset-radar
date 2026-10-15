// RR56：card-decisions.jsonl 的瘦身规则（纯函数，不读写文件）。
// 背景：每条 planning 行把 selected.scenarios 与 alternatives（96–256 条情景）整份落盘，
// 一行 ≈ 44 KB；307 行就占了 16 MB 日志里的 13.4 MB，而没有任何读取方回看这些情景
// （唯一消费者是 docs 里的人工审计）。预测行（kind=prediction）按规格字节不变，这里绝不碰。
import type { PlanningJournalRecord } from "./journal";

type Row = Record<string, unknown>;

const SUMMARY_KEYS = ["id", "firstAction", "Ltail", "Lmean", "Nspent", "Eexpire"] as const;

function summarizeComparison(value: unknown): Row | null {
  if (value == null || typeof value !== "object") return null;
  const source = value as Row;
  const out: Row = {};
  for (const key of SUMMARY_KEYS) if (source[key] !== undefined) out[key] = source[key];
  const scenarios = source.scenarios;
  if (Array.isArray(scenarios)) out.scenarioCount = scenarios.length;
  return out;
}

/** 新写入也用的精简 planning 记录：只留结论与可复现的种子，不留情景明细。 */
export function slimPlanningRecord(record: PlanningJournalRecord): PlanningJournalRecord & { alternativeCount: number; slim: true } {
  const candidates = Array.isArray(record.candidates) ? record.candidates.map((candidate) => summarizeComparison(candidate) ?? candidate) : [];
  return {
    id: record.id, predictionId: record.predictionId, seed: record.seed,
    candidates, selected: summarizeComparison(record.selected), alternatives: [],
    alternativeCount: Array.isArray(record.alternatives) ? record.alternatives.length : 0, slim: true,
  };
}

export interface CompactionPlan {
  content: string;
  /** 预计节省的 UTF-16 码元数（≈ 字节数量级，仅用于阈值判断与日志）。 */
  savedChars: number;
  rowCount: number;
  compactedRows: number;
}

/**
 * 只重写 kind=planning 且仍带情景明细的行；其余行逐字节保留（含损坏行与原有换行风格）。
 * 节省量低于 `minSavedChars` 时返回 null——不值得为几 KB 冒重写风险。
 */
export function compactCardsLog(content: string, minSavedChars = 1_000_000): CompactionPlan | null {
  if (content === "") return null;
  const lines = content.split("\n");
  const trailingEmpty = lines[lines.length - 1] === "";
  if (trailingEmpty) lines.pop();
  let compactedRows = 0, saved = 0;
  const output = lines.map((line) => {
    const body = line.endsWith("\r") ? line.slice(0, -1) : line;
    if (!body.includes('"planning"')) return line;
    let row: Row;
    try { row = JSON.parse(body) as Row; } catch { return line; }
    if (row.kind !== "planning" || row.record == null || typeof row.record !== "object") return line;
    const record = row.record as Row;
    if (record.slim === true) return line;
    const slim = slimPlanningRecord(record as unknown as PlanningJournalRecord);
    const next = JSON.stringify({ ...row, record: slim, compactedFrom: body.length });
    if (next.length >= body.length) return line;
    compactedRows += 1; saved += body.length - next.length;
    return next;
  });
  if (compactedRows === 0 || saved < minSavedChars) return null;
  return { content: `${output.join("\n")}\n`, savedChars: saved, rowCount: lines.length, compactedRows };
}
