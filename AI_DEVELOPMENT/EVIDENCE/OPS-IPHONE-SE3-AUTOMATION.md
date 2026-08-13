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
- removes the unsafe verified-build rollback claim. R2-9 means the recorded
  revision cannot safely consume current saves, so the remaining manual
  workflow is read-only diagnostic evidence and always exits nonzero without
  creating a branch, PR, deployment or repository write.

Local verification of the corrective tree:

- all changed workflows and `AI_DEVELOPMENT/STATE.yaml` parse as YAML;
- `node --check tools/test-ios-safari.mjs`, `git diff --check`,
  `npm run validate:ops`, F2 and the Level B F5 record all pass; adversarial F5
  controls reject duplicated, superseded, not-first, fenced, HTML-commented
  and out-of-section claims plus quoted/commented/escaped/tagged/anchored
  duplicate YAML keys and prototype injection (25/25), and the now-unused
  manual gate-dispatch surface was removed;
- `npm test` exits 0: 19/19 adversarial mutations rejected, the representative
  slice repeated twice, 5/5 endings, save migration 133/133, fault recovery
  34/34 and touch smoke 136/136.
- The exact current-tree WebKit command was attempted with the reviewed
  baseline required, but this Linux host lacks WebKit's GTK/GStreamer runtime
  libraries and the browser stopped before loading the product. The Actions
  job installs those libraries with `playwright install --with-deps webkit`;
  its exact-head result remains required and no local WebKit pass is claimed.
- Independent Level B source review of the current bytes passed after its
  Safari-report, Pages-ordering, F5 and unsafe-rollback findings were corrected.
  It remains conditional on exact-head CI WebKit/Mobile Safari and post-merge
  stamped F6; the PR-body F5 record does not authenticate a distinct GitHub
  reviewer identity because the active ruleset requires zero approvals.

Still required before completion: a fresh corrected exact-head Mobile Safari
pass, merge, main redeploy, post-deploy F6, and exact final evidence.

## Exact-head trusted-pointer result and duplicate boot failure (2026-08-13)

PR #9 exact head `cac890441f59c750aa045dc08a34c5ea5a10548e` produced two
same-tree Floor runs. Run `31684968784` passed F2, F5, core F3, WebKit and the
full iPhone SE 3 Mobile Safari job. Artifact `9175483294` records 30/30 product
checks, two independent three-point calibrations with transform `(offsetX 0,
offsetY 64, ratioX 1, ratioY 1)` and zero-pixel third-point residual, and six
complete trusted touch pointer pairs with no retry. Movement plus attack,
camera drag, orientation recovery, save/refresh/Continue restoration and 148
soak frames passed with no captured post-ready runtime error. The uploaded
WDA screenshots show the running game and pause surface. The MP4 is not product
evidence: although its container duration is 68.8 seconds, decoding yields only
two Home-screen frames because Appium's visible-mode restart detached the
recorder from the original CoreSimulator boot. The fresh headless run must be
inspected for actual Safari/game frames rather than treating file presence,
size or container duration as proof.

Duplicate run `31684995777` failed before creating a WebDriver session, so it
does not contradict those product checks but it does keep the required gate
red. Workflow `simctl bootstatus` had reached `Finished`; XCUITest then logged
that the simulator was booted without a visible UI, shut it down to open
`Simulator.app`, and timed out after 300 seconds. Artifact `9175448558` honestly
records `checks: []`, no calibration or interaction, and `status: failed`.

The correction sets XCUITest's documented `appium:isHeadless` capability. The
runner needs CoreSimulator, WDA, Mobile Safari, screenshots and `simctl io`
video, but no Simulator.app window. In XCUITest driver 12.1.3 the option is
passed directly to the simulator runner; when the simulator server is already
running without a UI process, headless mode preserves it rather than shutting
it down and waiting for a window.

## Exact-head headless results and native-Safari correction (2026-08-13)

PR #9 exact head `96803f87ab508b097b7b937a6ca39ed2f452fee0` produced two
runs. Both proved the headless session-start correction itself: the Appium log
contains `appium:isHeadless: true` and the already-booted headless path, with no
attempt to launch a visible Simulator UI client. Both still failed closed
before any product check for two separately observed Safari event-delivery
conditions:

