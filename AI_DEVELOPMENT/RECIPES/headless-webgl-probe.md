# Recipe — probe headless WebGL before running browser gates

- **Version:** 1.0
- **Purpose:** determine in a few seconds whether this environment can run the Gate B browser
  harnesses at all, instead of discovering it part-way through a long suite.
- **Last verified:** 2026-08-01 at `193f408`, Playwright 1.56.0.

## Applicability

Run at the start of any run that intends to execute `npm run test:gate-b`, `npm test`,
`tools/playthrough.mjs`, `tools/perf.mjs` or any other harness that renders through three.js.

Environments differ in ways that matter and are not visible from the file system. The public cloud
browser used during `OPS-REMOTE-PUBLISH` had WebGL **disabled**, so the deployed bundle loaded to
renderer initialization and stopped; the container used for the 2026-08-01 migration had SwiftShader
WebGL 2.0 available and could have run the full harness.

**Do not** use the result as evidence about the product. It is a statement about the environment.

## Inputs and dependencies

`npm ci` completed; `playwright` installed; browsers present. In this container they are
pre-installed at `/opt/pw-browsers` and `PLAYWRIGHT_BROWSERS_PATH` is already exported — do not run
`playwright install`.

## Usage

```sh
node -e "
import('playwright').then(async ({ chromium }) => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const page = await browser.newPage();
  await page.setContent('<canvas id=c></canvas>');
  const version = await page.evaluate(() => {
    const canvas = document.getElementById('c');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    return gl ? gl.getParameter(gl.VERSION) : null;
  });
  console.log('WEBGL:', version);
  await browser.close();
}).catch((error) => { console.log('LAUNCH FAILED:', error.message.split('\n')[0]); });
"
```

## Interpreting the result

| Output | Meaning |
|---|---|
| `WEBGL: WebGL 2.0 (...)` | Browser gates can run. Record the renderer in the evidence environment field. |
| `WEBGL: null` | The browser launched but has no WebGL. Rendering harnesses will fail at renderer init. Record `blocked`, not `failed` — the product is not implicated. |
| `LAUNCH FAILED: ...` | No usable browser. Record `blocked` and, if the harness matters to the task, prepare it and record `prepared_not_executed`. |

## Limitations and known failure modes

- **SwiftShader is software rendering. It is not a GPU and not a device.** A pass here supports
  reachability, interaction and integrity checks. It supports **no** frame-rate, thermal, battery
  or touch-hardware claim, and never satisfies blocker `B1`.
- WebGL availability does not imply adequate performance. `tools/perf.mjs` deliberately refuses to
  emit an fps figure from this environment for exactly that reason.
- A pass says nothing about the *deployed* surface. Verify the public URL separately (`OF-006`).

## Evidence

2026-08-01, this container: the probe printed
`WEBGL: WebGL 2.0 (OpenGL ES 3.0 Chromium)`, recorded in `AI_DEVELOPMENT/CAPABILITIES.yaml` under
`headless_browser` with its limitations.

Contrasting case, 2026-07-31: `AI_DEVELOPMENT/EVIDENCE/OPS-REMOTE-PUBLISH.md` records the public
cloud browser loading the deployed bundle with WebGL disabled — reported as blocked by environment,
never as a product failure and never as a pass.
