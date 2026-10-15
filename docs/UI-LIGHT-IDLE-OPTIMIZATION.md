# Light theme & idle work — 2026-10-16

## UI
- Dedicated first-party static light SVG radar emblem + reset-card illustration. Dark generated WebP art is unchanged; light mode no longer shows a dimmed dark jewel.
- Neutral white panels/sidebar, charcoal/teal typography, flat teal primary action and lighter separators; no green glass wash in the floating bar/preview.
- Clean white orb face; no dark texture in light mode. SVG quota arc snaps only on real input changes, without stroke interpolation. Layout/paint containment, no permanent will-change/GPU filter or frame loop.
- Fixed the transparent header-button rule erasing the selected theme background (white sun on white); active theme now has a visible teal fill.

## Scheduling (not an algorithm rewrite)
- Cold collapsed quota/announcement orb and collapsed bar do not start new planning workers. Visible pace/budget, preview and expanded advice still enable planning.
- Existing in-flight jobs may finish/cache; no interruption/restart loop just because the panel closes.
- Use the existing 15-minute signature grain consistently across surfaces; a display change is not a different cache signature. Visible budget can update at that grain rather than the old collapsed 60-minute grain; counters with no visible advice start no worker.
- Memoize planning signatures by input identity and bucket; reuse current state on identical cache hits.
- Only expanded panels build the three review/calibration tables. Journal settlement, account observations, scheduled resets, periodic snapshot refresh, manual refresh and daily prediction publication remain active independently.

## Evidence and limits
The original source did not contain an infinite orb animation. Old native diagnostics also showed no running animations and idle main-thread script/layout work near zero after startup. Therefore the reported 0.11/0.18 cores cannot honestly be attributed to a continuously animated quota arc from this evidence alone.

Headless demo, isolated profile, same script before/final: cold default orb worker constructions 1 → 0. Both versions had 0 running animations and 0 layout passes during the sampled idle interval. Final approximate whole-browser CPU: orb 0.0081 cores / bar 0.0043 cores. These short browser samples are not a claimed native percentage improvement.

### Native WebView2 final build
Real provider snapshots, default collapsed quota orb, separate WebView profile, own launched process tree only. Six ~10-second windows (actual timestamp spacing includes process enumeration). Host + descendant WebView CPU seconds / wall time; values below are not percent.

| Since launch (s) | Whole process-tree cores | Worker targets | Running animations |
|---:|---:|---:|---:|
| 14 | 0.0760 | 0 | 0 |
| 25 | 0.0015 | 0 | 0 |
| 35 | 0.0043 | 0 | 0 |
| 46 | 0.0000 | 0 | 0 |
| 57 | 0.0000 | 0 | 0 |
| 68 | 0.0234 | 0 | 0 |

- First/startup interval: 0.0760 cores. Excluding that interval, mean of the five reported windows ≈ 0.0058 cores (≈0.006); the late 0.0234 spike was browser/utility work, not renderer script/layout or a running animation.
- This is not a reproduction of the user's exact prior cache/preferences or 2×60-second sampling protocol. The older native build also settled down in this diagnostic. No unsupported “0.18 → 0” or guaranteed permanent zero-CPU claim.
- Background refresh and user-visible budget calculations can legitimately consume CPU outside this short test.
- Probe only terminates its own launched PID tree; the user's existing instance is not replaced or stopped.

## Gates
- TypeScript noEmit: pass.
- Vite production build: pass; pre-existing Tauri static/dynamic import warnings remain.
- Vitest: 68 suites / 596 tests pass (25 added since 571).
- Rust lib: 45 pass, 1 ignored.
- Floating UI: 6/6, both themes; exact native viewport bounds; local fonts/assets loaded; correct light assets; cold quota orb starts 0 workers and has 0 running animations; metric cycling and expansion preserved.
- Dashboard: 6/6 (1080/460/360 × dark/light), tabs/calendar/overflow/actions and selected-theme visibility.
- Native release build: pass; linker reports pre-existing multiple-manifest warning. Test executable launched successfully.
- git diff --check: pass (LF/CRLF notices only).

## Native verification artifact
`release-qa/light-idle-package/reset-radar.exe` + WebView2Loader.dll + human-readable licenses. SHA-256: `16ba64c9e7a2ac69f3bbfe2012aa404685e529e3fd648e48f99bd13319a4214c`.
No replacement of the running desktop executable, no installation, no remote push. Previous functional/UI/font changes by this agent are committed together so the new UI has its history-refresh and risk-first model dependencies. Pre-existing HEARTBEAT and rr56 runner/packaging edits are left untouched/uncommitted.
