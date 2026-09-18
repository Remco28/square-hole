# Square Hole

A browser recreation of the shape sorter joke. Two square panels: a mirror of your
own webcam on one side, a real physics toy on the other. Five pieces, five holes,
and every piece also fits through the square hole — if you turn it the right way.

Seat all five and the round is over: the pail picks itself up, tips over and pours
the pieces out onto the counter, then everything goes back where it started.

Everything runs in the browser. There is no backend, no API key, and no build-time
asset pipeline: the lid, the pail, and the pieces are all generated in code, and
the meshes you see are the colliders the physics uses.

```bash
npm install
npm run dev      # http://127.0.0.1:5174
npm test         # geometry invariants + headless physics drops
npm run build    # static output in dist/
```

The camera needs a secure context: `localhost` counts, and so does any HTTPS host.
If you deny the camera the puzzle still works, you just lose the mirror.

## Controls

| Action | How |
|---|---|
| Carry a piece | Press on it and drag |
| Drop it | Release |
| Rotate it | `⟲` / `⟳`, `Q` / `E`, `←` / `→`, the mouse wheel, a right-drag, or a two-finger twist |
| Put everything back | `Reset` (cuts the dump short if it is mid-flight) |
| Record both panels | `Record` (records to a downloadable file when you stop) |

Emptying the pail is not a control. It happens on its own once the fifth piece is
in and nothing is moving, and grabbing is switched off while it runs.

A carried piece rides flat, the way a hand holds a block, so the puzzle is about
rotation and placement rather than about fighting a wobbling box. Releasing is the
drop: gravity and collision decide whether it goes through the hole, and nothing
ever helps it along.

## How it is put together

- **Vite + TypeScript + three.js + Rapier.** Same shape as `~/Dev/crokinole`.
- **The geometry is the single source of truth** (`src/geometry/profiles.ts`).
  Editing a shape there moves its mesh and its collider together, because
  `solid.ts` builds both from the same vertices. That is what lets the fit tests
  mean something about what happens on screen.
- **The joke is geometry, not scripting.** `tests/fit.test.ts` proves analytically
  that every silhouette can be turned into the square hole, that the square can be
  turned into nothing else, and how much clearance each fit has. `tests/drop.test.ts`
  then drops real pieces at real holes in a headless Rapier world and checks they
  end up inside the pail.

Two scripts drive the real page in a real browser, for the things a headless test
cannot see. Both need `npm run dev` running:

```bash
agent-browser open http://127.0.0.1:5174/
agent-browser eval "$(cat tests/probe.mjs)"   # grab, carry, rotate, drop a piece
agent-browser eval "$(cat tests/show.mjs)"    # the end-of-round dump, frame by frame
```

See `PLAN.md` for the design, the bugs that were worth the digging, and the sound
decision that is still open.

## Recorded output

Recording renders both panels into one fixed 2:1 canvas, so a phone recording the
stacked layout still gets a normal side-by-side video. Audio is the room mic
mixed with the synthesised clatter, so the reaction and the pieces landing both
make it into the file. Deny the mic and the video is still recorded, just
quieter.
