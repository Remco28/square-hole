import {
  DUMP_LID_BACK,
  DUMP_LID_LIFT,
  DUMP_LID_S,
  DUMP_LOWER_S,
  DUMP_RIGHT_LIFT,
  DUMP_RIGHT_S,
  DUMP_SETTLE_MAX_S,
  DUMP_SETTLE_MIN_S,
  DUMP_SHAKE_DEG,
  DUMP_SHAKE_S,
  DUMP_TILT_DEG,
  DUMP_TIP_S,
  PAIL_DEPTH,
  PAIL_OUTER_R,
  U,
} from '../config';
import type { Sim, Substep } from './world';

/**
 * Emptying the pail: the payoff you only get to see if you actually put every
 * piece in, which is the joke's whole point.
 *
 * The show is a small state machine that drives the only two movable bodies in
 * the scene. It runs inside the fixed-step loop as a `Substep`, so it moves the
 * kinematic bodies at the sim's own rate and the physics sees them sweep rather
 * than teleport.
 *
 * It is deliberately physical: the pail really is a tub with a floor, it really
 * does keep the pieces once it is picked up, and it really does pour them onto
 * the counter. Nothing is hidden or faked, so a piece that is somehow still in
 * the pail when the show ends gets caught by the final reset rather than
 * vanishing mid-air.
 *
 * The beats:
 *
 *   1. `lid`     the lid is lifted and set aside, because it sits on the pail's
 *                rim and the pail cannot move with it there.
 *   2. `tip`     the pail rotates about the rim nearest the camera, the way you
 *                tip a bucket over its own edge, until the mouth is under the
 *                contents and they pour out onto the counter.
 *   3. `shake`   a decaying wobble, to shift a piece sitting in the mouth.
 *   4. `settle`  the pail is held tipped until the pieces stop moving, plus a
 *                beat so the pile is actually seen. The toy stays put while they
 *                land, so it never sweeps over them.
 *   5. `right`   the pail is picked up off its rim and turned back upright in the
 *                air. Righting it on the rim would drag it through the pile, and
 *                the pieces are all over the counter by now.
 *   6. `lower`   it is set back down on its base.
 *   7. `lidBack` the lid comes home, which it cannot do any earlier: it overhangs
 *                the pail's rim, so the pail has to be sitting under it first.
 *   8. reset     the pieces go home — the "and then it resets" the game promises,
 *                once they have all stopped, and last so nothing can disturb them.
 */

export type DumpPhase =
  | 'idle'
  | 'lidAside'
  | 'tip'
  | 'shake'
  | 'settle'
  | 'right'
  | 'lower'
  | 'lidBack';

/** Eases both ends, so nothing in the show starts or stops with a jerk. */
const smoothstep = (t: number): number => {
  const k = Math.min(Math.max(t, 0), 1);
  return k * k * (3 - 2 * k);
};

export class BucketDump implements Substep {
  private readonly sim: Sim;
  private phase: DumpPhase = 'idle';
  private elapsed = 0;
  /**
   * How long the pieces have been still, so the settle beat can hold the pile up
   * for a moment without a second timer.
   */
  private stillness = 0;

  constructor(sim: Sim) {
    this.sim = sim;
  }

  /** True while the show owns the toy, and while the sim must keep stepping. */
  get active(): boolean {
    return this.phase !== 'idle';
  }

  get current(): DumpPhase {
    return this.phase;
  }

  start(): void {
    if (this.active) return;
    this.go('lidAside');
  }

  /**
   * Puts the toy straight back where it belongs, however far through the show it
   * is. The manual reset button uses this; the bodies are placed rather than
   * driven because nothing may be stepping the sim afterwards to apply a target.
   */
  abort(): void {
    this.phase = 'idle';
    this.elapsed = 0;
    this.stillness = 0;
    this.placePail(0);
    this.placeLid(0);
  }

