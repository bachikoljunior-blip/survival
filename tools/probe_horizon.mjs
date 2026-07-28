/** Is there ground under the backdrop skyline? */
(() => {
  const G = window.CINDERLINE.game, THREE = window.CINDERLINE.THREE;
  const rc = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const out = [];
  for (const [x, z] of [[0, -180], [0, -260], [0, -400], [300, 0], [-330, 120], [0, 300], [240, -190]]) {
    rc.set(new THREE.Vector3(x, 400, z), down);
    const hits = rc.intersectObject(G.scene, true)
      .filter((h) => h.object.isMesh && h.object.name && !/sky/i.test(h.object.name));
    out.push({
      at: [x, z],
      hits: hits.slice(0, 3).map((h) => `${h.object.name}@${(400 - h.distance).toFixed(1)}`),
      groundBelowZero: hits.some((h) => (400 - h.distance) < 0.5),
    });
  }
  return out;
})()
