import { LID_BOTTOM_Y, LID_TOP_Y, PAIL_OUTER_R, PIECE_T, U } from '../config';
import type { SfxName } from './sfx';

/**
 * Turns per-frame body readings into sound events.
 *
 * Polling, not Rapier contact events, on purpose: the zones here are the same
 * ones the game already reasons about (`Sim.allBuried`), so a "through" means
 * what the game means by it, and there is no event plumbing for the headless
 * tests to disagree with. Impact strength comes from the vertical speed that
 * vanished into the contact.
 */

export interface BodyReading {
  x: number;
  y: number;
  z: number;
  vy: number;
  speed: number;
}

export interface Impact {
  piece: number;
  name: SfxName;
  /** 0..1, from impact speed. */
  strength: number;
}

const BORE = U(PAIL_OUTER_R);
const REST_Y = U(PIECE_T) / 2;
/** Downward speed worth voicing, in world m/s. */
const TAP_SPEED = 1.2;
const THROUGH_SPEED = 0.8;

export class ImpactWatcher {
  private prev: BodyReading[] = [];
  private above: boolean[] = [];
  private cooldown: number[] = [];
  private wasSettled = true;
  private noisy = false;

  observe(pieces: BodyReading[], settled: boolean, now: number): Impact[] {
    const out: Impact[] = [];
    if (this.prev.length !== pieces.length) {
      this.prev = pieces.map((p) => ({ ...p }));
      this.above = pieces.map((p) => p.y > LID_TOP_Y);
      this.cooldown = pieces.map(() => -Infinity);
      this.wasSettled = settled;
      return out;
    }

    let fresh = false;
    pieces.forEach((p, i) => {
      const was = this.prev[i];
      const wasAbove = this.above[i];
      const isAbove = p.y > LID_TOP_Y;
      this.above[i] = isAbove;
      const insideBore = Math.hypot(p.x, p.z) < BORE;
      // How much downward speed vanished into a contact since last frame.
      // Positive means the fall stopped (or bounced); speeding up under gravity
      // goes negative and is never a sound.
      const stop = p.vy - was.vy;

      // Through: crossed the plate going down inside the wall.
      if (wasAbove && !isAbove && p.vy < -THROUGH_SPEED && insideBore) {
        this.emit(out, i, 'through', (-p.vy - THROUGH_SPEED) / 8 + 0.5, now);
      } else if (
        // Lid tap: was falling onto the plate and stopped (or bounced).
        stop > TAP_SPEED &&
        p.y > LID_BOTTOM_Y &&
        p.y < LID_TOP_Y + U(30) &&
        was.vy < -TAP_SPEED &&
        !(wasAbove && !isAbove && insideBore)
      ) {
        this.emit(out, i, 'lid-tap', (stop - TAP_SPEED) / 10 + 0.35, now);
      } else if (
        // Counter tap: landed back on the table / pail floor.
        stop > TAP_SPEED &&
        was.y > REST_Y + U(4) &&
        p.y <= REST_Y + U(4) &&
        was.vy < -TAP_SPEED
      ) {
        this.emit(out, i, 'counter-tap', (stop - TAP_SPEED) / 10 + 0.35, now);
      }
      if (stop > TAP_SPEED) fresh = true;
      this.prev[i] = { ...p };
    });

    // Settle: motion stopped after a noisy spell.
    if (fresh) this.noisy = true;
    if (settled && !this.wasSettled && this.noisy) {
      out.push({ piece: -1, name: 'settle', strength: 0.5 });
      this.noisy = false;
    }
    this.wasSettled = settled;

    return out;
  }

  private emit(out: Impact[], piece: number, name: SfxName, strength: number, now: number): void {
    if (now - this.cooldown[piece] < 0.12) return;
    this.cooldown[piece] = now;
    out.push({ piece, name, strength: Math.max(0, Math.min(1, strength)) });
  }
}