- run `31687125738`, artifact `9176187067`: point 1 completed a trusted
  pointer pair, but both point-2 attempts completed in WDA with no browser
  events. The 1334x750 failure screenshot and 1,996 decoded video frames show
  Safari's native “View Bookmarks, Share Menu, and Open Tabs” education
  popover covering point 2 and remaining present through the attempts;
- run `31687149960`, artifact `9176353982`: no popover appears in the failure
  screenshot. Point 1 instead emitted exactly one trusted same-attempt,
  same-target, same-pointer sequence `pointerdown`, `touchstart`,
  `pointercancel`, `touchcancel`, with no up, end or click. Tap-adjacent decoded
  frames are visually stable. An earlier loading transition was about 11.5
  seconds before the tap and is not claimed as the cause.

The correction checks native Safari before initial calibration. It recognizes
the complete three-marker education message, requires exactly one eligible
lower-right accessibility `Close` control, activates it and verifies the
markers disappear. Partial markers, a missing or ambiguous control, invalid
bounds or failed dismissal stop the run. If no recognized education is
present, the check is a recorded no-op.

The retry policy remains two attempts total. Attempt 1 may be retried only
after zero browser events or after the exact observed cancellation grammar:
four ordered events, all boolean-trusted and on the current overlay/attempt,
one stable integer touch pointer, finite nondecreasing timestamps and no more
than 2 CSS px movement. Partial, reordered, untrusted, cross-attempt, moved,
mixed or extra events fail immediately; the same cancellation on attempt 2
exhausts the budget. A successful coordinate still requires the original clean
trusted pointerdown/pointerup pair, and the independent third-point residual,
stable-viewport and native-bound checks are unchanged. The expanded pure
battery passes 74/74 locally. This source repair is not a substitute for
execution: a fresh exact-head required run, merge, main rerun and stamped F6
remain pending.

## Exact-head native-education locator result (2026-08-13)

PR #9 exact head `50506b0acbe80f738a00a3b15c9d2c0b96d9c1b2` produced two
fresh Floor runs. Runs `31690316895` and `31690351246` both passed F2, F5,
core F3 and the complete WebKit journey. Their required Mobile Safari jobs
`94416627113` and `94416716023` both failed closed before calibration with the
same result. Artifacts `9177494972` and `9177498873` record
`checked:true`, `present:true`, `dismissed:false`, all three education markers,
`closeCandidates:[]`, `checks:[]` and no coordinate calibration.

The Appium logs establish the exact mechanism. Each run switched from its
specific `WEBVIEW_*` to `NATIVE_APP`, read a valid 35,885-byte Safari hierarchy
and a 667x375 native window, then queried `accessibility id = Close`. WDA
returned HTTP 200 with an empty element array; no element rect was requested.
The harness restored the exact original web context in `finally`. Video still
shows the one education popover and its gray circular x at approximately native
rect `{x:617,y:180,width:26,height:26}`. The failure is therefore the locator
assumption, not the existing geometry filter or a product input result. Neither
run reached the 30 product checks, and no gameplay/pause screenshot is claimed.

The follow-up does not fall back to a raw coordinate or weaken dismissal
verification. While the complete three-marker education is present, it obtains
all native `XCUIElementTypeButton` elements and records each rect, enabled and
displayed boolean, name and label. It activates a control only if exactly one is
inside the native window, enabled, displayed, 18--64 logical pixels on each
axis, aspect ratio 0.75--1.33, with its center in the rightmost 15% and middle
30--75% of the screen. These constraints select the observed nameless 26x26 x
while excluding top/bottom Safari chrome, left-side controls and the wide web
game button. Zero, multiple, hidden, disabled, malformed, oversized or
non-square candidates stop the run. The complete native source and a native
screenshot are preserved before selection, the education markers must still
disappear after activation, and the exact original web context must be restored.
The native requests use sequential bounded reads with margin above the observed
7.37-second source latency; every candidate is registered in the report before
its first metadata request, so a later timeout cannot erase partial evidence or
race an outstanding request against web-context restoration. The expanded
source/geometry/event/viewport/headless battery passes 88/88 locally. Fresh
exact-head Simulator execution remains mandatory.

## Exact-head education success and native-call reduction (2026-08-13)

PR #9 exact head `f9e026f7410c41979ac0615e191175ee5a40d338` produced three
Floor runs. All three passed F2, F5, core F3 and the complete WebKit journey;
all three required Mobile Safari jobs and aggregate F3 jobs remained red:

