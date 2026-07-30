/** Fraction of the frame at or near pure black, per vantage. */
(async () => {
  const G = window.CINDERLINE.game, C = window.CINDERLINE;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const V = [
    ['marrow_roof', -70, 12.2, -12, 96, -8],
    ['marrow_mid', -70, 1.7, -12, 96, -3],
    ['stacks_yard', -108, 1.7, -84, 40, -4],
    ['slip_edge', -46, 8.0, -14, 120, -10],
  ];
  const out = [];
  const cv = document.createElement('canvas');
  for (const [name, x, y, z, yaw, pitch] of V) {
    C.setCamera(x, y, z, yaw, pitch);
    for (let i = 0; i < 150; i++) { G.fixedUpdate(1 / 60); if (i % 30 === 0) await sleep(0); }
    await sleep(700);
    const gl = G.engine.renderer.domElement;
    cv.width = gl.width; cv.height = gl.height;
    cv.getContext('2d').drawImage(gl, 0, 0);
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let black = 0, near = 0, n = 0;
    const lum = [];
    for (let i = 0; i < d.length; i += 4 * 7) {
      const L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      lum.push(L); n++;
      if (L < 1) black++;
      if (L < 6) near++;
    }
    lum.sort((a, b) => a - b);
    const q = (p) => Math.round(lum[Math.floor(lum.length * p)]);
    out.push({ name, pctBlack: +(black / n * 100).toFixed(1), pctNear: +(near / n * 100).toFixed(1),
               p05: q(0.05), p25: q(0.25), p50: q(0.5), p75: q(0.75), iqr: q(0.75) - q(0.25) });
  }
  return out;
})()
