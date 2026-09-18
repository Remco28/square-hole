/**
 * Watches the end-of-round show in the real page, sampling every frame.
 *
 *   agent-browser open http://127.0.0.1:5174/
 *   agent-browser eval "$(cat tests/show.mjs)"
 *
 * It seats all five pieces at rest inside the pail, which is the state the game
 * reads as "the round is over", and then records what the dump does about it. The
 * question it answers is the one that is easy to get wrong and easy to fake: do
 * the pieces actually leave the tub, or does the reset quietly tidy up something
 * the pour never managed? `emptiedBeforeReset` is that answer, and it is checked
 * only over the phases that run *before* the pieces are sent home.
 *
 * Sampling rides the animation frames rather than a timer, because the sim only
 * advances when the page paints — a timer would sample a still world.
 *
 * A whole expression, because `eval` does not wrap what it is given in a function.
 */
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const { sim, dump } = window.squareHole;
  // Toy millimetres to world metres: 77 mm of bore is 0.77 of a world unit.
  const BORE = 0.77;
  const DEPTH = 0.7;

  /** A world point in the pail's own frame, since the pail is what moves. */
  function inPailFrame(point) {
    const t = sim.pail.translation();
    const q = sim.pail.rotation();
    const d = { x: point.x - t.x, y: point.y - t.y, z: point.z - t.z };
    const w = q.w;
    const tx = 2 * (-q.y * d.z + q.z * d.y);
    const ty = 2 * (-q.z * d.x + q.x * d.z);
    const tz = 2 * (-q.x * d.y + q.y * d.x);
    return {
      x: d.x + w * tx + (-q.y * tz + q.z * ty),
      y: d.y + w * ty + (-q.z * tx + q.x * tz),
      z: d.z + w * tz + (-q.x * ty + q.y * tx),
    };
  }

  const frames = [];
  const sample = () => {
    const inTub = sim.pieces.filter((piece) => {
      const local = inPailFrame(piece.body.translation());
      return Math.hypot(local.x, local.z) < BORE && local.y > -0.18 && local.y < DEPTH;
    }).length;
    frames.push({ phase: dump.current, inTub });
  };

  let watching = true;
  const loop = () => {
    sample();
    if (watching) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // Seat everything at rest inside the pail, spread round so nothing overlaps.
  const angles = [0, 72, 144, 216, 288];
  sim.pieces.forEach((piece, index) => {
    const a = (angles[index] * Math.PI) / 180;
    piece.body.setTranslation({ x: Math.cos(a) * 0.45, y: 0.09, z: Math.sin(a) * 0.45 }, true);
    piece.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    piece.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    piece.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    piece.body.setGravityScale(1, true);
  });

  // Wait for the game to notice the round is over — the trigger is checked in the
  // frame loop, so it has not fired the instant the pieces are placed — and then
  // for the show to run itself out.
  const startedAt = performance.now();
  while (!dump.active && performance.now() - startedAt < 5000) await wait(50);
  while (dump.active && performance.now() - startedAt < 25000) await wait(50);
  await wait(400);
  watching = false;

  const byPhase = {};
  for (const frame of frames) {
    const seen = (byPhase[frame.phase] ??= { frames: 0, minInTub: 5, maxInTub: 0 });
    seen.frames++;
    seen.minInTub = Math.min(seen.minInTub, frame.inTub);
    seen.maxInTub = Math.max(seen.maxInTub, frame.inTub);
  }

  // Everything except the beats that run before the tip and after the reset.
  const whileTipped = frames.filter(
    (f) => f.phase !== 'idle' && f.phase !== 'lidAside' && f.phase !== 'lidBack',
  );

  return {
    showSeconds: +((performance.now() - startedAt) / 1000).toFixed(2),
    frames: frames.length,
    phases: byPhase,
    emptiedBeforeReset: whileTipped.some((f) => f.inTub === 0),
    finished: !dump.active,
  };
})();
