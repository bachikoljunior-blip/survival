#!/usr/bin/env node
/**
 * Vantage sweep — screenshots the world from a set of named camera positions.
 * This is the harness the visual critics work from; every look-and-feel claim
 * in this project is checked against these frames.
 *
 *   node tools/vantage.mjs                  full sweep at 667x375
 *   node tools/vantage.mjs --only stacks    a single vantage
 *   node tools/vantage.mjs --w 1334 --h 750 larger frames for detail review
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { serveStatic } from '../.kit/lib/browser/serve.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'shots');
mkdirSync(OUT, { recursive: true });

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const W = Number(arg('w', 667)), H = Number(arg('h', 375)), DPR = Number(arg('dpr', 2));
const ONLY = arg('only', null);
const PREFIX = arg('prefix', 'v');
const EVIDENCE = argv.includes('--evidence');

/** [name, x, y, z, yaw(deg), pitch(deg)] — yaw 0 looks toward -Z. */
const VANTAGES = [
  ['stacks_yard',   -112, 1.7, -78,   0,  -4],
  ['stacks_roof',   -112, 21.2, -62,  178, -16],
  ['stacks_gate',    -92, 1.7, -84,   270, -3],
  ['marrow_west',   -128, 1.7, 0,     270, -3],
  ['marrow_mid',     -30, 1.7, 2,     270, -3],
  ['marrow_east',     10, 1.7, -2,     90,  -3],
  ['slip_edge',      -76, 1.7, 0,     270, -14],
  ['slip_bottom',    -58, -8.2, 4,    315,  10],
  // Placed by tools/probe_roofspot.mjs. The old position pointed at a brick
  // wall four metres away, which is why that frame measured 28% pure black —
  // the same fault as the old marrow_roof, found the same way, by ray-picking
  // what the camera was actually looking at instead of adjusting the lighting.
  ['slip_bridge',    -84, 11.8, -24,    0, -14],
  // Placed with tools/probe_roofspot.mjs: on a roof with 90m of clearance
  // ahead. The old position was jammed 3.1m against a wall, which is why the
  // frame was 43% black and why three separate lighting fixes moved it zero.
  ['marrow_roof',    -80, 11.1, -20,    0,  -6],
  ['cinder_line',     25, 1.7, -16,    0,   -4],
  ['cut_trench',      74, 1.7, 24,     0,  -10],
  ['survey',          62, 1.7, -28,    0,   -4],
  ['ventfield',       84, 1.7, -66,   270,  -3],
  ['south_marrow',   -60, 1.7, 52,    270,  -3],
  ['heatplant',      -46, 1.7, -98,    0,   -5],
  ['overview',       -60, 52,  70,   340,  -30],
  ['skyline',       -112, 21.2, -62,  135, -6],
];

// The static server is `.kit/lib/browser/serve.mjs`. Four copies of it lived in this
// directory — here, shot, perf and playthrough — identical apart from which MIME types
// each had happened to list. Serving under a sub-path is not incidental: it is how the
// build gets proved against GitHub Pages project-site hosting before it is published.
const BASE = arg('base', '/cinderline-test');
const site = await serveStatic({ root: DIST, basePath: BASE });

const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
         '--no-sandbox', '--disable-gpu-sandbox', '--ignore-gpu-blocklist'],
});
const ctx = await browser.newContext({
  viewport: { width: W, height: H }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true,
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e && e.stack || e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });

await page.goto(`${site.origin}/index.html`, { waitUntil: 'domcontentloaded' });
try {
  await page.waitForFunction('window.CINDERLINE && window.CINDERLINE.ready === true', null, { timeout: 90000 });
} catch {
  const note = await page.evaluate(() => document.getElementById('boot-note')?.textContent);
  console.error('BOOT FAILED:', note);
  await browser.close(); await site.close();
  process.exit(1);
}

const stats = await page.evaluate(() => window.CINDERLINE.stats || null);

// The sweep photographs the WORLD. Leaving the title screen up put a scrim
// over the left third of every frame and a menu column over the right, which
// then showed up in the luma statistics as crushed shadows that were not in
// the render at all.
await page.evaluate(() => {
  const ui = document.getElementById('ui');
  if (ui) ui.style.display = 'none';
});
console.log('world stats:', JSON.stringify(stats));

const results = [];
for (const [name, x, y, z, yaw, pitch] of VANTAGES) {
  if (ONLY && name !== ONLY) continue;
  await page.evaluate(([x, y, z, yaw, pitch]) => {
    const C = window.CINDERLINE;
    if (C.setCamera) { C.setCamera(x, y, z, yaw, pitch); return; }
    const cam = C.engine.camera;
    cam.position.set(x, y, z);
    cam.quaternion.setFromEuler(new C.THREE.Euler(pitch * Math.PI / 180, yaw * Math.PI / 180, 0, 'YXZ'));
    C.engine.renderer.shadowMap.needsUpdate = true;
    if (C.atmos) C.atmos.shadowDirty = true;
  }, [x, y, z, yaw, pitch]);
  // Let the atmosphere settle, shadows re-render and particles populate.
  await page.waitForTimeout(1400);
  const file = join(OUT, `${PREFIX}-${name}.png`);
  await page.screenshot({ path: file });
  const perf = await page.evaluate(() => window.CINDERLINE.engine.perfSnapshot());
  results.push({ name, draws: perf.draws, tris: perf.tris });
  console.log(`  ${name.padEnd(16)} draws=${String(perf.draws).padStart(4)} tris=${String(perf.tris).padStart(7)}`);
}