- run `31692588358`, job `94423780182`, artifact `9178351805`: the complete
  education path succeeded. The report records `checked:true`, `present:true`,
  `dismissed:true`, all three markers, a preserved 32,850-byte source and
  1334x750 native PNG, and nine Buttons. Exactly one was enabled and displayed:
  source name `xmark.circle.fill`, label `Close`, rect
  `{x:616,y:180,width:27,height:26}`. Its live rect/state matched, the click
  removed the markers, and the exact WEBVIEW was restored. The first subsequent
  calibration `/wda/tap` then received one proxy `ECONNRESET`; later web execute
  and screenshot requests succeeded, so no WDA crash is claimed. No product
  check completed;
- run `31692600103`, job `94423713844`, artifact `9178447264`: the source and
  PNG again identify the same unique control, but the session was already slow
  and the 24th per-Button metadata request, diagnostic `name` for hidden
  `ShareButton`, exceeded 15 seconds. Partial candidate telemetry and the exact
  error are preserved. No click or calibration occurred;
- run `31692638684`, job `94423902632`, artifact `9178452600`: WDA never opened
  port 8100 during the 180-second session-start window. The report correctly
  records `checked:false`; no education or product code ran.

The first artifact proves the one-of geometry, native click, marker-disappearance
and context-restoration correction. It does not prove the full release journey.
The 45 per-element diagnostic calls were not part of the safety decision and
materially enlarged the unstable native-command surface. The follow-up parses
all Button snapshots from the already-preserved WDA XML using a quote-aware,
entity-decoding, duplicate-rejecting scanner. It requires canonical booleans and
finite plain numeric geometry, the complete education markers and exactly one
enabled/displayed small right-center candidate with a nonblank decoded source
name. It then queries `accessibility id` with that exact name, requires exactly
one element, sequentially obtains only rect/enabled/displayed, requires all four
rect values and both booleans to match the source, and only then clicks. This
reduces selected-element lookup and validation from 45 native metadata calls to
four while retaining source, screenshot, selected candidate, live verification,
post-click marker disappearance and exact WEBVIEW restoration. Comments, CDATA,
partial tag names, malformed quotes, duplicate attributes, unknown entities,
noncanonical booleans, unit-bearing/nonfinite/zero geometry, blank names,
zero/multiple element matches, live mismatch, class-wide lookup and diagnostic
attribute-call regressions are negative controls. The battery passes 114/114
locally; fresh exact-head Simulator execution remains mandatory.

## Exact-head four-call result and bounded delivery reconciliation (2026-08-13)

PR #9 exact head `ab9af7e6f0b50e1850c743b498cf3b07438fc1ce` produced two
Floor runs. Runs `31695111944` and `31695133214` both passed F2, F5, core F3
8/8 and the complete WebKit journey. Their Mobile Safari jobs and aggregate F3
jobs remained red, so neither is a release pass.

- run `31695111944`, artifact `9179471218`: the native education path completed.
  The report records `checked/present/dismissed:true`, all three markers, nine
  source Buttons, `xmark.circle.fill` / `Close` at
  `{x:616,y:180,width:27,height:26}`, dynamic match count one, and exact live
  rect/enabled/displayed agreement. The Appium log contains one lookup and one
  rect/enabled/displayed read, no name/label reads, a successful click, marker
  disappearance and exact WEBVIEW restoration. The first later calibration
  `/wda/tap` reached the WDA proxy, then its response connection reset. The
  immediate attempt events and the final global event log were both empty;
  WDA remained reachable. The command side effect is therefore unknown, not
  claimed absent. The report failed closed with zero product checks and zero
  completed calibrations;
- run `31695133214`, artifact `9179368693`: the same four-call selection and
  live agreement succeeded, and WDA logged Find, Tap and Synthesize event for
  the element click with HTTP 200. Four subsequent full 35,885-byte sources and
  the decoded video show the popover still present. The final source request
  received only the 2,274 ms remaining in the polling deadline and timed out.
  This is a real element-click no-op followed by a secondary short-timeout,
  not selection ambiguity. The report again failed closed before calibration
  or product checks.

