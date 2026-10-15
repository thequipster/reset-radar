import type { DisplayState, RestForm } from './appState';
import type { OrbMetric } from './orbMetric';
/** Quota/card counters and announcement probability do not need Monte Carlo.
 * Cached/in-flight jobs remain reusable; new work starts only for visible advice.
 * Use the same signature bucket across surfaces so opening/closing is not an input change. */
export function needsPlanning(display: DisplayState, form: RestForm, metric: OrbMetric): boolean {
 return display !== 'collapsed' || (form === 'orb' && metric === 'pace');
}

/** Review tables are not rendered in orb, bar or peek. Journal settlement stays independent. */
export function needsCalibration(display:DisplayState):boolean{return display==='expanded';}
