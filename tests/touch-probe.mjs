// Run in the dev page with agent-browser eval.
(async () => {
  const { sim, viewer, grabber, holeCentres } = window.squareHole;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const assert = (value, message) => { if (!value) throw new Error(message); };
  grabber.drop();
  sim.reset();
  const piece = sim.pieces.find(p => p.spec.kind === 'rectangle');
  const hole = holeCentres.find(h => h.kind === 'circle');
  const { CARRY_Y, LID_BOTTOM_Y } = await import('/src/config.ts');
  piece.body.setTranslation({ x: hole.x, y: CARRY_Y, z: hole.z }, true);
  await wait(1800);
  const pos = piece.body.translation();
  assert(pos.y > LID_BOTTOM_Y, 'Rectangle must be rejected');
  const point = viewer.project(pos);
  assert(viewer.pick(sim.pieces, point.x, point.y) === piece, 'Wedged piece must be selectable');
  // Synthetic events have no browser-owned pointer to capture.
  const canvas = viewer.gl;
  const capture = canvas.setPointerCapture;
  canvas.setPointerCapture = () => {};
  try {
    const send = (type, id = 1, x = point.x, y = point.y) => canvas.dispatchEvent(new PointerEvent(type,
      { pointerId: id, pointerType: 'touch', button: 0, clientX: x, clientY: y, bubbles: true }));
    send('pointerdown'); send('pointerup');
    await wait(500);
    assert(grabber.holding === piece && piece.body.translation().y > CARRY_Y - 0.02, 'Tap must lift and hold');
    send('pointerdown'); send('pointerdown', 2, point.x + 50, point.y);
    send('pointermove', 2, point.x, point.y + 50);
    await wait(200);
    assert(Math.abs(piece.body.rotation().y) > 0.4, 'Twist must rotate');
    send('pointerup');
    assert(grabber.holding === piece, 'First finger release must keep holding');
    send('pointerup', 2);
    assert(!grabber.holding && piece.body.isDynamic(), 'Last finger release must drop');
    const before = viewer.project({ x: 0.5, y: 0.86, z: 0 });
    document.getElementById('rotate-right').click();
    const after = viewer.project({ x: 0.5, y: 0.86, z: 0 });
    assert(Math.hypot(before.x - after.x, before.y - after.y) > 5, 'View button must turn scene');
    document.getElementById('rotate-left').click();
    assert(document.documentElement.scrollWidth <= innerWidth, 'Layout must fit the viewport');
    return { recovery: true, tapPickup: true, twist: true, fingerHandoff: true, viewButtons: true,
      mobileOverflow: document.documentElement.scrollWidth > innerWidth };
  } finally {
    canvas.setPointerCapture = capture;
    grabber.drop(); sim.reset();
  }
})();
