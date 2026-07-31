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
