# OPS-IPHONE-SE3-AUTOMATION — iPhone SE 3 release gates

## Scope

This delivery replaces the routine physical-iPhone release prerequisite with
two automated layers while preserving the physical-only limitations as
unmeasured:

1. Playwright WebKit at the built-in iPhone SE (3rd generation) landscape
   profile (667x375 CSS px, DPR 2) on every pull request.
2. Mobile Safari on the iPhone SE (3rd generation) iOS Simulator, driven by
   Appium/XCUITest, before GitHub Pages deploys from `main`.

The gates cover production boot, layout, 44 CSS px targets, touch interaction,
simultaneous movement and attack, camera movement, pause/save/resume,
orientation recovery, reload persistence, a bounded soak, rendering health,
and JavaScript/network faults. The workflow preserves screenshots, reports,
trace/video and logs as GitHub Actions artifacts.

They do **not** measure physical GPU or CPU performance, 30 FPS, thermal
throttling, memory-pressure tab eviction, touch feel or thumb reach, haptics,
speakers, or audio latency. Those remain optional human observations under
`docs/device-test-checklist.md` and are not routine publication blockers.

## Local execution — harness falsification and surrogate run

Environment: Linux, Playwright Chromium with software rendering, 667x375 / DPR
2. This validates the harness flow only; it is not the WebKit or Mobile Safari
release result.

- `node --check tools/test-iphone-webkit.mjs` — exit 0.
- `node --check tools/test-ios-safari.mjs` — exit 0.
- `CINDERLINE_BROWSER=chromium npm run test:iphone-webkit` — exit 0 after a
  repair, zero page/console/request/HTTP errors. Production boot 17.177 s;
  bounded soak 39.484 s; 47 frame samples; 51 draw calls; 823,095 submitted
  triangles; persistence save/restore distance 0; 1,424-byte save.
- `npm run test:ios-safari` without `IOS_SIMULATOR_UDID` — exit 1 before launch,
  proving the high-fidelity gate does not silently substitute another device.
- `PLAYWRIGHT_BROWSERS_PATH=/tmp/cinderline-playwright npm test` — exit 0 on
  the final tree: all 19 adversarial probes rejected; two clean representative
  slice runs passed; all five ending paths passed; save migration 133/133;
  fault recovery 34/34; touch smoke 136/136.
- `npm run validate:ops`, `npm run validate:pages-root`, `git diff --check`,
  Node syntax checks for both harnesses, and YAML parsing of both changed
  workflows — exit 0.
- `node tools/gates/f5_review_record.mjs --body 'Floor-Review: C / pass'` —
  exit 0 and agrees with the Level C record in `AI_DEVELOPMENT/STATE.yaml`.

The first full surrogate run failed because the Japanese pause-menu SAVE and
RESUME labels rendered 37.656 CSS px wide. `public/styles.css` now applies a
44px minimum width, and the complete flow then passed. This is the Level C
falsification result for the product change.

## Remote execution status

Prepared but not yet executed on this branch at the time of this record:

- reviewed Playwright WebKit baseline creation and required-baseline rerun;
- iPhone SE 3 Simulator / Mobile Safari run;
- gated Pages deployment and post-deploy F6 public-surface verification.

The record must be updated with the pull request, workflow run, baseline, merge
revision and public verification before the delivery is called complete.
