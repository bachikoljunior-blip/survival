/** Hold the title screen so it can be photographed. */
(async () => {
  const G = window.CINDERLINE.game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  G.setTitleCamera();
  for (let i = 0; i < 90; i++) { G.fixedUpdate(1 / 60); if (i % 20 === 0) await sleep(0); }
  await sleep(400);
  return { mode: G.mode, yaw: +G.camera.yaw.toFixed(3), pitch: +G.camera.pitch.toFixed(3),
           playerVisible: G.player.group.visible };
})()
