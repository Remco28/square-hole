/**
 * Toy millimetres in, world metres out.
 *
 * The scene is built at a 10x scale-up: one millimetre on the real toy is one
 * centimetre of world. Rapier's solver is tuned for metre-sized bodies, so
 * scaling the toy up (rather than shrinking the units) keeps the physics in its
 * comfortable range while every number below stays something you could measure
 * with a ruler on the real object. Gravity is scaled with it, which is also what
 * makes the pieces fall at the speed a hand-held toy does.
 */
export const SCALE = 10;

/** Toy millimetres to world metres. */
export const U = (mm: number): number => (mm * SCALE) / 1000;

export const GRAVITY_Y = -9.81 * SCALE;

/** The sim runs at a fixed 120 Hz so the drop test and the browser agree. */
export const FIXED_DT = 1 / 120;

// --- the pail and its lid, in toy millimetres ---------------------------------

export const PAIL_OUTER_R = 80;
export const PAIL_WALL = 3;
export const PAIL_DEPTH = 70;
export const LID_R = 88;
/**
 * The plate's thickness, and the most important number in the game.
 *
 * A thin lid is a trap. A piece that tips on impact can self-lock in the bore —
 * with a 6 mm plate a 13 degree tip is already enough, and friction does the
 * rest, so pieces that genuinely fit would hang in the hole. The tip a piece can
 * absorb before it wedges grows with the plate's thickness, so the lid is made
 * almost as thick as the pieces are: at 16 mm a piece has to reach about 38
 * degrees before it can jam, which it will not do falling flat. A chunky lid also
 * looks like the wooden sorters this joke is about.
 */
export const LID_T = 16;

/** How far a hole opens up at the lid's top face, and over what depth. */
export const LID_FLARE = 1.8;
export const LID_FLARE_DEPTH = 3.5;

/** The piece the square hole was designed for. */
export const SQUARE_SIDE = 25;

/**
 * Slack every piece is given in its own matching hole, in toy millimetres, and
 * therefore also how much the square hole is bigger than the square piece.
 *
 * This is the playability dial. Under about 2 mm a piece that tips by even a few
 * degrees on the way in can catch its own corner and jam, which reads to a player
 * as the game being broken rather than as the puzzle being hard. At 2.5 mm every
 * piece drops in comfortably while still needing to be lined up.
 */
export const CLEARANCE = 2.5;

/**
 * The hole that eats everything. It is the square piece's own hole — derived
 * rather than written down, so it can never drift out of step with the piece —
 * and `tests/fit.test.ts` holds down the property that every other shape can be
 * turned into it while the square can be turned into nothing else.
 */
export const SQUARE_HOLE = SQUARE_SIDE + CLEARANCE;

/** Prism thickness. Flat pieces are what makes these holes a silhouette puzzle. */
export const PIECE_T = 18;

/** The circle the five holes sit on. */
export const HOLE_RING_R = 42;

/**
 * How high a carried piece rides above the lid's top face. Kept short so the
 * drop is a gentle placement rather than a slam, which is also what stops pieces
 * tipping enough to wedge.
 */
export const CARRY_LIFT = 26;

/** Nothing may be carried past this radius, so pieces can't be lost off-screen. */
export const PLAY_RADIUS = 200;

// --- world Y layout -----------------------------------------------------------
// The counter is the pail's floor: the pail is a wall sitting on the table.

export const COUNTER_HALF = U(300);
export const LID_BOTTOM_Y = U(PAIL_DEPTH);
export const LID_TOP_Y = LID_BOTTOM_Y + U(LID_T);
export const CARRY_Y = LID_TOP_Y + U(CARRY_LIFT);
export const SPAWN_R = U(150);

// --- emptying the pail --------------------------------------------------------

/**
 * How thick the pail's own floor is, below the counter's surface.
 *
 * The pail is a closed tub, not an open wall: once it is picked up it has to keep
 * holding the pieces. The disc is buried so that its top face is exactly the
 * counter the pieces already rest on, which leaves the game untouched and only
 * shows up when the pail is tipped.
 */
export const PAIL_FLOOR_T = 6;

/** How far the lid is moved out of the way, in toy millimetres. */
export const DUMP_LID_LIFT = 110;
export const DUMP_LID_BACK = 200;

/**
 * How far the pail tips, in degrees.
 *
 * This is a friction number, not a taste one. Tipped by `t`, the tub's bore
 * becomes a chute at `t - 90` degrees, and friction holds a piece on a slope up
 * to about `atan(mu)` — 26.6 degrees at the pail's friction of 0.5. A tip of 118
 * leaves the chute at 28 degrees, which is only just past that, so pieces ride
 * down it and stop, still in the tub. At 150 the chute is a comfortable 60 and
 * they slide out the way they should. The rim hinge keeps the geometry honest at
 * any angle, so the only cost is that the pail looks properly upended.
 */
export const DUMP_TILT_DEG = 150;
/** How far the shake at the end of the pour swings, to shift a straggler. */
export const DUMP_SHAKE_DEG = 8;

// --- emptying the pail: how long each beat takes, in seconds -------------------

/**
 * What counts as stopped, for the beats that wait on the pieces.
 *
 * Deliberately a speed rather than Rapier's own idea of sleeping. A piece resting
 * against the pail is touching a body that is not static, and Rapier keeps those
 * awake however long they sit there, so waiting on sleep would stall the show
 * every single time.
 */
export const SETTLE_SPEED = 2;
export const SETTLE_SPIN = 0.4;

export const DUMP_LID_S = 0.45;
export const DUMP_TIP_S = 1.15;
/**
 * How high the pail is lifted to right itself, in toy millimetres.
 *
 * Swinging back down about its rim would sweep the counter, and by then the
 * pieces are lying all around it. Picking it up off the rim first and putting it
 * back down on its base means it never drags through the pile.
 */
export const DUMP_RIGHT_LIFT = 70;
export const DUMP_RIGHT_S = 0.7;
export const DUMP_LOWER_S = 0.4;
export const DUMP_SHAKE_S = 0.6;
/**
 * How long the poured pile lingers before it goes home.
 *
 * The pieces are usually already still by the end of the shake, so without this
 * the reset lands on top of the pour and the pile is never seen. It is a beat for
 * the eye, not a physics requirement.
 */
export const DUMP_SETTLE_MIN_S = 0.55;
/** Waits for the pieces to settle, but never longer than this. */
export const DUMP_SETTLE_MAX_S = 4;

// --- feel knobs ---------------------------------------------------------------

/** Servo frequency of the carrying hand, in rad/s. Higher is twitchier. */
export const GRAB_OMEGA = 18;
/** The hand never pushes harder than this, in m/s^2 relative to gravity. */
export const GRAB_MAX_ACCEL = 2.6 * Math.abs(GRAVITY_Y);
/** Gravity while a piece is held, as a fraction of normal. */
export const GRAB_GRAVITY_SCALE = 0.25;
/** One tap of a rotate control. The triangle's sweet spot is 15 degrees. */
export const ROTATE_STEP_DEG = 15;
