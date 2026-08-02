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

Required-baseline rerun `30722581701`, head
`49ccf350ce931ca45ccedc45f655774a588a859a`:

- F2, F3 and F5 all passed.
- The complete WebKit sequence passed with zero failures.
- Visual difference from the reviewed baseline was 0.001728 (0.1728%), below
  the 15% rejection threshold.

Pull request #8 was squash-merged as
`02339ce10e63145adf7155ca6b4b1dc2ff7d7f60`.

## First main run and corrective action

Custom Pages run `30722732856` rebuilt and passed WebKit, then failed before a
Mobile Safari session existed. Artifact `8825445656` shows Appium 3.6.0 and the
XCUITest 12.1.3 driver selected an iPhone SE (3rd generation) on iOS 26.2 while
using the runner default Xcode 16.4. WebDriverAgent was therefore invoked with
`IPHONEOS_DEPLOYMENT_TARGET=26.2` under Xcode 16.4, never listened on port 8100,
and the report contains zero product checks. This is infrastructure failure,
not a game pass or game failure.

The pre-existing GitHub branch-source Pages workflow `30722732282` reported a
successful deployment for the same merge before the custom Safari job
finished. That means a post-merge-only Safari gate cannot enforce publication
ordering for this repository.

The corrective delivery therefore:

- pins `/Applications/Xcode_26.2.app/Contents/Developer` to the iOS 26.2 SE 3
  runtime instead of combining the runner's default Xcode 16.4 with the newest
  runtime;
- extends WDA startup to 180 seconds, permits three attempts and records full
  Xcode output;
- runs Mobile Safari in the pull-request workflow before the already-required
  `F3 execution` aggregate can pass, preventing every known Pages path from
  publishing an unverified merge;
- keeps the main workflow's WebKit and Mobile Safari rerun before the custom
  deploy;
- repairs the invalid multiline shell indentation in the manual verified-build
  revert workflow.

Local verification of the corrective tree:

- all changed workflows and `AI_DEVELOPMENT/STATE.yaml` parse as YAML;
- `node --check tools/test-ios-safari.mjs`, `git diff --check`,
  `npm run validate:ops`, F2 and the Level C F5 record all pass;
- `npm test` exits 0: 19/19 adversarial mutations rejected, the representative
  slice repeated twice, 5/5 endings, save migration 133/133, fault recovery
  34/34 and touch smoke 136/136.

Still required before completion: corrective PR Mobile Safari pass, merge,
main redeploy, post-deploy F6, and exact final evidence.

The Xcode 26.2 WebDriverAgent action parser requires every W3C pointer source
to begin with `pointerMove`; a delayed second source beginning with `pause` is
rejected before the page receives the gesture. The corrective harness now
positions both touch sources first, then performs the bounded simultaneous
movement/attack hold. This is a harness-compatibility repair and remains
`complete_unverified` until the exact PR head passes Mobile Safari.

PR #9 run `30726720202` created that exact Safari session and verified a
667×311 content viewport at DPR 2, five reported touch points, Mobile Safari,
WebGL, full-canvas rendering, no title overflow and 44 CSS px title controls.
It then timed out starting a game because CINDERLINE's div controls deliberately
listen to `pointerdown`/`pointerup`, while WebDriver element activation emits a
native `click`. The harness now uses W3C coordinate taps for New Game, the
system menu, Save, Resume and Continue. This preserves trusted browser input
and tests the same event path as a finger; the exact-head rerun remains blocking.
