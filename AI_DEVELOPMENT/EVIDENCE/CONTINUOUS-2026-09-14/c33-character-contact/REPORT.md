# Character contact diagnosis — ready

No product correction is proposed. The current arcade image does **not** show a fixed upward rig offset: reconstruction from its actual recorded bone transforms puts the lowest left/right sole vertices **24.84 / 20.96 mm below** the rendered pavement. Some tilted sole corners rise **11.10 / 21.00 mm above** it. Lowering the actor would deepen penetration. Shadow bias remains a plausible explanation for weak contact, but its responsibility for the visible gap has not been isolated on the GPU.

This is source-known production diagnosis. All original judgments/references/criteria remain unchanged; comparisons **0**, new browser/CI runs **0**, remote/automation/new agents **0**. Existing accepted Ultra/v3 role continued; private effective backend strength is not independently asserted.

## Original evidence

Base `b0f1dfb9860dbc00018c0c587d8f0934fadb6604`; canonical AGENTS → CLAUDE v3 → SESSION accepted. Source/root runtime remains `81c93f3bf6c45b14c25f0e742a78d19b8dc70dca665ebba897bb6e39bbc937b3`. The nine relevant actor/world/atmosphere source files fetched at b0 exactly match the inputs of the actual CI preparation that produced 81c (`evidence/source-build-agreement.json`).

All eight supplied native 1147 × 645 PNGs were viewed in full, without editing. Original report SHA256 `c05495376603482ec67bd0fe3b6051288018abbd0f2529aabbad194c6fb8ac6e`; every image matches its report PNG hash, and report/image ending hashes match starting hashes.

| View | Visible foot/contact observation | Exact original bone record |
|---|---|---|
| south | Dark legs and deep shade; lower frame limits foot inspection | Missing |
| cinder | Both boots meet the painted/road foreground; shadow is offset to the right | Present |
| arcade | Boots over pavement; darkest diffuse patch lies lower-left with weak attached contact | Present |
| marrow | Side-on boots near the painted line; nearby dark shadow | Missing |
| stacks | Boots visible, with foreground rubble partly obscuring their edge | Present |
| plant | Both boots visible against road; dark shadow behind/right | Missing |
| survey | Foreground barrier obscures the actual feet | Missing |
| ventfield | Side-on boots over ash; broad offset soft shadow | Present |

These observations do not establish floating height or a quality verdict.

## Reconstructed findings

`verification/replay-contact.mjs` uses the actual Ren detail-2 builder, actual r180 `SkinnedMesh.getVertexPosition`, and the original group/mesh/bone transforms. It reconstructs actual current City ground/street mesh generation and collision queries, with material/gas effects substituted only for CPU support analysis. Props/buildings/stairs are excluded; it is not a whole-city replay.

- Arcade actual player Y is 0.14, grounded/idle. Render pavement is 0.1400000006 and collision pavement is 0.14 at the sole footprints. No pavement-height mismatch explains floating.
- Four exterior views have complete original transforms. Their lowest sole corners penetrate their reconstructed support: arcade about 21–25 mm; stacks 22–26 mm; ventfield 22–25 mm; cinder 44–52 mm below paint/road. South/marrow/survey/plant exact feet remain unmeasured.
- Roads render 25 mm above the ground collider; paint is 30 mm above it. This places the rig farther into the road, not above it. It is an existing offset, not a proposed correction.
- Original cached/refreshed/repeat image RGBA hashes agree for all four recorded exterior views. **Arcade also exactly matches the original unbatched caster image.** Stale shadow caching and batching cannot explain a difference in that exact arcade frame. Other views' unbatched images differ, so this is not generalized to them.
- There is no separate actor blob-shadow plane in the inspected path. Actor geometry feeds the directional shadow map.
- Actual shader source adds shadow bias to receiver depth after normal displacement. Current `bias=-0.0009`, `normalBias=0.028`, near/far 1/150 and actual light direction imply **0.1341 m along-light depth exemption**, or approximately **0.13914 m ideal horizontal caster-height threshold**. This is an unfiltered same-UV analytic model; it does not simulate PCF, surface normals, rasterization or actual shadow texels.

CPU replay completed in **145.727189 ms**. Full per-vertex world/projected coordinates, support queries and original hash links are in `evidence/current-pose-replay.json`. Sole geometry agrees across the two checked seeds; original seed is absent. Exact animation histories for the four missing views are not invented.

## Diagnostic candidate, not a production patch

Two tooling files only:

- New `tools/mobile_character_ground_contact.mjs`: reads exact sole vertices, projected pixels, point/body-radius support, player/pose/camera/light and shadow matrix at the existing frozen capture. All eight exterior views receive measurements. Only arcade/south receive five complete native PNGs: original, depth-bias zero only, normal-bias zero only, both zero, original repeat. Zero controls are **not** proposed product settings.
- `tools/mobile_visual_capture.mjs`: one import and an opt-in call guarded by `CINDERLINE_CHARACTER_CONTACT=1`. Default route, original views, camera, existing shadow checks and all other checks remain intact. Roof is not added to this finite diagnostic.

Every control must preserve exact pose/feet/camera/time, restore the original bias settings, and reproduce both cached original and repeat PNG bytes. A render/cleanup error or changed state invalidates the diagnostic. PNGs are decoded from their original data URL bytes and saved without image transformations. The helper reports collision support; actual rendered surface heights and shadow texels are not directly measured by it.

CPU controls **11/11**, **46.621432 ms**: exact original arcade replay agreement; isolated control values/restoration; render and cleanup failures; camera/bone drift rejection; live-engine/topology rejection; true point versus body-radius support at an edge; unsupported feet; unchanged default capture route. CPU render calls use explicit non-image tokens and produce no diagnostic PNGs. Syntax and patch-application checks passed. Browser behavior is pending.

Next operation: after independent review, the sole integration owner can apply the diagnostic tools to a source head with a recorded build identity and add `CINDERLINE_CHARACTER_CONTACT=1` to the existing permitted CI invocation of `node tools/test-iphone-webkit.mjs` (canonical call site at line 622). No local server/browser is started here. Preserve all eight original frames, all ten control PNGs and complete report. Inspect whether only bias changes recover contact and whether they create acne elsewhere before proposing any product setting. Any later product correction must also be checked during walking, edge/step and stair poses; the current frozen idle diagnosis does not establish those regressions.

`candidate.patch`, `MANIFEST.json`, canonical receipts and all CPU outputs are frozen beside this report. Re-run tests only after copying this directory to a separate workspace sibling; both scripts write their own evidence outputs. No build pin or product source was changed.
