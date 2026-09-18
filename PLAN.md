# Square Hole — every shape fits

Location: `~/Dev/square-hole` · Frontend-only SPA · No backend · No build step for assets.

## 1. Vision

A browser recreation of the shape sorter joke. Two square panels: on one side a
mirror of your own webcam, on the other a real physics toy — a pail with a lid
full of holes and five pieces. Each piece belongs in its own hole, and every one
of them also fits through the square hole.

The left panel is only a mirror. The joke is that the person getting upset about
the shape sorter is you.

## 2. Locked v1 scope

- Two **1:1** panels: side by side when the viewport can afford it, stacked on a
  phone with the mirror shrunk so the puzzle keeps the thumb zone.
- Stylised 3D: a pale moulded lid over a pail on a speckled counter. Not a
  photo-real kitchen, not a tin pail.
- Five pieces: square, rectangle, circle, triangle, house. Every hole is open,
  every hole has a countersink, and every piece can be threaded through the
  square hole.
- Hybrid grabbing: drag to carry, release to drop, and rotate with the on-screen
  buttons, `Q`/`E`, the arrow keys, the mouse wheel, a right-drag, or a
  two-finger twist.
- The round ends quietly: when the fifth piece is in, the game sits there looking
  pleased with itself until `Reset` sends every piece home. (The self-emptying
  pail of v1 was removed — see §6.)
- Client-side recording of both panels into one downloadable video.
- Out of scope: sound (**see §7**), any reaction layer, scoreboards, a backend,
  deployment.

## 3. Units and layout

The whole scene is built at a **10x scale-up**: one millimetre of toy is one
centimetre of world, and `U(mm)` in `src/config.ts` converts. Rapier's solver is
tuned for metre-sized bodies, so scaling the toy up keeps the physics in its
comfortable range while every number in the source stays something you could
measure with a ruler on the real object. Gravity is scaled with it, which is also
what makes the pieces fall at the speed a hand-held toy does.

The counter is the pail's floor: the pail is a wall standing on the table, and
the lid is a plate resting on the rim.

## 4. The numbers that make the joke true

`CLEARANCE` is the only dial that matters, and its two jobs are in tension:

- It is how much room a piece gets in its own hole.
- Because the square hole *is* the square piece's own hole, it is also how much
  bigger the square hole is than the square piece — and therefore how much room
  every other piece gets, whether or not it is being rotated.

At 3 mm: the square hole is 28 mm across, the pieces sit around 25 mm, and
each needs roughly 1 mm of clearance on every side. Verified by
`tests/fit.test.ts` (analytically, in 2D) and `tests/drop.test.ts` (physically,
in a headless Rapier world):

| | fits its own hole | fits the square hole | can be broken by rotating |
|---|---|---|---|
| square | yes | yes | yes, 45° jams |
| rectangle | yes | yes | yes, 45° jams |
| circle | yes | yes, at any angle | no, it is round |
| triangle | yes | yes, at any angle | no, its widest is 26 |
| house | yes | yes | yes, 45° jams |

The square fits nothing else at any angle. So the square hole takes everything,
and the other holes still mean something.

`LID_T = 16` is the second number that matters, and it was arrived at the hard
way (see §5). The countersink at the top of each hole (`LID_FLARE`, 1.8 mm over
3.5 mm) is what lets a piece that is a millimetre or two off still find its way
in; `tests/drop.test.ts` covers that directly.

## 5. Findings worth keeping

Four real bugs, all invisible to reasoning and found by measuring (3 and 4 date
from the removed pour in §6, kept because the lessons are cheap to re-learn):

1. **Rapier trimesh flags.** The lid is a closed solid built from a single
   generator, with duplicated vertices so that sharp edges keep their own
   shading. Handed to Rapier as a bare `trimesh`, a piece that had entered a hole
   with clearance on every side would come to rest *hovering inside it*, with no
   contacts reported at all. The fix is `TriMeshFlags.ORIENTED |
   TriMeshFlags.FIX_INTERNAL_EDGES`: the first tells Rapier which side is solid,
   the second is documented as eliminating "incorrect bumps ... especially on flat
   surfaces", and it also merges the duplicated vertices that the edge fix needs
   in order to see the mesh as connected. `tests/lid.test.ts` guards the
   precondition for the `ORIENTED` claim by asserting every generated solid has
   positive signed volume.

