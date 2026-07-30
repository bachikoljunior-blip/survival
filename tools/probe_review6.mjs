import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, 'dist'); const OUT = join(ROOT, 'shots');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const BASE = '/cinderline-test';
const server = createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (!p.startsWith(BASE)) { res.writeHead(404); res.end(); return; }
  p = p.slice(BASE.length) || '/'; if (p.endsWith('/')) p += 'index.html';
  try { const b = readFileSync(join(DIST, normalize(p).replace(/^(\.\.[/\\])+/, '')));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(b);
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader',
  '--use-angle=swiftshader', '--disable-gpu-sandbox', '--no-sandbox', '--ignore-gpu-blocklist'] });
const c = await browser.newContext({ viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await c.newPage();
const logs = [], errors = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text().slice(0,180)}`));
page.on('pageerror', (e) => errors.push(String(e && e.stack || e)));
await page.goto(`http://127.0.0.1:${port}${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.CINDERLINE && window.CINDERLINE.ready === true', null, { timeout: 90000 });
await page.waitForTimeout(2500);
await page.evaluate(() => window.CINDERLINE.startNewGame());
await page.waitForTimeout(4000);
// dog, side on
await page.evaluate(() => { document.getElementById('ui').style.display='none';
  const C=window.CINDERLINE, p=C.game.player;
  C.game.spawnEnemy('dog', p.pos.x+3, p.pos.z); });
await page.waitForTimeout(2500);
await page.evaluate(() => {
  const C=window.CINDERLINE, T=C.THREE;
  const d = C.game.actors.find(a=>a.kind==='dog'); if(!d) return;
  C.game.camera.enabled=false;
  const cam=C.engine.camera;
  cam.position.set(d.pos.x, d.pos.y+0.55, d.pos.z-2.0);
  cam.lookAt(new T.Vector3(d.pos.x, d.pos.y+0.4, d.pos.z));
  cam.updateMatrixWorld(true);
});
await page.waitForTimeout(1400);
await page.screenshot({ path: join(OUT,'rv6-dog-side.png'), timeout:120000 });
// long real run: drive the player around and let systems tick
await page.evaluate(() => { const C=window.CINDERLINE; C.game.camera.enabled=true; document.getElementById('ui').style.display=''; });
for (let i=0;i<8;i++){
  await page.evaluate(() => { const C=window.CINDERLINE, g=C.game;
    for(let k=0;k<180;k++){ g.fixedUpdate(1/60);} });
  await page.waitForTimeout(400);
}
writeFileSync(join(OUT,'rv6-report.json'), JSON.stringify({logs,errors},null,2));
console.log('LOGS', logs.length); console.log(logs.slice(0,40).join('\n'));
console.log('ERRORS', errors.length); console.log(errors.slice(0,10).join('\n'));
await browser.close(); server.close();