The follow-up replaces deadline polling with at most two explicit education
actuations. Attempt one remains the exact source-derived element click. After a
fixed settle it captures the native window, then one full source as the final
remote barrier. Only if the complete
three-marker UI and the unique Button's source index, decoded name/label,
enabled/displayed state, rect and window all exactly match the initial verified
snapshot may attempt two send one `mobile: tap` to the center freshly derived
from that source rect. It then captures one more source; only marker absence may
set `dismissed:true`. Each attempt records method, target/point, command
completion, observation source/window/markers/selection, outcome and error.
Literal or cached coordinates, changed/partial/ambiguous state, observation or
activation errors, a third attempt, and persistence after attempt two fail.

The calibration transport correction remains confined to the full-screen
calibration overlay before product interaction. Only the exact current-session
`/execute/sync` proxy error `read ECONNRESET` is eligible. The response remains
unknown and `nativeTapCompleted` remains false. Before any resend the harness
requires an exact WEBVIEW, URL, ready state, viewport, attempt registry and
connected overlay snapshot; switches to `NATIVE_APP`, reads the exact same
native window through the unchanged Appium session, restores the exact WEBVIEW; waits a
fixed settle; and takes a second atomic snapshot whose event history must extend
the first. A complete trusted pair is accepted without resend, the exact trusted
cancel uses the shared retry, and two empty stable snapshots may use attempt two.
All other errors, state changes, partial histories, health failures and attempt-
two exhaustion fail. No retry exists in the shared native-tap or product-click
functions. Every native actuation, observation and context restoration is
explicitly time-bounded, partial observation telemetry is retained, and the
restored WEBVIEW is read back and compared. The expanded fail/pass battery is
156/156 locally; fresh exact-head
Simulator execution remains mandatory.

## Exact-head product pass and orientation keep-alive boundary (2026-08-13)

PR #9 exact head `a68b8a1f160e2ccafd7ee1b3e016f1e4ce4d4ab1` supplied both
a complete product result and a separate fail-closed transport result:

- run `31698939643`, Mobile Safari job `94443913545`, artifact `9181047364`
  records `status:passed`, 30/30 checks, `failures:[]`, `errors:[]`, two
  three-point calibrations with zero independent residual, exact WEBVIEW
  restoration and valid gameplay/pause screenshots. Native education was
  present and dismissed by attempt one's source-derived element click. The
  source-exact center fallback was not needed, so attempt two is not claimed
  execution-verified;
- run `31698964713`, artifact `9180845875` failed at the first landscape
  orientation POST before navigation, education inspection, calibration or
  product checks. The report has `checks:[]` and the exact current-session
  `/orientation` proxy error `read ECONNRESET`. WDA created downstream session
  `2680F9D2-D774-476F-A31F-A22A27A06EB8` at `12:25:28.071`, Appium proxied
  the first orientation command at `12:25:57.811`, and reported the reset at
  `12:25:58.583`: 29.740 seconds idle at request dispatch and 30.512 seconds
  at the observed reset. There is no WDA orientation-handler line and the
  video remains portrait. The same downstream session then accepted DELETE
  with HTTP 200, so neither WDA death nor an invalid session explains the
  failure. The later rerun of its Mobile Safari job `94446998600`, artifact
  `9181414682`, passed 30/30 with failures/errors empty, two zero-residual
  calibrations, exact restoration and valid screenshots; aggregate F3 job
  `94452792873` was green.

The exact installed WebDriverAgent 16.1.0 package source sets
`TIMEOUT_READ_FIRST_HEADER_LINE` to 30 seconds in CocoaHTTPServer's
`HTTPConnection.m`, and begins each next keep-alive request with that timeout.
Its official orientation handler exposes GET and POST on `/orientation`: GET
reads the active application's interface orientation; POST assigns the mapped
device orientation, waits for the application to stabilize, and succeeds only
when the interface equals the target. The installed XCUITest driver 12.1.3
also catches and only warns on an initial-orientation failure, so an
`appium:orientation` capability would not provide an exact verified barrier.
Together with the timestamps and successful same-session DELETE, the evidence
supports a stale keep-alive boundary race, not unsupported rotation. This is a
source-and-log inference; the failed POST never reached a WDA handler, so no
mutation side effect is claimed.