2. **A thin lid is a trap.** With a 6 mm plate, a piece that tipped by 13° on
   impact self-locked in the bore and friction held it there, so pieces that
   genuinely fitted would hang. The tip a piece can absorb before wedging grows
   with the plate's thickness, so the lid was made nearly as thick as the pieces
   are. At 16 mm it takes about 38° of tip to jam, which a flat drop never
   reaches.

3. **A chute has to beat friction, not gravity.** The pail originally tipped
   about its rim by 118°, which leaves the bore as a chute 28° below horizontal.
   The pail's friction is 0.5, so anything up to `atan(0.5)`, or 26.6°, holds a
   piece still. The pieces therefore rode down the inside and stopped just short
   of the mouth, still in the tub, and the end-of-round reset tidied up after a
   pour that had never happened — which looks identical to a working pour unless
   you check *before* the reset. At 150° the chute is 60° and they slide out.
   `tests/show.mjs` is what caught it; the headless test's seating happened to
   pour at 118°, so it passed while the game did not.

4. **Stopped is not the same as asleep.** Rapier will not put a body to sleep
   while it rests against a body that is not static, and the pail has to be
   kinematic for the dump to move it. Pieces leaning on the pail therefore stay
   awake indefinitely, so the dump's "wait for the pieces to settle" beat sat on
   its four-second safety cap every single time. Asking about speed instead
   (`Sim.settled()`) is both honest and immune to it.

Also worth remembering: CCD was tried and removed. It changed no outcome, and
the plate is thick enough that a piece cannot cross it in one step.

## 6. End of round (removed)

The pail used to empty itself once every piece was in: lid aside, tip about the
rim, shake, settle, right in the air, lower, lid back, pieces home. Removed —
playtesting showed the pour reading as pieces "just falling out", and the pail
coming back down could cover pieces lying in its footprint ("under the bucket").
`Reset` is the whole mechanism now: it drops any held piece and sends everything
home. The lid, pail and counter are fixed bodies; the pieces are the only moving
bodies in the scene. `Sim.allBuried` stays as the round-complete query.

## 7. Sound (implemented)

Synthesised plastic clatter, no audio files — the crokinole bargain
(`crokinole/src/audio/synthesis.ts` plus a tested `impactSamples()`), retuned
for plastic: a filtered noise burst with a short pitch-swept body per voice in
`src/audio/sfx.ts`, with `src/audio/impacts.ts` turning per-frame body readings
into the four events (`lid-tap`, `through`, `counter-tap`, `settle`).

Routing is the mix: `AudioContext -> gameBus -> { destination,
MediaStreamAudioDestinationNode }`, and the mic is folded into that same
destination (`SfxEngine.attachMic`, never monitored locally so there is no
feedback). `MemeRecorder` records the resulting single mixed track plus the
side-by-side video, with a raw-mic fallback when the synth is unavailable and
video-only when the mic is denied.

## 8. Architecture

```
src/
  config.ts              every dimension in toy millimetres, and the world layout
  geometry/
    profiles.ts          piece silhouettes, hole layout, derived hole sizes
    fit.ts               can this silhouette be rotated into that hole (2D convex LP)
    solid.ts             one prism/plate builder, so mesh == collider by construction
    bodies.ts            the lid, the pieces, and the pail
  sim/
    world.ts             Rapier world, fixed 120 Hz timestep, sleeps when idle
    grab.ts              the hand: critically damped spring, flat hold, yaw only
  render/scene.ts        three.js scene, lighting, materials, picking
  ui/webcam.ts           the mirror
  ui/recorder.ts         both panels into one canvas, MediaRecorder out
  main.ts                wiring and the frame loop
```

Editing a shape means editing `profiles.ts`. The visual mesh, the convex hull,
the hole it sits in, and the fit tests all read from that one place, so the
puzzle cannot silently disagree with what is on screen.

## 9. Parked for later

- Sound, as above.
- Optional: voice in the recording (needs a mic prompt at startup and local
  muting so you do not hear yourself), and a WebCodecs path for iOS, where
  `MediaRecorder` support is inconsistent.
