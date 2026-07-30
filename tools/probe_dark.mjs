/** What is the dark mass in the rooftop vantage? Ray-pick and report. */
(async () => {
  const C = window.CINDERLINE, G = C.game, THREE = C.THREE;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  C.setCamera(-70, 11.3, -22, 180, -20);
  for (let i = 0; i < 120; i++) { G.fixedUpdate(1 / 60); if (i % 30 === 0) await sleep(0); }
  await sleep(500);
  const cam = G.engine.camera;
  const rc = new THREE.Raycaster();
  const out = [];
  for (const [nx, ny] of [[0, 0.1], [-0.4, 0.0], [0.4, 0.1], [0, -0.1]]) {
    rc.setFromCamera(new THREE.Vector2(nx, ny), cam);
    const hits = rc.intersectObject(G.scene, true).filter((h) => h.object.isMesh);
    const h = hits[0];
    if (!h) { out.push({ nx, ny, hit: null }); continue; }
    const m = h.object.material;
    out.push({
      nx, ny,
      mesh: h.object.name,
      dist: +h.distance.toFixed(1),
      matType: m.type,
      side: m.side,
      color: m.color ? '#' + m.color.getHexString() : null,
      vertexColors: !!m.vertexColors,
      patched: !!(m.userData && m.userData.__patched),
      hasMap: !!m.map,
      normalDotView: +h.face.normal.dot(cam.getWorldDirection(new THREE.Vector3())).toFixed(2),
    });
  }
  return { lights: G.scene.children.filter((o) => o.isLight).map((l) => `${l.type}@${l.intensity.toFixed(2)}`), out };
})()