The revision later published as exact head
`0d3de5d5ffea5485d233d8d588bce8475a1ab19e` routed all three
landscape/portrait transitions through one
`ensureOrientation` path. A bounded GET preflight drained a stale socket and
avoided POST when the exact target was already observed; only the exact
current-session GET reset could receive one read-only retry. A completed POST
was followed by a strict GET verification. Only the exact current-session POST
reset entered ambiguous-response reconciliation: after fixed settles, two
bounded GET observations had to show the target (complete without resend) or
the same opposite orientation (one resend on mutation attempt one only). A
target that changed away, unstable/invalid state, any non-exact error, or
stable opposite state after attempt two failed. There was no polling loop and
no blind POST retry; the report progressively recorded every read, mutation,
reset, decision and error. Pure decision tests and static mutation controls
enforced the exact error grammar, strict orientation values, GET budget two, mutation
budget two, three helper call sites, GET-before-POST ordering, two reset
observations and post-success verification. The expanded battery passed
197/197 locally before the exact-head executions described below.

The two successful a68 product artifacts both dismissed the education UI on
their first element click, while artifact `9179368693` had already proved that
the same verified element click can return HTTP 200 without dismissing it. A
conditional second actuation therefore cannot be execution-verified
deterministically and leaves two possible native actions in one dismissal.
That revision removed that branch. When the complete recognized native
education was present, it retained the strict source-derived selector and exact
live rect/enabled/displayed verification, then read the native window and one
fresh full source as the final remote barrier. A pure helper required the
window and unique control snapshot to match every verified field and derived
the rounded center from that fresh rect. The harness sent exactly one bounded
`mobile: tap`, recorded delivery as unknown until its response completed, and
took one post-tap window/source observation. Only complete marker absence could
set `dismissed:true`; persistence, changed or ambiguous state, transport
failure, a literal/cached point, an element click, a loop, direct tap bypass or
any second actuation failed closed. Exact WEBVIEW restoration remained bounded
and was read back.

The combined XML, geometry, dismissal, transport, event, viewport,
orientation and headless contract battery passed 206/206 locally before exact-
head execution. Its acceptance target required `checked:true`, `present:true`,
`dismissed:true`, one `source-derived-mobile-tap`, marker absence, complete
delivery, null phase errors, exact context restoration, 30/30 product checks
and green aggregate F3. The executions below disproved both the deterministic
single-tap assumption and the 15-second orientation POST budget.

## Exact-head single-tap and orientation-timeout result (2026-08-13)

PR #9 exact head `0d3de5d5ffea5485d233d8d588bce8475a1ab19e`
produced two Floor runs and one round-comparison run. Floor runs
`31703811954` and `31703841207` each passed F2, F5, core F3 and the complete
WebKit journey. Their required Mobile Safari jobs `94460020820` and
`94460501803` failed, so aggregate F3 jobs `94463581675` and `94463384345`
also failed. Round-comparison run `31703812015`, job `94459204494`, passed.

- Run `31703811954`, artifact `9182808851`, records the complete recognized
  education and exactly one `source-derived-mobile-tap` at native `(630,193)`.
  Its response completed, the post-source had no education markers,
  `dismissed:true`, all attempt errors were null, and the exact WEBVIEW was
  restored. The first calibration then completed with zero independent
  residual and the journey recorded 21 checks. The gameplay portrait POST
  began at `13:27:52.964`; device and interface orientation changed to portrait
  at `13:28:01.959` and `13:28:02.033`; WDA returned HTTP 200 at
  `13:28:08.371`, and Appium completed HTTP 200 at `13:28:08.630`, after
  15.646 seconds. Because this was 646 ms beyond the harness's 15-second
  client budget, the report conservatively recorded `commandCompleted:false`
  and `outcome:rejected-non-reset`. It did not perform a blind retry or claim
  the third orientation transition, second calibration, persistence, soak or
  30/30 product completion.

- Run `31703841207`, artifact `9182755935`, records the same unique
  `xmark.circle.fill` / `Close` control at `{x:616,y:180,width:27,height:26}`
  and exactly one source-derived tap at `(630,193)`. Appium issued one
  `/wda/tap`, XCTest synthesized it, and HTTP 200 completed, but the complete
  education remained. The before/after XML files are byte-identical with
  SHA-256 `0a692d3dd54261feb6f7b88b31dce0cbe205737f8eb145fd4505f260d8aa0981`.
  The report records `checked:true`, `present:true`, `dismissed:false`,
  response-complete delivery, exact WEBVIEW restoration and `checks:[]`.
  No element click, second tap, calibration or product interaction occurred.