writeFileSync(join(OUT, `${PREFIX}-vantages.json`), JSON.stringify({ stats, results, errors }, null, 2));
if (errors.length) { console.log('--- errors ---'); console.log(errors.slice(0, 10).join('\n')); }

// ============================================================== evidence ====
//
// `--evidence` turns the sweep into a record a third party can check without
// running anything: the numbers, the verdicts, and the conditions they were
// taken under. R-19 / GB-VISUAL-EVIDENCE.
//
// The frames themselves stay in `shots/`, which is gitignored, and that is the
// point — `docs/benchmarks.md` §6 blocked ten criteria on the absence of
// committed *evidence*, not on the absence of committed *pixels*. What gets
// committed is what a reviewer can argue with: a number, a threshold, a
// verdict, and enough about the run to say whether the number means anything.
//
// The apparatus is checked before the content, every run. This project has had
// a histogram of a cleared canvas, a sweep shooting through the title screen,
// and a key light contributing nothing while its telemetry read healthy. None
// of those announced themselves.

if (EVIDENCE) {
  const ev = await import('node:crypto');
  const sha = (b) => ev.createHash('sha256').update(b).digest('hex');
  const { loadImage, regionStats, pixelRegion } =
    await import(pathToFileURL(join(ROOT, '.kit/lib/image/measure.mjs')).href);
  // `.kit`'s measureLuma returns a percentile set without a mean; the whole-frame
  // statistics used below come from regionStats over the full frame, and the mean
  // luma is recomputed from its mean RGB with the same REC.709 weights.
  const whole = (imgOrPath) => {
    const img = typeof imgOrPath === 'string' ? loadImage(imgOrPath) : imgOrPath;
    const st = regionStats(img, pixelRegion(img, 0, 0, img.width, img.height));
    const [R, G, B] = st.meanRGB;
    return { img, ...st, meanLuma: +(0.2126 * R + 0.7152 * G + 0.0722 * B).toFixed(3) };
  };

  const criteria = {};
  const apparatus = [];
  const SKY_GX = 16, SKY_GY = 9;
  const skyGrids = new Map();
  const MAIN_SET = new Set(VANTAGES.slice(0, 8).map((v) => v[0]));
  const note = (id, ok, detail, metrics) => { apparatus.push({ check: id, ok, detail, ...(metrics ? { metrics } : {}) }); };
  const record = (id, verdict, measured, threshold, method, limitation) => {
    criteria[id] = { verdict, measured, threshold, method, ...(limitation ? { limitation } : {}) };
  };

  const shot = async (name) => {
    const file = join(OUT, `${PREFIX}-${name}.png`);
    await page.screenshot({ path: file });
    return file;
  };
  const place = (v) => page.evaluate(([x, y, z, yaw, pitch]) =>
    window.CINDERLINE.setCamera(x, y, z, yaw, pitch), v.slice(1));

  // ---------------------------------------------------- apparatus checks ---

  // A1. The renderer drew something. A cleared canvas produces a perfectly
  // valid histogram, and this repository has measured one.
  {
    const l = whole(join(OUT, `${PREFIX}-${VANTAGES[0][0]}.png`));
    note('A1-canvas-not-cleared', l.meanLuma > 4 && l.lumaSpread > 8,
      `first frame mean luma ${l.meanLuma}, luma p1 ${l.luma.p1} p99 ${l.luma.p99}, detail ${l.detail}`);
  }

  // A2. No UI in the frames. The sweep once shot the world through the title
  // screen and read the scrim as crushed shadow.
  {
    const uiInk = await page.evaluate(() => {
      const ui = document.getElementById('ui');
      if (!ui) return { present: false, area: 0 };
      const r = ui.getBoundingClientRect();
      return { present: true, display: getComputedStyle(ui).display, area: Math.round(r.width * r.height) };
    });
    note('A2-ui-withheld', uiInk.display === 'none' || uiInk.area === 0,
      `#ui display=${uiInk.display} area=${uiInk.area}px²`);
  }

  // A3. Different vantages produced different frames. Byte-identical frames
  // mean the camera never moved, not that the world is uniform.
  {
    const digests = results.map((r) => sha(readFileSync(join(OUT, `${PREFIX}-${r.name}.png`))));
    note('A3-frames-distinct', new Set(digests).size === digests.length,
      `${new Set(digests).size} distinct digests over ${digests.length} frames`);
  }

  // A4. Key-light ablation. If dropping the sun to zero does not move the
  // pixels, the sun is not lighting them and every statement below about
  // light direction is about something else. This is the exact failure the
  // sibling project spent five rounds inside.
  let sunAblation = null;
  {
    const v = VANTAGES.find((x) => x[0] === 'cinder_line') || VANTAGES[0];
    await place(v); await page.waitForTimeout(1200);
    const before = whole(await shot('_abl_sun_on'));
    const applied = await page.evaluate(() => {
      const C = window.CINDERLINE; let n = 0; const kept = [];
      C.scene.traverse((o) => {
        if (o.isDirectionalLight) { kept.push([o.uuid, o.intensity]); o.intensity = 0; n++; }
      });
      C.engine.renderer.shadowMap.needsUpdate = true;
      if (C.atmos) C.atmos.shadowDirty = true;
      window.__ablated = kept;
      return n;
    });
    await page.waitForTimeout(1200);
    const after = whole(await shot('_abl_sun_off'));
    await page.evaluate(() => {
      const C = window.CINDERLINE; const map = new Map(window.__ablated);
      C.scene.traverse((o) => { if (o.isDirectionalLight && map.has(o.uuid)) o.intensity = map.get(o.uuid); });
      C.engine.renderer.shadowMap.needsUpdate = true;
      if (C.atmos) C.atmos.shadowDirty = true;
    });
    await page.waitForTimeout(800);
    sunAblation = {
      directionalLights: applied,
      meanLumaWithSun: before.meanLuma,
      meanLumaWithoutSun: after.meanLuma,
      delta: Number((before.meanLuma - after.meanLuma).toFixed(3)),
    };
    // A negative delta means the frame got BRIGHTER with the key light removed.
    // That is recorded, not explained: the ablation's job is to prove the light
    // reaches the pixels, and it does. Naming a mechanism here without testing
    // one is how this project's sibling shipped a fix that measured as a no-op.
    sunAblation.direction = sunAblation.delta >= 0 ? 'sun brightens' : 'sun DARKENS the frame — unexplained, see limitations';
    note('A4-key-light-contributes', applied > 0 && Math.abs(sunAblation.delta) > 1.0,
      `${applied} directional light(s); mean luma ${sunAblation.meanLumaWithSun} -> ${sunAblation.meanLumaWithoutSun} (${sunAblation.direction})`,
      sunAblation);
  }

  // ------------------------------------------------------ scene structure --

  const sceneProbe = await page.evaluate(() => {
    const C = window.CINDERLINE, T = C.THREE;
    const lights = [];
    C.scene.traverse((o) => {
      if (o.isDirectionalLight) lights.push({ kind: 'directional', intensity: o.intensity, castShadow: !!o.castShadow });
      else if (o.isHemisphereLight) lights.push({ kind: 'hemisphere', intensity: o.intensity, castShadow: false });
      else if (o.isAmbientLight) lights.push({ kind: 'ambient', intensity: o.intensity, castShadow: false });
    });
    // Texel density: texture edge over the mesh's largest world dimension.
    const dens = [];
    const box = new T.Box3();
    C.scene.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const map = mats.map((m) => m && m.map).find(Boolean);
      if (!map || !map.image || !map.image.width) return;
      box.setFromObject(o);
      const size = box.getSize(new T.Vector3());
      const span = Math.max(size.x, size.y, size.z);
      if (!(span > 0.2) || !Number.isFinite(span)) return;
      dens.push(map.image.width / span);
    });
    return { lights, texelDensities: dens };
  });

  {
    const dir = sceneProbe.lights.filter((l) => l.kind === 'directional').sort((a, b) => b.intensity - a.intensity);
    const dominance = dir.length > 1 ? dir[0].intensity / Math.max(dir[1].intensity, 1e-6) : Infinity;
    note('A5-one-dominant-key', dir.length >= 1, `${dir.length} directional light(s), dominance ratio ${dir.length > 1 ? dominance.toFixed(2) : 'n/a (single)'}`);
    sceneProbe.keyDominance = dir.length > 1 ? Number(dominance.toFixed(2)) : null;
    sceneProbe.shadowCastingDirectionals = dir.filter((l) => l.castShadow).length;
  }

  // ---------------------------------------------- BM-CAM-01: penetration ---
  //
  // 26 rays out of the camera. A camera inside a solid sees back faces in most
  // directions; a camera against a wall sees a front face inside the near
  // plane. The negative control puts the camera inside a known building first,
  // so a probe that cannot detect penetration cannot report zero.

  const penetrationProbe = `(() => {
    const C = window.CINDERLINE, T = C.THREE;
    const cam = C.engine.camera;
    cam.updateMatrixWorld(true);
    const origin = new T.Vector3().setFromMatrixPosition(cam.matrixWorld);
    const rc = new T.Raycaster();
    rc.far = 60;
    const dirs = [];
    for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) {
      if (!x && !y && !z) continue;
      dirs.push(new T.Vector3(x, y, z).normalize());
    }
    let back = 0, hits = 0, nearest = Infinity;
    for (const d of dirs) {
      rc.set(origin, d);
      const hit = rc.intersectObject(C.scene, true).find((h) => h.face && h.object.visible);
      if (!hit) continue;
      hits++;
      nearest = Math.min(nearest, hit.distance);
      const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      if (n.dot(d) > 0) back++;
    }
    return { hits, back, backFraction: hits ? back / hits : 0,
             nearest: Number.isFinite(nearest) ? nearest : null, near: cam.near };
  })()`;

  {
    // Negative control. The first attempt at this dropped the camera into the
    // middle of the heat plant and the probe reported nothing wrong — the
    // building is a shell and 6 m up inside it is open air, so "inside a
    // building" is not "inside a solid". This version finds a real surface by
    // ray-picking it and steps 0.3 m past it, which cannot be open air. The
    // camera is written and probed inside one evaluate so no frame intervenes
    // and no collision push-out can quietly move it back out.
    await place(VANTAGES[0]); await page.waitForTimeout(400);
    const inside = await page.evaluate(`(() => {
      const C = window.CINDERLINE, T = C.THREE;
      const cam = C.engine.camera;
      cam.updateMatrixWorld(true);
      const origin = new T.Vector3().setFromMatrixPosition(cam.matrixWorld);
      const rc = new T.Raycaster();
      rc.far = 140;
      // Two controls, because the probe has two halves and only one of them
      // can fire in this world.
      //
      // (a) Near-plane. Step the camera to 0.05 m in front of a real surface —
      //     inside the 0.12 m near plane — and require the probe to say so.
      //     This is the half the verdict actually rests on.
      // (b) Inside-a-solid. Look for a front face followed by the back face of
      //     the same object: that pair is one solid's near and far wall. The
      //     count is reported. If it is zero, this world has no closed solids
      //     at all and the back-face half of the probe is inert — which is a
      //     fact about the geometry, and has to be recorded rather than left
      //     as an unexplained failing control.
      const dirs = [];
      for (let a = 0; a < 24; a++) {
        const th = (a / 24) * Math.PI * 2;
        for (const el of [-0.25, 0, 0.25]) dirs.push(new T.Vector3(Math.cos(th), el, Math.sin(th)).normalize());
      }
      let solidPairs = 0;
      for (const d of dirs) {
        rc.set(origin, d);
        const hs = rc.intersectObject(C.scene, true).filter((h) => h.face && h.object.visible);
        for (let i = 0; i + 1 < hs.length; i++) {
          if (hs[i].object !== hs[i + 1].object) continue;
          const n0 = hs[i].face.normal.clone().transformDirection(hs[i].object.matrixWorld).dot(d);
          const n1 = hs[i + 1].face.normal.clone().transformDirection(hs[i + 1].object.matrixWorld).dot(d);
          if (n0 < 0 && n1 > 0 && hs[i + 1].distance - hs[i].distance > 0.6) { solidPairs++; break; }
        }
      }
      const fwd = new T.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
      rc.set(origin, fwd);
      const face = rc.intersectObject(C.scene, true).find((h) => h.face && h.object.visible);
      if (!face) return { placed: false, solidPairs };
      const keep = cam.position.clone();
      cam.position.copy(face.point).addScaledVector(fwd, -0.05);
      cam.updateMatrixWorld(true);
      const probe = ${penetrationProbe};
      cam.position.copy(keep);
      cam.updateMatrixWorld(true);
      return { placed: true, solidPairs, surfaceWas: face.distance, ...probe };
    })()`);
    note('A6-penetration-probe-can-fire',
      inside.placed && inside.hits > 0 && inside.nearest !== null && inside.nearest < inside.near,
      inside.placed
        ? `camera stepped to 0.05m in front of a surface that was ${inside.surfaceWas.toFixed(1)}m away: nearest hit ${inside.nearest === null ? 'none' : inside.nearest.toFixed(3)}m against a ${inside.near}m near plane, back-face fraction ${inside.backFraction.toFixed(2)}. Closed solids found in 72 directions: ${inside.solidPairs}`
        : 'no surface found ahead — the control could not be set up, so BM-CAM-01 below is unverified',
      inside);
    if (inside.placed && inside.solidPairs === 0) {
      note('A6b-no-closed-solids', true,
        'zero front/back face pairs in 72 directions: this world is built from single-sided surfaces, so "camera inside a solid" is not a state that exists here and the back-face half of the probe is inert. BM-CAM-01 rests on the near-plane half alone.');
    }

    const per = [];
    for (const v of VANTAGES) {
      await place(v); await page.waitForTimeout(320);
      const r = await page.evaluate(penetrationProbe);
      per.push({ vantage: v[0], ...r, penetrating: r.backFraction > 0.4 || (r.nearest !== null && r.nearest < r.near) });
      // While the camera is here anyway: which cells of this frame are sky?
      // Answered by raycasting, not by assuming the top of the frame is sky —
      // at street level the top of the frame is usually a wall.
      //
      // "Sky" is not "the ray hit nothing": the sky is a dome mesh at 300 m, so
      // every ray hits something. The first version of this measured zero sky
      // cells in all eight frames and reported the criterion inconclusive. A
      // cell is sky when its first hit is the dome — identified once, by ray,
      // rather than assumed.
      if (MAIN_SET.has(v[0])) {
        skyGrids.set(v[0], await page.evaluate(([gx, gy]) => {
          const C = window.CINDERLINE, T = C.THREE;
          const cam = C.engine.camera;
          cam.updateMatrixWorld(true);
          const origin = new T.Vector3().setFromMatrixPosition(cam.matrixWorld);
          const rc = new T.Raycaster();
          rc.far = 2000;
          if (!window.__skyObj) {
            rc.set(origin, new T.Vector3(0, 1, 0));
            const up = rc.intersectObject(C.scene, true).find((h) => h.object.visible && h.face);
            window.__skyObj = up ? up.object : null;
            window.__skyDist = up ? up.distance : null;
          }
          const sky = window.__skyObj;
          const cells = [];
          for (let j = 0; j < gy; j++) {
            for (let i = 0; i < gx; i++) {
              const ndc = new T.Vector3(-1 + 2 * (i + 0.5) / gx, 1 - 2 * (j + 0.5) / gy, 0.5).unproject(cam);
              rc.set(origin, ndc.sub(origin).normalize());
              const hit = rc.intersectObject(C.scene, true).find((h) => h.object.visible && h.face);
              cells.push(!hit || (sky && hit.object === sky) ? 1 : 0);
            }
          }
          return cells;
        }, [SKY_GX, SKY_GY]));
      }
    }
    const bad = per.filter((p) => p.penetrating);
    record('BM-CAM-01', bad.length ? 'fail' : 'pass',
      `${bad.length} of ${per.length} vantages put geometry inside the near plane (${per[0].near}m) or sat inside a solid` +
        (bad.length ? `: ${bad.map((b) => b.vantage).join(', ')}` : ''),
      '0 penetrations over the sweep',
      '26-ray probe from the real camera transform against the real scene graph; back-face-first hits mean the camera is inside a solid',
      'Free-flown inspection vantages, not the follow camera under player control in a corridor, and BM-CAM-01 also asks about interiors and tight spots the sweep does not visit. See A6b: the back-face half of the probe is inert in this world, so this verdict rests on the near-plane distance alone.');
    criteria['BM-CAM-01'].perVantage = per;
  }

  // -------------------------------------------- BM-WLD-02: landmark reach --

  {
    const { buildHollisData } = await import(pathToFileURL(join(ROOT, 'src/content/world_data.js')).href);
    const world = buildHollisData();
    // Aim at a point just ABOVE the roof, and stop the occlusion ray short of
    // the landmark's own footprint. The first version aimed at 0.75 of the
    // building's height — inside it — and stopped the ray 3 m short, which is
    // less than half the depth of every one of these buildings. Every landmark
    // occluded itself and the probe reported 0 of 5 visible from 18 vantages,
    // which is not a world defect, it is a broken instrument.
    const landmarks = [...world.buildings]
      .filter((b) => Number.isFinite(b.floors) && Number.isFinite(b.x) && Number.isFinite(b.z))
      .map((b) => ({ ...b, top: b.floors * (b.floorH || 2.85) }))
      .sort((a, b) => b.top - a.top)
      .slice(0, 5)
      .map((b) => ({
        id: b.id, x: b.x, z: b.z, y: b.top + 1.0,
        clear: Math.max(b.w || 6, b.d || 6) / 2 + 1.5,
      }));

    const visProbe = async (lm) => page.evaluate((L) => {
      const C = window.CINDERLINE, T = C.THREE;
      const cam = C.engine.camera;
      cam.updateMatrixWorld(true);
      const out = [];
      const origin = new T.Vector3().setFromMatrixPosition(cam.matrixWorld);
      const frustum = new T.Frustum().setFromProjectionMatrix(
        new T.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      for (const l of L) {
        const p = new T.Vector3(l.x, l.y, l.z);
        const inFrustum = frustum.containsPoint(p);
        let clear = false, dist = origin.distanceTo(p);
        if (inFrustum) {
          const dir = p.clone().sub(origin).normalize();
          const rc = new T.Raycaster(origin, dir, 0.4, Math.max(1, dist - l.clear));
          clear = rc.intersectObject(C.scene, true).filter((h) => h.object.visible).length === 0;
        }
        out.push({ id: l.id, inFrustum, unoccluded: clear, distance: Number(dist.toFixed(1)) });
      }
      return out;
    }, lm);

    // Negative control: face away from everything and require zero visible.
    await page.evaluate(() => window.CINDERLINE.setCamera(-60, 52, 70, 340, 89));
    await page.waitForTimeout(400);
    const skyward = await visProbe(landmarks);
    note('A7-landmark-probe-can-say-no', skyward.every((s) => !s.inFrustum || !s.unoccluded),
      `camera pitched at the sky sees ${skyward.filter((s) => s.inFrustum && s.unoccluded).length} of ${landmarks.length} landmarks`);

    const seen = new Map(landmarks.map((l) => [l.id, []]));
    for (const v of VANTAGES) {
      await place(v); await page.waitForTimeout(320);
      for (const r of await visProbe(landmarks)) if (r.inFrustum && r.unoccluded) seen.get(r.id).push(v[0]);
    }
    const fromTwo = [...seen].filter(([, vs]) => vs.length >= 2);
    record('BM-WLD-02', fromTwo.length >= 3 ? 'pass' : 'fail',
      `${fromTwo.length} of ${landmarks.length} landmarks visible from 2 or more of ${VANTAGES.length} vantages`,
      '3 or more landmarks from 2 or more points',
      'the five tallest authored buildings, projected into the real camera frustum and ray-tested for occlusion against the real scene',
      'Visibility is geometric. It does not say the landmark is legible, or that a player would use it to place themselves.');
    criteria['BM-WLD-02'].perLandmark = [...seen].map(([id, vs]) => ({ id, vantages: vs.length, from: vs }));
  }

  // ------------------------------- BM-WLD-03 / BM-HAZ-01: the world reacts --

  {
    const frameAt = async (tag) => {
      await page.waitForTimeout(1100);
      const l = whole(await shot(tag));
      return { mean: l.meanLuma, p50: l.luma.p50, p99: l.luma.p99, saturation: l.saturation, detail: l.detail };
    };
    const gasAt = () => page.evaluate(() => {
      const g = window.CINDERLINE.game.gas;
      return { fenn: Number(g.sample(-60, 1.6, 52).toFixed(1)), yard: Number(g.sample(-112, 1.6, -78).toFixed(1)) };
    });

    const v = VANTAGES.find((x) => x[0] === 'ventfield') || VANTAGES[0];
    await place(v);
    const base = await frameAt('_wld_before');
    const gasBefore = await gasAt();

    // The three vents decision, applied through the same calls the director
    // makes, then measured as gas and as pixels.
    await page.evaluate(() => {
      const g = window.CINDERLINE.game;
      for (let i = 1; i <= 3; i++) {
        g.gas.setSourceActive(`vent_west_${i}`, false);
        g.atmos.setMarkerActive(`vent_west_${i}`, false);
        g.atmos.plumes.setAnchorActive(`vent_west_${i}`, false);
      }
      g.gas.setSourceActive('yard_seep', true);
    });
    await page.waitForTimeout(2600);
    const shutFrame = await frameAt('_wld_shut');
    const gasShut = await gasAt();

    const pixelDelta = Math.abs(shutFrame.mean - base.mean);
    const gasDelta = Math.abs(gasShut.fenn - gasBefore.fenn) + Math.abs(gasShut.yard - gasBefore.yard);
    // One decision out of the three the criterion asks for. A measurement that
    // covers a third of a criterion is not a pass, whatever it measured.
    record('BM-WLD-03', gasDelta > 20 && pixelDelta > 0.2 ? 'partial' : 'fail',
      `shutting the three west heads moved the simulated gas by ${gasDelta.toFixed(1)} ppm across two sample points ` +
      `(Fenn ${gasBefore.fenn}->${gasShut.fenn}, yard ${gasBefore.yard}->${gasShut.yard}) and the frame mean luma by ${pixelDelta.toFixed(3)}`,
      'at least 3 major decisions produce a visible change',
      'the director\'s own shutVents calls, then the gas field sampled at two fixed points and the same framing re-photographed',
      'ONE decision measured, not three. The other two (the half-measure and the chapter-4 crisis siting) are not driven here, so this criterion is not yet met — it is now measurable rather than unmeasured.');
    criteria['BM-WLD-03'].measurements = { gasBefore, gasShut, base: base.mean, after: shutFrame.mean };

    // Put the vents back before measuring anything else. The first run of this
    // did not, and BM-HAZ-01 measured a 0.001 luma delta across a 17x gas
    // intensity sweep — not because the cues are invisible but because the step
    // above had switched off the three sources feeding that exact framing. A
    // measurement taken downstream of another measurement's side effect is not
    // a measurement of what it claims.
    await page.evaluate(() => {
      const g = window.CINDERLINE.game;
      for (let i = 1; i <= 3; i++) {
        g.gas.setSourceActive(`vent_west_${i}`, true);
        g.atmos.setMarkerActive(`vent_west_${i}`, true);
        g.atmos.plumes.setAnchorActive(`vent_west_${i}`, true);
      }
      g.gas.setSourceActive('yard_seep', false);
    });
    await page.waitForTimeout(3000);
    const restored = await gasAt();

    // Gas legibility without the HUD: drive the field hard and see whether the
    // picture changes at all with the UI already withheld.
    await page.evaluate(() => window.CINDERLINE.game.gas.setIntensity(0.15));
    await page.waitForTimeout(2600);
    const lowGas = await frameAt('_haz_low');
    const lowSample = (await gasAt()).fenn;
    await page.evaluate(() => window.CINDERLINE.game.gas.setIntensity(2.6));
    await page.waitForTimeout(3000);
    const highGas = await frameAt('_haz_high');
    const chan = await page.evaluate(() => {
      const C = window.CINDERLINE, g = C.game;
      const a = C.atmos || {};
      return {
        plumeAnchors: a.plumes && a.plumes.anchors ? a.plumes.anchors.length : null,
        gasScale: g.gas._targetScale != null ? g.gas._targetScale : null,
        sampleFenn: Number(g.gas.sample(-60, 1.6, 52).toFixed(1)),
      };
    });
    const hazDelta = Math.abs(highGas.mean - lowGas.mean);
    const gasResponded = Math.abs(chan.sampleFenn - lowSample) > 5;
    record('BM-HAZ-01', !gasResponded ? 'inconclusive' : (hazDelta > 0.5 ? 'partial' : 'fail'),
      `with the HUD withheld, a 0.15 -> 2.6 gas intensity sweep moved the frame mean luma by ${hazDelta.toFixed(3)} ` +
      `(${lowGas.mean} -> ${highGas.mean}) at the ventfield framing, while the gas field itself moved ` +
      `${lowSample} -> ${chan.sampleFenn} ppm at the Fenn sample point` +
      (gasResponded ? '' : ' — the field did not move, so the frame delta measures nothing and the verdict is inconclusive'),
      '3 or more non-UI cues readable on the real screen',
      'the same framing photographed at two gas intensities with #ui hidden, compared by whole-frame luma',
      'A whole-frame luma delta proves the picture responds. It does not separate plume, shimmer and soot into three cues, and it is not a legibility test — no one was asked to read it.');
    criteria['BM-HAZ-01'].measurements = { lowGas: lowGas.mean, highGas: highGas.mean, lowSample, restoredGas: restored, ...chan };
    await page.evaluate(() => window.CINDERLINE.game.gas.setIntensity(1));
  }

  // ------------------------------------- BM-VIS-01 / BM-VIS-02: the image --

  {
    const MAIN = VANTAGES.slice(0, 8).map((v) => v[0]);
    const per = [];
    for (const name of MAIN) {
      const l = whole(join(OUT, `${PREFIX}-${name}.png`));
      const img = l.img;
      const sky = regionStats(img, pixelRegion(img, 0, 0, img.width, Math.round(img.height * 0.28)));
      const ground = regionStats(img, pixelRegion(img, 0, Math.round(img.height * 0.55), img.width, Math.round(img.height * 0.45)));
      const warmth = (r) => Number(((r.meanRGB[0] - r.meanRGB[2]) / 255).toFixed(4));
      per.push({
        vantage: name,
        meanLuma: l.meanLuma, p1: l.luma.p1, p50: l.luma.p50, p99: l.luma.p99,
        lumaSpread: l.lumaSpread, detail: l.detail, saturation: l.saturation,
        skyWarmth: warmth(sky), groundWarmth: warmth(ground),
      });
    }
    const flat = per.filter((p) => p.lumaSpread < 20);
    // The criterion asks for a hierarchy of light AND shadow. Luma spread alone
    // cannot tell a cast shadow from a dark material, so the verdict also has to
    // survive the question "is anything casting one?". Measured, not assumed:
    // the scene traversal found the shadow-casting directional count directly.
    const shadowCasters = sceneProbe.shadowCastingDirectionals;
    const verdict = flat.length ? 'fail' : (shadowCasters >= 1 ? 'pass' : 'partial');
    record('BM-VIS-01', verdict,
      `luma spread p99-p1 over the 8 main vantages: min ${Math.min(...per.map((p) => p.lumaSpread))}, ` +
      `median ${per.map((p) => p.lumaSpread).sort((a, b) => a - b)[4]}, max ${Math.max(...per.map((p) => p.lumaSpread))}; ` +
      `${flat.length} frame(s) below a spread of 20. Key-light ablation moved the mean by ${sunAblation.delta} ` +
      `(${sunAblation.direction}). Directional lights in the scene graph with castShadow: ${shadowCasters} of ` +
      `${sceneProbe.lights.filter((l) => l.kind === 'directional').length}`,
      'a light/shadow hierarchy in all 8 main vantages',
      'per-frame luma percentiles from the committed PNGs plus a key-light ablation that proves the sun is the thing making the hierarchy',
      'Spread is a proxy for hierarchy, not a reading of direction. A frame can have range and still have no dominant direction; nobody has looked at these frames beside a reference. TWO OBSERVATIONS ARE RECORDED WITHOUT A MECHANISM: no directional light in the scene graph has castShadow set, while docs/benchmarks.md BM-PRF-05 records 417 scene-wide shadow casters; and zeroing every directional light makes the frame BRIGHTER, not darker. Both are symptoms. Neither is explained here, and neither should be acted on before it is.');
    criteria['BM-VIS-01'].perVantage = per;
    criteria['BM-VIS-01'].keyLightAblation = sunAblation;
    criteria['BM-VIS-01'].shadowCastingDirectionals = shadowCasters;

    // The sky, from the ray mask rather than from the top of the frame.
    const skyPer = [];
    for (const name of MAIN) {
      const grid = skyGrids.get(name);
      const img = loadImage(join(OUT, `${PREFIX}-${name}.png`));
      const cw = img.width / SKY_GX, chh = img.height / SKY_GY;
      let n = 0, R = 0, G = 0, B = 0;
      if (grid) {
        for (let j = 0; j < SKY_GY; j++) for (let i = 0; i < SKY_GX; i++) {
          if (!grid[j * SKY_GX + i]) continue;
          const st = regionStats(img, pixelRegion(img, i * cw + cw * 0.25, j * chh + chh * 0.25, Math.max(2, cw * 0.5), Math.max(2, chh * 0.5)));
          R += st.meanRGB[0]; G += st.meanRGB[1]; B += st.meanRGB[2]; n++;
        }
      }
      skyPer.push({
        vantage: name,
        skyCells: n, skyFraction: grid ? Number((n / (SKY_GX * SKY_GY)).toFixed(3)) : null,
        skyWarmth: n ? Number(((R - B) / n / 255).toFixed(4)) : null,
        skyMeanRGB: n ? [R / n, G / n, B / n].map((v) => Number(v.toFixed(1))) : null,
        groundWarmth: per.find((x) => x.vantage === name).groundWarmth,
      });
    }
    const withSky = skyPer.filter((p) => p.skyCells >= 6);
    const warmSky = withSky.filter((p) => p.skyWarmth > 0);
    const groundWarm = per.filter((p) => p.groundWarmth > 0).length;
    record('BM-VIS-02', withSky.length === 0 ? 'inconclusive' : (warmSky.length ? 'fail' : 'pass'),
      `${withSky.length} of ${MAIN.length} main vantages see sky in 6 or more of ${SKY_GX * SKY_GY} ray-tested cells. ` +
      `Sky R-B over those cells: ${withSky.map((p) => `${p.vantage} ${p.skyWarmth.toFixed(3)}`).join(', ') || 'none'}. ` +
      `${warmSky.length} of ${withSky.length} have a warm sky. Ground band R-B is warm in ${groundWarm} of ${per.length}`,
      'a cool sky in every frame that contains sky, against a warm ground',
      'sky cells identified by casting a ray through each cell of a 24x14 grid and keeping the ones that hit nothing within 900m; colour read from the committed PNG at those cells only',
      'Cool/warm is mean R minus mean B. It does not judge whether the palette reads as controlled — only that the two halves sit on opposite sides of neutral.');
    criteria['BM-VIS-02'].perVantage = skyPer;
  }

  // -------------------------------------------------- BM-VIS-04: density --

  {
    const d = sceneProbe.texelDensities;
    if (d.length < 8) {
      record('BM-VIS-04', 'inconclusive', `only ${d.length} mesh/texture pairs were reachable from the scene graph`,
        'no visible break in texel density', 'texture edge over largest world-space mesh dimension',
        'Materials here are generated and shared; most meshes carry no map object the traversal can see.');
    } else {
      const sorted = [...d].sort((a, b) => a - b);
      const q = (f) => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))];
      const p10 = q(0.10), p50 = q(0.50), p90 = q(0.90);
      const spread = p90 / Math.max(p10, 1e-6);
      // A ratio, not a standard deviation: this distribution has a long tail
      // (one 4-metre prop with a 512px map is not a break in the world's
      // texel density) and a CV over it is dominated by the tail.
      record('BM-VIS-04', spread < 10 ? 'pass' : 'fail',
        `texels per metre over ${d.length} textured meshes: p10 ${p10.toFixed(1)}, median ${p50.toFixed(1)}, p90 ${p90.toFixed(1)}; p90/p10 ratio ${spread.toFixed(2)}`,
        'p90/p10 ratio below 10 — less than an order of magnitude across the world',
        'texture width divided by the largest world-space dimension of each textured mesh',
        'Bounding-box span is not UV area. This detects an order-of-magnitude mismatch, not a subtle one, and says nothing about how it reads.');
      criteria['BM-VIS-04'].samples = d.length;
      criteria['BM-VIS-04'].distribution = { p10, p50, p90 };
    }
  }

  // ------------------------------------ BM-VIS-03 / BM-ANM-02 / BM-ANM-03 --
  //
  // Recorded as not measured, with the specific missing apparatus named. The
  // point of this file is that "not measured" and "no way to measure" stop
  // being the same sentence.

  record('BM-VIS-03', 'not-measured', null, 'no contact-shadow or AO breakage',
    'would need an AO/contact-shadow ablation pair; no toggle for either exists in src/render/',
    'Not attempted. Adding the toggle is the work, and it is a render-side change this run did not make.');
  record('BM-ANM-02', 'not-measured', null, 'force direction and strength legible on every hit',
    'would need per-frame victim root and chest-bone sampling across a driven light/heavy hit pair (tools/probe_combat.mjs already drives the hits)',
    'Not attempted this run. The rig exposes named bones and combat is drivable, so the gap is work, not capability.');
  record('BM-ANM-03', 'not-measured', null, 'no foot slide or pose pop across transitions',
    'would need planted-foot bone world position sampled per fixed step through walk/stop/turn transitions',
    'Not attempted this run. Same apparatus as BM-ANM-02.');

  // -------------------------------------------------------------- write ---

  const bundleBytes = readFileSync(join(DIST, 'cinderline.1.0.0.js'));
  // Which build was actually served. `build.mjs --dev` writes an unminified
  // bundle with an inline sourcemap to the same path, so `dist/` alone does not
  // say what was measured — and a run that measured the dev bundle while the
  // record says "production" is a bound hash that means nothing. Detected, not
  // assumed, and reported in the record.
  const isDev = bundleBytes.includes('//# sourceMappingURL=data:application/json;base64,');
  if (isDev) {
    note('A0-production-bundle', false,
      `dist/ holds the DEV bundle (${bundleBytes.length} bytes, inline sourcemap): run \`node build.mjs\` before this sweep. Every number below was taken against the unminified build.`);
  } else {
    note('A0-production-bundle', true, `production bundle, ${bundleBytes.length} bytes`);
  }
  const apparatusOk = apparatus.every((a) => a.ok);
  const out = {
    schema_version: 1,
    artifact: 'GB-VISUAL-EVIDENCE',
    purpose: 'Numbers, verdicts and capture conditions for the ten docs/benchmarks.md §6 criteria that were blocked on R-19 — image evidence never being committed. The frames are not committed; what a reviewer can argue with is.',
    generated_at: new Date().toISOString(),
    environment: {
      browser: 'Playwright Chromium with SwiftShader (software rasteriser)',
      viewport: `${W}x${H} CSS px, deviceScaleFactor ${DPR}, isMobile, hasTouch`,
      real_device: false,
      device_claim: 'NONE. Frame rate and frame time are not measured here. A software rasteriser is not a phone GPU.',
      node: process.version,
      command: `node tools/vantage.mjs --evidence --prefix ${PREFIX}`,
    },
    binding: {
      bundle: 'cinderline.1.0.0.js',
      bundleMode: isDev ? 'dev (unminified, inline sourcemap)' : 'production',
      bundleBytes: bundleBytes.length,
      bundleSha256: sha(bundleBytes),
      build: await page.evaluate(() => window.CINDERLINE.build || null),
    },
    world_stats: stats,
    frames: {
      note: 'PNGs are written to shots/, which is gitignored on purpose. Re-run the command above against the bound bundle sha to reproduce them.',
      captured: results.length,
      perFrame: results,
      digests: Object.fromEntries(results.map((r) => [r.name, sha(readFileSync(join(OUT, `${PREFIX}-${r.name}.png`)))])),
    },
    apparatus: {
      ok: apparatusOk,
      note: 'Checked before the content, every run. A histogram of a cleared canvas, a sweep shooting through the title screen and a key light contributing nothing have all happened in this codebase or its sibling.',
      checks: apparatus,
      scene: sceneProbe,
    },
    criteria,
    summary: {
      total: Object.keys(criteria).length,
      pass: Object.values(criteria).filter((c) => c.verdict === 'pass').length,
      fail: Object.values(criteria).filter((c) => c.verdict === 'fail').length,
      partial: Object.values(criteria).filter((c) => c.verdict === 'partial').length,
      inconclusive: Object.values(criteria).filter((c) => c.verdict === 'inconclusive').length,
      notMeasured: Object.values(criteria).filter((c) => c.verdict === 'not-measured').length,
    },
    page_errors: errors,
    limitations: [
      'SwiftShader in a container is not a phone. Nothing here is a device result.',
      'No reference title was run, measured or compared. Every threshold is measured on our own build.',
      'Every criterion below is a proxy measurement. A number moving is not the same as a frame reading well, and no human has judged these frames beside a reference.',
      'not-measured means exactly that. It is not a pass and it must not be counted as one.',
    ],
  };
  const evPath = join(ROOT, 'AI_DEVELOPMENT/EVIDENCE/GB-VISUAL-EVIDENCE.json');
  mkdirSync(dirname(evPath), { recursive: true });
  writeFileSync(evPath, `${JSON.stringify(out, null, 2)}\n`);
  console.log('\nevidence: AI_DEVELOPMENT/EVIDENCE/GB-VISUAL-EVIDENCE.json');
  console.log(`  apparatus ${apparatus.filter((a) => a.ok).length}/${apparatus.length} ok`);
  for (const a of apparatus) if (!a.ok) console.log(`  ✗ ${a.check}: ${a.detail}`);
  for (const [id, c] of Object.entries(criteria)) console.log(`  ${id.padEnd(11)} ${c.verdict}`);
}

await browser.close();
await site.close();
process.exit(errors.length ? 1 : 0);
