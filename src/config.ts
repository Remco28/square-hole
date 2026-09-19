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
// Five 18 mm blocks can stack under one hole. Leave room above that stack,
// including pieces that settle on an edge, rather than relying on them scattering.
export const PAIL_DEPTH = 120;
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
export const LID_FLARE = 2.4;
export const LID_FLARE_DEPTH = 5;

/** The piece the square hole was designed for. */
export const SQUARE_SIDE = 25;

/**
 * Slack every piece is given in its own matching hole, in toy millimetres, and
 * therefore also how much the square hole is bigger than the square piece.
 *
 * This is the playability dial. Under about 2 mm a piece that tips by even a few
 * degrees on the way in can catch its own corner and jam, which reads to a player
 * as the game being broken rather than as the puzzle being hard. At 3 mm every
 * piece drops in comfortably while still needing to be lined up.
 */
export const CLEARANCE = 3;

/**
 * Extra room in every hole except the square. The square hole is the joke and
 * stays snug; the matching holes are just doors, so they get more slack than a
 * millimetre or two of fingertip error.
 */
export const MATCH_CLEARANCE = 4;

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
export const CARRY_LIFT = 20;

/** Nothing may be carried past this radius, so pieces can't be lost off-screen. */
export const PLAY_RADIUS = 200;

// --- world Y layout -----------------------------------------------------------
// The counter is the pail's floor: the pail is a wall sitting on the table.

export const COUNTER_HALF = U(300);
export const LID_BOTTOM_Y = U(PAIL_DEPTH);
export const LID_TOP_Y = LID_BOTTOM_Y + U(LID_T);
export const CARRY_Y = LID_TOP_Y + U(CARRY_LIFT);
export const SPAWN_R = U(170);

/**
 * How thick the pail's own floor is, below the counter's surface.
 *
 * The pail is a closed tub, not an open wall. The disc is buried so that its
 * top face is exactly the counter the pieces already rest on: a seated piece
 * lands flush on it, and normal play never notices it is there.
 */
export const PAIL_FLOOR_T = 6;

/**
 * What counts as stopped.
 *
 * Deliberately a speed rather than Rapier's own idea of sleeping, so the
 * settle sound fires on motion, not on the solver's bookkeeping.
 */
export const SETTLE_SPEED = 2;
export const SETTLE_SPIN = 0.4;

// --- feel knobs ---------------------------------------------------------------

/** Servo frequency of the carrying hand, in rad/s. Higher is twitchier. */
export const GRAB_OMEGA = 18;
/** The hand never pushes harder than this, in m/s^2 relative to gravity. */
export const GRAB_MAX_ACCEL = 2.6 * Math.abs(GRAVITY_Y);
/** Gravity while a piece is held, as a fraction of normal. */
export const GRAB_GRAVITY_SCALE = 0.25;
/** One tap of a rotate control. The triangle's sweet spot is 15 degrees. */
export const ROTATE_STEP_DEG = 15;