Together these artifacts prove that the single coordinate tap is
nondeterministically effective and that 15 seconds is below an observed valid
orientation response. Neither artifact is a complete product pass.

The follow-up keeps the source-derived mobile tap as attempt one. A second and
final actuation is authorized only when attempt one's response completed and
one fresh full source plus native-window observation proves the complete
popover and unique control are byte-for-byte and field-for-field unchanged.
The harness then derives the accessibility name from that fresh source,
queries a new element identity, verifies its rect/enabled/displayed state
sequentially against the fresh target, and performs exactly one
`fresh-element-click`. Changed, partial, ambiguous or malformed observations,
unknown tap delivery, stale identities, live mismatch, click error,
persistence after attempt two, loops and any third actuation fail closed.

Orientation GET retained its 15-second read budget. Orientation POST used an
explicit 30-second mutation budget, above the then-observed 15.646-second valid
response. Only the exact current-session, self-generated 30-second POST timeout
is treated as response-unknown: two bounded post-settle GET observations must
prove the target, and no POST resend is allowed after that client timeout.
Changed, unstable or stable-opposite observations fail. The separate exact
proxy-reset grammar retains its existing bounded reconciliation.

The combined battery passed 256/256 locally before the `5ca4b2d` executions
below. Before merge, all required checks
must be green and one exact-head artifact must complete all three orientation
transitions, both zero-residual calibrations, 30/30 product checks,
persistence, soak, exact WEBVIEW restoration and valid screenshots. At least
one present-education artifact must also execute the fallback: attempt one
`source-derived-mobile-tap` with response-complete delivery,
`outcome:fallback-eligible` and `rawSourceUnchanged:true`, followed by attempt
two `fresh-element-click` with one fresh match, exact live verification,
response-complete delivery, marker absence and `outcome:dismissed`. A
one-attempt dismissal proves the primary path but not the new fallback.

## Exact-head fallback and measured queue-latency result (2026-08-13)

PR #9 exact head `5ca4b2d5117c118e732b99c9264a704950ffc8df`
first produced two complete product passes. Floor runs `31707697434` and
`31707770353` passed F2, F5, core F3, WebKit, Mobile Safari and aggregate F3;
round run `31707697420` also passed. Artifacts `9184459869` and `9184516978`
each record `status:passed`, empty failures/errors, 30/30 checks, three
response-complete target orientation transitions, two zero-residual
calibrations, zero-distance persistence restoration, 210/162 soak frames with
zero faults, exact WEBVIEW restoration and valid gameplay/pause screenshots.
Both education taps dismissed on attempt one (`actuationsStarted:1`), so those
artifacts prove the normal path but not the required fallback.

The unchanged exact head was then rerun without weakening its acceptance:

- Run `31707697434` attempt two, Mobile Safari job `94479531099`, artifact
  `9185145291`, executed the current fallback authorization. Attempt one's
  source-derived mobile tap completed; before/after XML was byte-identical with
  SHA-256 prefix `1c423512`, `rawSourceUnchanged:true`, and its outcome was
  `fallback-eligible`. Attempt two performed a fresh element query, obtained
  exactly one new element identity, then its first read-only rect request
  exceeded the 15-second client bound. The report retained
  `actuationsStarted:1`, sent no element click, restored the exact WEBVIEW and
  failed with `checks:[]`. Appium received the rect request after queue delay;
  WDA returned the correct `{x:616,y:180,width:27,height:26}` 144 ms after the
  client disconnected. This is a measured read-budget miss, not selector or
  session failure.
- Run `31707770353` attempt two, Mobile Safari job `94479523910`, artifact
  `9185166957`, stopped before education when initial orientation POST exceeded
  the 30-second client bound and its first reconciliation GET exceeded 15
  seconds. Appium later returned HTTP 200 for the POST with target LANDSCAPE,
  then returned LANDSCAPE for the GET. No mutation was resent and the report
  failed closed with `checks:[]`.

