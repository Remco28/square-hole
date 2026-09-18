/**
 * Drives the real page in a real browser: find a piece, grab it, carry it over
 * the square hole, drop it, and see where it ends up. Needs the dev server up:
 *
 *   agent-browser open http://127.0.0.1:5174/
 *   agent-browser eval "$(cat tests/probe.mjs)"
 *
 * It is a whole expression rather than a module because `eval` does not wrap
 * what it is given in a function.
 */
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const app = window.squareHole;
  if (!app) return { error: 'no dev handle' };

  const { sim, viewer, grabber, holeCentres } = app;
  const { LID_BOTTOM_Y, PAIL_OUTER_R, PAIL_WALL, U } = await import('/src/config.ts');
  const canvas = viewer.gl;
  const at = (x, y, z) => viewer.project({ x, y, z });

  function pointer(type, clientX, clientY) {
    canvas.dispatchEvent(
      new PointerEvent(type, {
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        buttons: type === 'pointerup' ? 0 : 1,
        button: 0,
        clientX,
        clientY,
        bubbles: true,
        cancelable: true,
      }),
    );
  }

  const report = {};

  // --- 1. is every piece reachable on screen? -----------------------------------
  const onScreen = sim.pieces.filter((piece) => {
    const t = piece.body.translation();
    const s = at(t.x, t.y, t.z);
    return s.x >= 0 && s.y >= 0 && s.x <= innerWidth && s.y <= innerHeight;
  });
  report.piecesOnScreen = `${onScreen.length}/${sim.pieces.length}`;

  // --- 2. grab the circle: it fits the square hole at any rotation ---------------
  const circle = sim.pieces.find((p) => p.spec.kind === 'circle');
  const start = circle.body.translation();
  const startScreen = at(start.x, start.y, start.z);
  pointer('pointerdown', startScreen.x, startScreen.y);
  report.grabbed = canvas.dataset.holding === 'true';
  report.grabbedKind = grabber.holding?.spec.kind ?? null;

  // --- 3. carry it over the square hole -----------------------------------------
  // A held piece keeps the offset it was grabbed at, so aiming the pointer at the
  // hole would park the piece beside it. Aim at the hole minus that offset, then
  // feed back the residual so the piece lands on the hole rather than near it.
  const square = holeCentres.find((h) => h.kind === 'square');
  const want = { x: square.x - grabber.offset.x, z: square.z - grabber.offset.z };
  const overHole = { x: startScreen.x, y: startScreen.y };
  for (let i = 0; i < 8; i++) {
    const now = circle.body.translation();
    want.x += square.x - now.x;
    want.z += square.z - now.z;
    const aim = viewer.project({ x: want.x, y: now.y, z: want.z });
    overHole.x = aim.x;
    overHole.y = aim.y;
    pointer('pointermove', aim.x, aim.y);
    await wait(260);
    const at = circle.body.translation();
    if (Math.hypot(square.x - at.x, square.z - at.z) < 0.004) break;
  }
  const carried = circle.body.translation();
  report.carriedMm = {
    x: +(carried.x * 100).toFixed(1),
    z: +(carried.z * 100).toFixed(1),
  };
  report.squareHoleMm = { x: +(square.x * 100).toFixed(1), z: +(square.z * 100).toFixed(1) };
  report.carriedOffHoleMm = +(
    Math.hypot(carried.x - square.x, carried.z - square.z) * 100
  ).toFixed(1);

  // --- 4. rotate while held -----------------------------------------------------
  const before = circle.body.rotation();
  grabber.rotateSteps(1);
  await wait(150);
  const after = circle.body.rotation();
  report.rotates = Math.abs(before.y - after.y) > 1e-4 || Math.abs(before.w - after.w) > 1e-4;
  grabber.rotateSteps(-1);
  await wait(150);

  // --- 5. drop ------------------------------------------------------------------
  pointer('pointerup', overHole.x, overHole.y);
  report.released = canvas.dataset.holding === 'false';
  await wait(3500);

  const landed = circle.body.translation();
  report.landedMm = { x: +(landed.x * 100).toFixed(1), z: +(landed.z * 100).toFixed(1) };
  report.landedYmm = +(landed.y * 100).toFixed(1);
  // Through the hole means it is now below the lid plate and inside the pail's
  // wall, not sitting on the counter somewhere beside the pail.
  // Toy millimetres to world metres, so 77 mm of pail bore is 0.77 of a world unit.
  const insideWall = Math.hypot(landed.x, landed.z) < U(PAIL_OUTER_R - PAIL_WALL);
  report.insidePailWall = insideWall;
  report.belowLid = landed.y < LID_BOTTOM_Y;
  report.fellIntoPail = insideWall && landed.y < LID_BOTTOM_Y;

  return report;
})();