  before(dt: number): void {
    if (this.phase === 'idle') return;
    this.elapsed += dt;

    switch (this.phase) {
      case 'lidAside': {
        this.placeLid(smoothstep(this.elapsed / DUMP_LID_S));
        if (this.elapsed >= DUMP_LID_S) this.go('tip');
        break;
      }

      case 'tip': {
        this.placePail(smoothstep(this.elapsed / DUMP_TIP_S) * DUMP_TILT_DEG);
        if (this.elapsed >= DUMP_TIP_S) this.go('shake');
        break;
      }

      case 'shake': {
        const k = this.elapsed / DUMP_SHAKE_S;
        const wobble = Math.sin(k * Math.PI * 6) * DUMP_SHAKE_DEG * (1 - k);
        this.placePail(DUMP_TILT_DEG + wobble);
        if (this.elapsed >= DUMP_SHAKE_S) this.go('settle');
        break;
      }

      case 'settle': {
        this.placePail(DUMP_TILT_DEG);
        // Held still up here until the pieces have finished rolling, and then for
        // a moment longer so the pile is actually seen. The cap matters too: one
        // piece wedged in a corner must not stall the game.
        this.stillness = this.sim.settled() ? this.stillness + dt : 0;
        if (this.stillness >= DUMP_SETTLE_MIN_S || this.elapsed >= DUMP_SETTLE_MAX_S) {
          this.go('right');
        }
        break;
      }

      case 'right': {
        const k = smoothstep(this.elapsed / DUMP_RIGHT_S);
        // Upright in the air first, so the rim never drags through the pile.
        this.placePail(DUMP_TILT_DEG * (1 - k), U(DUMP_RIGHT_LIFT) * k);
        if (this.elapsed >= DUMP_RIGHT_S) this.go('lower');
        break;
      }

      case 'lower': {
        const k = smoothstep(this.elapsed / DUMP_LOWER_S);
        this.placePail(0, U(DUMP_RIGHT_LIFT) * (1 - k));
        if (this.elapsed >= DUMP_LOWER_S) this.go('lidBack');
        break;
      }

      case 'lidBack': {
        this.placePail(0, 0);
        this.placeLid(1 - smoothstep(this.elapsed / DUMP_LID_S));
        if (this.elapsed >= DUMP_LID_S) {
          // Everything is back on the counter, so nothing is left to knock the
          // pieces out of place once they are sent home.
          this.sim.reset();
          this.abort();
        }
        break;
      }
    }
  }

  /** Holds the pail tipped by `degrees`, hinged on the rim nearest the camera. */
  private placePail(degrees: number, lift = 0): void {
    const angle = (degrees * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // The pail's origin is the centre of its base, so rotating the body about the
    // rim means walking that origin along the arc the rim would swing it through.
    const rim = U(PAIL_OUTER_R);
    // Tipping about the bottom rim is only true up to vertical. Past that the rim
    // would be driven down through the counter, so the pail is raised by exactly
    // how far it would have sunk: it ends up standing on the rim it has just
    // rolled over, which is what a bucket actually does.
    const takeUp = Math.max(0, -U(PAIL_DEPTH) * cos) + lift;
    const translation = { x: 0, y: rim * sin + takeUp, z: rim * (1 - cos) };
    const rotation = { x: Math.sin(angle / 2), y: 0, z: 0, w: Math.cos(angle / 2) };

    if (!this.active) {
      // A finished show or an abort places the pail outright: no further step is
      // guaranteed, and a kinematic target nobody applies is a pail left tilted.
      this.sim.pail.setTranslation(translation, true);
      this.sim.pail.setRotation(rotation, true);
      return;
    }
    this.sim.pail.setNextKinematicTranslation(translation);
    this.sim.pail.setNextKinematicRotation(rotation);
  }

  /** `k` runs 0 at the lid's resting place to 1 at cleared out of the way. */
  private placeLid(k: number): void {
    const home = this.sim.lidHome;
    const translation = {
      x: home.x,
      y: home.y + U(DUMP_LID_LIFT) * k,
      z: home.z - U(DUMP_LID_BACK) * k,
    };

    if (!this.active) {
      this.sim.lid.setTranslation(translation, true);
      return;
    }
    this.sim.lid.setNextKinematicTranslation(translation);
  }

  private go(phase: DumpPhase): void {
    this.phase = phase;
    this.elapsed = 0;
    this.stillness = 0;
  }
}
