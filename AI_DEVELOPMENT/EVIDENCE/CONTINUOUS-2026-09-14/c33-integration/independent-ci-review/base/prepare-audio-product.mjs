/** Prepare exact audio source/root bytes in the existing read-only CI checkout.
 * Preparation is not adoption, publication, a browser measurement or a verdict. */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

export const INPUTS = Object.freeze({
  "build.mjs": "fd074f34f779d812bc23ff1fc30a6f2ea262b0c7c4e97cb95da3ec754fb8e051",
  "package-lock.json": "36873e3c91cddeab1cae6ae512ae0d5cf332756bd81a0b235af3360aea30c167",
  "package.json": "97d6729a6eeb9ec7b343e6fc34e8bc8ea0a5e983c385bd9264dbd90a0881c3e1",
  "public/.nojekyll": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "public/icon.svg": "40168ac465534358bdd17c222e221a6d504805e40f1cb224ec4bdd279fa93132",
  "public/index.html": "bc7d9072b9cd766f16a6847cc8698ac9a3d61d837615edb099c0712084a089f3",
  "public/manifest.webmanifest": "04581fc9c19cf89456169c3f850c4421c72acafd4409d3f2a78292d17e971049",
  "public/styles.css": "1b9fa9dd76fd937facbcf43dda68f6ac62dd64b02315a7a8de25121c4d33f4b3",
  "src/actors/actor.js": "b1323ed75ab305544abd255c5df37fc9e7c2e12fc0b8f4be6357c7b5e18c6c4f",
  "src/actors/anim.js": "2a96a4f4688c90c6467f8d2746ef38fe1e3dbe629cec0f60a6b9df0632022002",
  "src/actors/player.js": "c3dd1b7e33bf6e30e6ca0363e3cc18bd5c7080b8f21060b0e66130cefb80cd66",
  "src/actors/rig.js": "e0b314c0de8c833f8588dfe13a2f68565829c702415b75c4844cb55be15c90f3",
  "src/audio/audio.js": "b54ff04c92c5b533fb99ab063498424a4a9fbfaf1951b4529e34bef72ccd6b49",
  "src/content/i18n.js": "a07adc4113a9f561cbc40c4559082b89632aec1a5635dfbd53f6e64fd8e2b116",
  "src/content/locale/ja.js": "4ee6c1fbc8caf898ea5dd117d30105dd8c04ad1bd6f4eb0f36d47dc8c59bf9b8",
  "src/content/locale/ja/content.js": "66d08acf58e0dd470de3f18834a8c65622fb7c544f59c0fa3bdb4d1069beba70",
  "src/content/locale/ja/engine.js": "2a03e38469cc74671aa5a35977d6c6deaae7bcbcd25d95621084c4ae2762f226",
  "src/content/locale/ja/story.js": "0ff6f35c2d2cb003ade5d900859ded890213e5757ec1e1cccff612e3ca53969f",
  "src/content/locale/ja/story2.js": "360d015b27089e2c0cd61dfc8e4f9302ecc39714ded4d24ac113d870376fce3e",
  "src/content/locale/ja/ui.js": "b71791bf626a9584d5aad4416237da5826e955f86bd70f2aa584efcad5404674",
  "src/content/story.js": "76023ad5a9fba4716393b555f3562573fd179c3fb3c4c9d560fda8522a22e07c",
  "src/content/world_data.js": "b4610034e662b1275ba507c33bbca3c29e069e84fb10070c233386ea4f3f8fa8",
  "src/core/engine.js": "c7a0cb1cbe9f8b6e9ea1a8fc4bf8a95146f8344bf568d28ea8455dc8cf214592",
  "src/core/input.js": "0523ad08c18d1f752cdddc413455079c9a7d553e367679970bc16b8c648c910e",
  "src/core/rng.js": "a2bbed63e0d436ce742a595b87ad7b24ab1966b132c13ee6a1e11c0d967d0ea0",
  "src/core/util.js": "63562699248b3bb7d2c3be2b11d0cd5adfe897ee7fb928215ec92f980a908399",
  "src/game/ai.js": "dd3a37e8681a1d728c574db86e875be91807f7c75589494162e1f63cbe056597",
  "src/game/combat.js": "e89435b72e37b5a4a78c6a021360d7fb5f974e8bea1b27f8455867704e8e6a29",
  "src/game/director.js": "884e3773f41a2d9b4d98c8d165c7f3cc3a33b81db0bb912ea450da8836ce806b",
  "src/game/game.js": "c2d744ad715ffbbaefd8baf19d23f29c341db039342db5e578534278ae0e5015",
  "src/game/narrative.js": "2535df961c19396606423dc8b98c2a3a1552cd2071080ac2be98b5860d6956b0",
  "src/game/state.js": "ad1cd826a7d55a329e74e6a988c1441d4852675b2abc8e0e07df672af42dd7cc",
  "src/main.js": "7efcb13857a13106c6ac956626d8f7d3b5a188e2ca75247b06ff179ce1900760",
  "src/render/atmosphere.js": "4bc604f65d390b7cdcf34c7c8c9939d26f0810202ea2d651895cf989a3ab51b5",
  "src/render/materials.js": "c9781f0254e6c8477923d54cc6bbfc733fb84ccf0496022d66e8c15769422f2b",
  "src/render/postfx.js": "b9a4f9422242d27c329b77e6502f251281fddf80a6a62880202adc2040ce1a5a",
  "src/render/shadow_batches.js": "c0592c17fe797f0871cc37af2ec58d84b2f993abb58be58114e48d4fe4ba643a",
  "src/render/textures.js": "254bc95201bf6f080a0ce219d3b111e57deca5eaca474ca67c951af817dbbb9b",
  "src/ui/hud.js": "87e960d131b4c04d60e75080fc629d433db1505faccf967c71893d99b6f0ab8b",
  "src/ui/screens.js": "558d65579cbf782788119da354f99da73ce4c0e55e630ec3a4758f4c3c714afd",
  "src/world/buildings.js": "82ac359fa1fdd5a367e707a33521513fe16ff29e57299219cf2c242fa1a031c7",
  "src/world/city.js": "81acdf64d65c087b9db556091896e4de0fb0fa4d60ed1d2d20e47d491c7efa4b",
  "src/world/collision.js": "72c0378ef6bf5bdb0cb164e920bd05f449eefffa3d176b47ca389abc52637a04",
  "src/world/gas.js": "046c632efc6ccd632dd5741089642e6c70cf4016b238b3fe007e6cf6172c055d",
  "src/world/geom.js": "76d1afe270f2ee600857f71161353c67de9de5f4e54cec5d3b9609fb5f5ee1e1",
  "src/world/nav.js": "0331e0fd05d503ee1f7d83c5c78d575b44b077c480a9817327aab74c76836234",
  "src/world/props.js": "6044093c5bf49b66b6e8f90f012ad2bee0746bdb79bbddb7b338d6c98b8c5f38"
});
export const SOURCE = 'src/audio/audio.js';
export const CANDIDATE_FILE = 'tools/candidates/audio-interior-r1.js';
export const CANDIDATE_SOURCE = '22add12afa50de4632d43afb00d52789c7f473a0657affd70f3a855a5951d2b7';
export const ORIGINAL_BUNDLE = '81c93f3bf6c45b14c25f0e742a78d19b8dc70dca665ebba897bb6e39bbc937b3';
export const FILES = [SOURCE, 'cinderline.1.0.0.js', 'index.html', 'styles.css', 'manifest.webmanifest', 'icon.svg', '.nojekyll'];
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const gitBlob = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const MAX_BYTES = 4 * 1024 * 1024;
const OUTPUT = 'test-results/audio-product-build-r1';
export function changedSource(original, candidate) {
  if (hash(original) !== INPUTS[SOURCE]) throw Error('Unreviewed source baseline');
  if (hash(candidate) !== CANDIDATE_SOURCE) throw Error('Unreviewed candidate source');
  return candidate;
}
export function verifyInputs(root) {
  const actual = {};
  for (const [path, expected] of Object.entries(INPUTS)) {
    const bytes = readFileSync(join(root, path));
    if (hash(bytes) !== expected) throw Error('Build input mismatch: ' + path);
    actual[path] = { bytes: bytes.length, sha256: expected, gitBlob: gitBlob(bytes) };
  }
  return actual;
}
export function exportPrepared(root, emit = line => console.log(line)) {
  const output = join(root, OUTPUT), reportBytes = readFileSync(join(output, 'report.json'));
  const report = JSON.parse(reportBytes);
  if (report.status !== 'prepared and content/root verified') throw Error('No completed build to export');
  if (JSON.stringify(report.files.map(f => f.path)) !== JSON.stringify(FILES)) throw Error('Unexpected prepared file set');
  const all = report.files.map(file => {
    if (file.output !== file.path.replaceAll('/', '__')) throw Error('Unexpected prepared output path');
    const bytes = readFileSync(join(output, file.output));
    if (file.sha256 !== hash(bytes) || file.bytes !== bytes.length || file.gitBlob !== gitBlob(bytes)) throw Error('Prepared file changed: ' + file.path);
    return { path: file.path, bytes };
  });
  all.push({ path: 'report.json', bytes: reportBytes });
  for (const { path, bytes } of all) if (bytes.length > MAX_BYTES) throw Error('Bounded export size exceeded: ' + path);
  // Validate the complete set before emitting the first byte. The receiver must
  // also require every contiguous chunk and matching metadata/end records.
  for (const { path, bytes } of all) {
    const meta = { file: path, bytes: bytes.length, sha256: hash(bytes), gitBlob: gitBlob(bytes), commit: report.sourceCommit, complete: true };
    emit('[prepared-audio-meta] ' + JSON.stringify(meta));
    for (let offset = 0; offset < bytes.length; offset += 3000) emit('[prepared-audio-chunk] ' + JSON.stringify({ file: path, offset, base64: bytes.subarray(offset, offset + 3000).toString('base64') }));
    emit('[prepared-audio-end] ' + JSON.stringify(meta));
  }
}
export function prepare(root) {
  const output = join(root, OUTPUT); mkdirSync(output, { recursive: true });
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const report = { schema_version: 1, sourceCommit: git(['rev-parse','HEAD']), sourceBaseline: '0abe4628947064fe811ed842face2018b87d5bf5',
    runId: process.env.GITHUB_RUN_ID || null, runAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
    node: process.version, platform: process.platform, arch: process.arch, status: 'started', files: [], commands: [],
    change: 'Only reviewed audio.js: interior ambience selection and retention of authored layer targets during modulation.',
    originalBundleSha256: ORIGINAL_BUNDLE, expectedSourceSha256: CANDIDATE_SOURCE,
    limits: 'Preparation only. No browser, adoption, publication, external evaluator, listening or element verdict. Original recording and quality limitations remain. Product source and root are unchanged outside this disposable CI checkout.' };
  const run = args => {
    const item = { args, exit: null }; report.commands.push(item);
    try { execFileSync(process.execPath, args, { cwd: root, stdio: 'inherit', timeout: 180000, env: { ...process.env, CINDERLINE_BUILD_ID: '1.0.0' } }); item.exit = 0; }
    catch (error) { item.exit = error.status ?? null; item.signal = error.signal ?? null; throw error; }
  };
  try {
    if (git(['diff','--name-only']) || git(['diff','--cached','--name-only'])) throw Error('Tracked checkout is not clean');
    const tracked = git(['ls-files','src','public','build.mjs','package.json','package-lock.json']).split('\n').filter(Boolean).sort();
    if (JSON.stringify(tracked) !== JSON.stringify(Object.keys(INPUTS).sort())) throw Error('Unexpected build-input file set');
    report.inputs = verifyInputs(root);
    const originals = new Map(FILES.map(path => [path, readFileSync(join(root, path))]));
    if (hash(originals.get('cinderline.1.0.0.js')) !== ORIGINAL_BUNDLE) throw Error('Unexpected production root bundle');
    report.dependencies = Object.fromEntries(['esbuild','three'].map(name => [name, JSON.parse(readFileSync(join(root,'node_modules',name,'package.json'))).version]));
    if (report.dependencies.esbuild !== '0.25.0' || report.dependencies.three !== '0.180.0') throw Error('Unexpected locked build dependencies');
    run(['build.mjs']);
    report.baselineDistSha256 = hash(readFileSync(join(root,'dist/cinderline.1.0.0.js')));
    if (report.baselineDistSha256 !== ORIGINAL_BUNDLE) throw Error('Baseline production reproduction failed');
    run(['tools/export_pages_root.mjs','--check']);
    report.baselineReproduced = true;
    writeFileSync(join(root,SOURCE), changedSource(originals.get(SOURCE), readFileSync(join(root,CANDIDATE_FILE))));
    run(['--check',SOURCE]); run(['build.mjs']); run(['tools/export_pages_root.mjs']);
    run(['tools/export_pages_root.mjs','--check']); run(['tools/validate.mjs']);
    for (const [path, pin] of Object.entries(INPUTS)) if (hash(readFileSync(join(root,path))) !== (path===SOURCE ? CANDIDATE_SOURCE : pin)) throw Error('Unintended build input changed: '+path);
    for (const path of FILES) {
      const bytes = readFileSync(join(root,path)); const destination=path.replaceAll('/','__');
      if (bytes.length > MAX_BYTES) throw Error('Prepared output exceeds complete export cap');
      copyFileSync(join(root,path),join(output,destination));
      report.files.push({ path, output: destination, bytes: bytes.length, sha256: hash(bytes), gitBlob: gitBlob(bytes), changed: !originals.get(path).equals(bytes) });
    }
    const expected=[SOURCE,'cinderline.1.0.0.js'].sort();
    if (JSON.stringify(report.files.filter(f=>f.changed).map(f=>f.path).sort()) !== JSON.stringify(expected)) throw Error('Unintended static output change');
    if (JSON.stringify(git(['diff','--name-only']).split('\n').filter(Boolean).sort()) !== JSON.stringify(expected)) throw Error('Unintended tracked source change');
    report.candidateBundleSha256=hash(readFileSync(join(root,'dist/cinderline.1.0.0.js')));
    if (report.candidateBundleSha256!==report.files.find(f=>f.path==='cinderline.1.0.0.js').sha256) throw Error('Candidate dist/root mismatch');
    report.status='prepared and content/root verified';
  } catch (error) { report.status='preparation failed; no product commit'; report.error=String(error); throw error; }
  finally { writeFileSync(join(output,'report.json'),JSON.stringify(report,null,2)+'\n'); }
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  if (process.argv.includes('--export')) exportPrepared(root); else prepare(root);
}
