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

Pull request: `bachikoljunior-blip/survival#8`.

Initial Floor gates run `30722138303`, head
`7839c28824273879dad00807c31e97d7e07ff4c3`:

- F2 state update — pass.
- F5 review record — pass, Level C.
- Existing F3 six-step execution — pass.
- Playwright WebKit — executed the complete sequence and exited 1 for exactly
  the intended first-run condition: no reviewed baseline was present. Boot was
  9.393 s and the soak was 8.320 s; movement was 6.3457 m with one attack;
  camera delta 0.20095; persistence restore distance 0; 30 frame samples; zero
  game faults and zero page/console/request/HTTP errors.
- Artifact `8825225421` was inspected. The 1334x750 candidate is a complete
  landscape gameplay frame with Japanese UI and all nine controls, not black or
  corrupt (mean luma 8.711, luma standard deviation 23.125, near-black ratio
  0.65837). It was promoted to
  `tests/baselines/iphone-se3-webkit-gameplay.png`, SHA-256
  `f7bee4aa3b42de9a184f33845091bb5d2180a9e862f462c15c9ac9f5f843f1ac`.

Still required before completion:

- required-baseline WebKit rerun within a 15% maximum differing-pixel ratio;
- iPhone SE 3 Simulator / Mobile Safari run;
- gated Pages deployment and post-deploy F6 public-surface verification;
- exact merge revision and final workflow evidence recorded here.