The latest attempts therefore left Mobile Safari and aggregate F3 red. They do
not satisfy merge acceptance, but they supply direct timing evidence. The
follow-up changes no input grammar or retry budget. A dedicated 30-second bound
applies only to attempt-two's read-only fresh element lookup and rect/enabled/
displayed verification; the mobile tap, element click, primary/post sources,
other dismissal-control commands and context restoration remain at 15 seconds,
apart from the pre-existing 60-second evidence screenshot. Failed
fallback reads remain pre-actuation and cannot send a click. Orientation GET
uses 30 seconds and POST uses 60 seconds. The exact POST-timeout path still
performs exactly two read-only observations and never resends; the separate
exact proxy-reset path retains its existing bounded decision.

The combined pure/static battery passes 268/268 locally and locks the timeout
scope, operation counts and no-resend paths. A new exact head still must provide
one artifact that executes response-complete, byte-identical attempt one;
fresh query plus all three live reads; one response-complete element click;
marker absence; exact WEBVIEW restoration; and the same-run complete 30/30
journey. Independent normal-path passes are also required.

The Xcode 26.2 WebDriverAgent action parser requires every W3C pointer source
to begin with `pointerMove`; a delayed second source beginning with `pause` is
rejected before the page receives the gesture. The corrective harness now
positions both touch sources first, then performs the bounded simultaneous
movement/attack hold. This is a harness-compatibility repair and remains
`complete_unverified` as a delivery until merge and F6. Its input behavior was
executed successfully by exact-head run `31684968784`.

PR #9 run `30724525380` created that exact Safari session and verified a
667×311 content viewport at DPR 2, five reported touch points, Mobile Safari,
WebGL, full-canvas rendering, no title overflow and 44 CSS px title controls.
It then timed out starting a game: the W3C action sent CSS viewport coordinates
directly to WebDriverAgent, whose action endpoint consumes native screen
coordinates. A 200 response therefore proved only that the malformed gesture
was accepted, not that the title control was touched.

Run `30726720202` tried WebDriver element activation instead. With Appium's
default `nativeWebTap=false`, that path used a JavaScript click atom. CINDERLINE
deliberately listens to `pointerdown`/`pointerup`, so the game again did not
start. The final PR head returned to the already-refuted raw-coordinate method.
Its 2026-08-13 rerun `30727723649` on stale synthetic merge `560c6af` recorded
the exact action at native viewport point `(569, 102)`, received HTTP 200, and
again timed out with the title screen still active. Artifact `9171059998` has
10 passing pre-interaction checks, zero interaction/persistence/soak results,
the report, video and Appium log. This conclusively refutes the final-head
input method. None of these runs is a product pass, and the PR was not merged.

The corrective tree is rebuilt on current main `f40b6d9`. It follows the
XCUITest driver's documented web/native mapping rather than guessing:

- three separated `mobile: tap` calls target a transparent overlay on the real
  product page; two trusted Safari/native point pairs solve the axis-aligned
  transform and the third independently bounds its residual error;
- identical, missing, non-numeric, non-finite, zero or negative-ratio results
  fail closed; the pure helper's positive and adversarial battery passes 20/20;
- DOM controls use their live CSS rect, transform its center and issue a native
  tap, with New Game additionally
  required to emit trusted `pointerdown` and `pointerup` events;
- canvas-only two-thumb and camera actions apply the measured transform to the
  CSS points before sending W3C actions to WebDriverAgent;
- calibration is repeated after the portrait/landscape transition and refresh.
- transient WebDriver polling and session-cleanup failures are recorded as
  diagnostics rather than mislabeled as product runtime errors. Runtime error
  listeners cover each post-ready, post-calibration journey; a boot-time error
  that occurs before listener installation, yet neither prevents `ready` nor
  enters `CINDERLINE.faults`, remains an explicit report limitation;
- F6 passes the authorized HTTP(S) proxy configuration into its Playwright
  browser as well as Node fetch, and the Pages deploy job now exports the
  deployment action's `page_url` instead of always falling through to the
  repository-specific constant.

