# Square Hole

A browser recreation of the shape sorter joke. Two square panels: a mirror of your
own webcam on one side, a real physics toy on the other. Five pieces, five holes,
and every piece also fits through the square hole — if you turn it the right way.

Get all five into the pail and admire your work. `Reset` sends every piece back
to its starting place whenever you want another round. The original that started
it all is <a href="https://www.youtube.com/shorts/dmohsez6fck">here</a>.

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
| Carry a piece | Drag, or tap to pick up and tap again to drop |
| Drop it | Release a drag, or tap again after picking up |
| Rotate a block | Two-finger twist while holding it; desktop: `Q` / `E`, `←` / `→`, or mouse wheel |
| Turn around the pail | `⟲` / `⟳` |
| Put everything back | `Reset` |
| Record both panels | `Record` (records to a downloadable file when you stop) |

There is no auto-show at the end of a round: when the fifth piece is in, the
game just sits there looking pleased with itself until you hit `Reset`.

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
cannot see. Needs `npm run dev` running:

```bash
agent-browser open http://127.0.0.1:5174/
agent-browser eval "$(cat tests/probe.mjs)"   # grab, carry, rotate, drop a piece
```

See `PLAN.md` for the design, the bugs that were worth the digging, and the sound
decision that is still open.

## Static hosting

Live site: [squarehole.teamremco.org](https://squarehole.teamremco.org)

`npm run build` creates `dist/`. Vite uses relative asset URLs (`base: './'`),
so a repository subdirectory or a custom domain both work. There is no server
runtime. Camera and microphone access require HTTPS (or localhost), and all
media stays in the browser.

GitHub Pages is built from `master` by `.github/workflows/pages.yml`. After the
first push, in the GitHub repo:

1. **Settings → Pages → Source:** GitHub Actions
2. **Custom domain:** `squarehole.teamremco.org`
3. **DNS:** CNAME `squarehole` → `remco28.github.io`

GitHub ignores a committed `CNAME` when Pages is served from Actions; the
`public/CNAME` file is still copied into `dist/` as a record of the intended
host. Enforce HTTPS once the domain shows as verified.

The toy uses plain plastic materials with fine surface grain, beveled blocks,
and molded rim details. Pickup uses a kinematic hand so a rejected piece can
always be lifted out; release restores gravity and physical collisions.
The 120 mm interior leaves room for all five blocks beneath one hole, including
a stack. Regression tests drop complete rounds in all 120 possible orders.

## Recorded output

Recording renders both panels into one fixed 2:1 canvas, so a phone recording the
stacked layout still gets a normal side-by-side video. Audio is the room mic
mixed with the synthesised clatter, so the reaction and the pieces landing both
make it into the file. Deny the mic and the video is still recorded, just
quieter.
