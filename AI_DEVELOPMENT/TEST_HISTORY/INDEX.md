# Test history index

Test records must distinguish passed, failed, blocked, not applicable, prepared but not executed and inconclusive. Exact commands, environment and evidence paths are required.

## 2026-07-31 — GB-IMP06 partial-slice closure

| Check | Status | Evidence / limitation |
|---|---|---|
| `npm run validate:ops` | passed | synchronized project/session/human state before closure |
| `PLAYWRIGHT_BROWSERS_PATH=/tmp/survival-playwright npm run test:gate-b` | passed | 19 expected-failure fixtures followed by two clean contexts; `EVIDENCE/GB-IMP06-SLICE.json` |
| Independent disposable-copy rerun | passed | `docs/reviews/gate-b-imp06-slice-closure-current.md`; no unresolved high within partial scope |
| `npm run validate` | passed | 224 dialogue nodes, 9 quests, 5 endings |
| `npm run i18n` | passed | 882/882 Japanese strings; rejected glossary variants 0 |
| `node tools/check_scope.mjs --against-content` | passed with declared gaps | playtime unmeasured; breaker and dog unplaced |
| Physical-device test | not executed | no physical device available; no FPS or touch-layout claim |

## 2026-08-01 — OPS-REMOTE-PUBLISH closure

| Check | Status | Evidence / limitation |
|---|---|---|
| PR #2 merge | passed | Gate A foundation and Gate B partial-slice checkpoint merged at `ceb34cc` |
| Initial Pages public surface | failed, recovered | Actions was green but legacy branch deployment served rendered README; OF-006 |
| `npm run build:pages-root` / `npm run validate:pages-root` | passed | six root files byte-identical to production `dist/` |
| PR #3 merge | passed | publication compatibility fix merged at `cc96f3a` |
| Pages runs `30662749145` / `30662747958` | passed | custom and dynamic deployments both completed successfully |
| Public file hash comparison | passed | HTML, JavaScript, CSS and manifest matched local production SHA-256 values |
| Public cloud-browser runtime | blocked by environment | bundle executed to renderer initialization; cloud browser has WebGL disabled; no physical-device claim |