Reference: Appium XCUITest driver, [calibrate web to real coordinates](https://appium.github.io/appium-xcuitest-driver/12.1/reference/execute-methods/#mobile-calibratewebtorealcoordinatestranslation)
and [native mobile tap](https://appium.github.io/appium-xcuitest-driver/12.1/reference/execute-methods/#mobile-tap).
The Linux checks can validate syntax, state, build, WebKit and the full browser
suite, but cannot claim the Simulator journey. The exact current-main PR head
must produce a passing report, decodable nonblank WDA screenshots and Appium
log before merge. The MP4 is diagnostic only unless decoded frames actually
show Safari/the game; file presence, byte size and container duration do not
establish that.

## Current-main exact-head failure and fail-closed correction

PR #9 Floor run `31679391955` tested remote head `43c7208` on the synthetic
merge tree. F2, F5, core F3 and the complete reviewed-baseline WebKit journey
passed. The required iPhone SE 3 Mobile Safari job `94381865597` reached Xcode
26.2, iOS 26.2, Appium 3.6.0 and XCUITest 12.1.3, then failed before the first
product interaction. Artifact `9173308510` is decisive:

- both native calibration taps reached WebDriverAgent, at `(326.5,180.5)` and
  `(340.5,194.5)`;
- Safari's calibration page reported the same DOM point `{x:480,y:171}` for
  both taps;
- XCUITest 12.1.3 divides the native delta by the DOM delta without checking
  for zero, producing non-finite fields serialized as
  `{offsetX:null,offsetY:null,pixelRatioX:null,pixelRatioY:null}`;
- the CINDERLINE harness rejected the result, wrote `checks: []` and
  `status: failed`, and made no interaction, persistence or soak claim.

The validator was not relaxed and no identity/raw-coordinate fallback was
added. The replacement calibration measures three separated trusted taps on a
transparent overlay inside the already-ready product page, rejects a repeated
point on either axis, derives four finite transform values from two points, and
requires the third to reproduce its native point within four pixels. It uses
the same transform for DOM taps and W3C canvas gestures, and avoids
poisoning Appium's native-web-tap cache and removes that capability path. The
20/20 self-test includes the captured all-null response, mixed null, missing
keys, arrays, numeric strings, NaN, both infinities, zero/negative ratios,
same/one-axis-stale points, invalid native axes and opposite-axis transforms.

`PLAYWRIGHT_BROWSERS_PATH=/tmp/cinderline-playwright node
tools/gates/f3_execution.mjs` passed all eight steps on the correction, including
the new coordinate battery, production/dev builds, Pages-root identity, story
validation and the real-browser save migration. An initial invocation without
that environment-specific browser path stopped before browser execution because
this host does not keep Playwright binaries in its default cache; CI installs
its own browsers and does not depend on the temporary path.

At that stage this was locally tested logic, not Simulator evidence.
Independent Level B exact-diff review passed those bytes; later Simulator
results and the current correction are recorded in the exact-head sections.

## Exact-head trusted-tap delivery failure

PR #9 Floor run `31682290364`, remote head `396e4f41d4d57f7f662cdeeb7ef9ca1a6ec86414`,
passed F2, F5, core F3 and the reviewed-baseline WebKit journey. Its required
Mobile Safari job failed before product interaction and was not treated as a
pass. Artifact `9174347024` contains `report.json` and the complete Appium log:

- the first `mobile: tap` at native `(173,128)` produced a trusted browser
  click at CSS `(173,64)`;
- the second native tap at `(494,248)` completed successfully in WDA, but was
  initiated about 63 ms after the first browser event was read and produced no
  second recorded click during the 15-second observation window. The Xcode log
  places the two actual XCTest event syntheses about 1.2 seconds apart, so this
  evidence does not establish a rapid/double-tap timing root cause;
- the report therefore contains `checks: []`, no calibration, interaction,
  persistence or soak result, and `status: failed`.

The validator and three-point residual threshold remain unchanged. The
trusted-pointer correction replaced the click-only, one-shot inference with exactly one
recorded and required trusted touch `pointerdown` followed by `pointerup` with
the same pointer identity and per-attempt overlay target. Each attempt has an
isolated collector; at that revision only a completely event-free first
attempt permitted one retry. Partial, cancelled, untrusted, duplicate or
cross-attempt sequences failed immediately. Every attempt and the global captured calibration-event log are preserved even when
calibration cannot finish. A 750 ms settle is a conservative supplement, not the asserted
root fix. Exact-head run `31684968784` executed this correction successfully:
all six calibration attempts completed on their first try and the full product
journey passed 30/30 checks.
Cancelled, untrusted, wrong-target, changed-pointer and excessive-movement
sequences failed closed under that reviewed revision. The then-current pure
transform, event-sequence, retry and viewport/headless-wiring battery passed
49/49 locally. Later headless runs and the bounded native-Safari correction are
recorded in the section above rather than projected onto this historical run.
