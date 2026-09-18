import {
  CARRY_Y,
  GRAB_GRAVITY_SCALE,
  GRAB_MAX_ACCEL,
  GRAB_OMEGA,
  PLAY_RADIUS,
  ROTATE_STEP_DEG,
} from '../config';
import type { Piece, Substep } from './world';

/**
 * The hand.
 *
 * A carried piece behaves like something held rather than something thrown. A
 * critically damped spring pulls it toward the pointer on the horizontal plane
 * of the carry height, gravity is mostly taken off it, and it is held flat with
 * only its yaw under the player's control — which is how a real hand carries a
 * block, and it makes the puzzle about rotation and placement rather than about
 * fighting a wobbling box.
 *
 * Releasing is the drop. Gravity and collision then decide whether the piece
 * goes through the hole, and nothing here ever helps it along.
 */

export interface GrabDeps {
  element: HTMLElement;
  /** The piece under the pointer, or null. */
  pick(clientX: number, clientY: number): Piece | null;
  /** Where the pointer ray meets the carry plane. */
  plane(clientX: number, clientY: number): { x: number; z: number } | null;
  onChange?(piece: Piece | null): void;
}

const yawQuaternion = (yaw: number) => ({
  x: 0,
  y: Math.sin(yaw / 2),
  z: 0,
  w: Math.cos(yaw / 2),
});

export class Grabber implements Substep {
  /**
   * Set false while something else owns the toy, so a click during the dump does
   * not pick a piece up out of the middle of it.
   */
  enabled = true;
  private readonly deps: GrabDeps;
  private held: Piece | null = null;
  private yaw = 0;
  /** From the pointer's carry-plane point to the piece's centre, so it never jumps. */
  private offset = { x: 0, z: 0 };
  private target = { x: 0, z: 0 };
  private carrier: number | null = null;
  private rotator: number | null = null;
  private lastX = 0;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private twist: { angle: number; yaw: number } | null = null;

  constructor(deps: GrabDeps) {
    this.deps = deps;
    const element = deps.element;
    element.addEventListener('pointerdown', this.onDown);
    element.addEventListener('pointermove', this.onMove);
    element.addEventListener('pointerup', this.onUp);
    element.addEventListener('pointercancel', this.onUp);
    element.addEventListener('lostpointercapture', this.onUp);
    element.addEventListener('contextmenu', (event) => event.preventDefault());
    element.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('blur', () => this.drop());
  }

  get holding(): Piece | null {
    return this.held;
  }

  /** Turn the held piece. Positive is clockwise as seen on screen. */
  rotate(radians: number): void {
    if (!this.held) return;
    this.yaw += radians;
  }

  rotateSteps(steps: number): void {
    this.rotate((steps * ROTATE_STEP_DEG * Math.PI) / 180);
  }

  /** Puts the carried piece down. */
  drop(): void {
    const held = this.held;
    if (!held) return;
    held.body.setGravityScale(1, true);
    held.body.wakeUp();
    this.held = null;
    this.carrier = null;
    this.rotator = null;
    this.twist = null;
    this.pointers.clear();
    this.deps.onChange?.(null);
  }

  before(dt: number): void {
    const held = this.held;
    if (!held) return;
    const body = held.body;
    const position = body.translation();
    const velocity = body.linvel();
    const omega = GRAB_OMEGA;

    const target = this.clampedTarget();
    const ax = (target.x - position.x) * omega * omega - velocity.x * 2 * omega;
    const ay = (CARRY_Y - position.y) * omega * omega - velocity.y * 2 * omega;
    const az = (target.z - position.z) * omega * omega - velocity.z * 2 * omega;

    const magnitude = Math.hypot(ax, ay, az);
    const scale = magnitude > GRAB_MAX_ACCEL ? GRAB_MAX_ACCEL / magnitude : 1;
    const impulse = body.mass() * dt * scale;
    body.applyImpulse({ x: ax * impulse, y: ay * impulse, z: az * impulse }, true);
    body.setRotation(yawQuaternion(this.yaw), true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  /** Keeps a carried piece inside the play area so it can never be lost off-screen. */
  private clampedTarget(): { x: number; z: number } {
    const radius = Math.hypot(this.target.x, this.target.z);
    if (radius <= PLAY_RADIUS) return this.target;
    const scale = PLAY_RADIUS / radius;
    return { x: this.target.x * scale, z: this.target.z * scale };
  }

  private onDown = (event: PointerEvent): void => {
    if (!this.enabled) return;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.deps.element.setPointerCapture?.(event.pointerId);

    // Two fingers twist. The distance between them sets the piece's angle.
    if (this.pointers.size >= 2 && this.held) {
      const [a, b] = [...this.pointers.values()];
      this.twist = { angle: Math.atan2(b.y - a.y, b.x - a.x), yaw: this.yaw };
      return;
    }
    if (event.button === 2) {
      if (this.held) {
        this.rotator = event.pointerId;
        this.lastX = event.clientX;
      }
      return;
    }
    if (this.held) return;
    if (event.button !== 0 && event.pointerType !== 'touch') return;

    const piece = this.deps.pick(event.clientX, event.clientY);
    if (!piece) return;
    const point = this.deps.plane(event.clientX, event.clientY);
    if (!point) return;
    const position = piece.body.translation();
    this.held = piece;
    this.carrier = event.pointerId;
    this.yaw = 0;
    this.offset = { x: position.x - point.x, z: position.z - point.z };
    this.target = { x: position.x, z: position.z };
    piece.body.setGravityScale(GRAB_GRAVITY_SCALE, true);
    piece.body.wakeUp();
    this.deps.onChange?.(piece);
  };

  private onMove = (event: PointerEvent): void => {
    if (this.pointers.has(event.pointerId)) {
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (!this.held) return;

    if (this.twist && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      this.yaw = this.twist.yaw + (Math.atan2(b.y - a.y, b.x - a.x) - this.twist.angle);
      return;
    }
    if (event.pointerId === this.rotator) {
      this.yaw += (event.clientX - this.lastX) * 0.012;
      this.lastX = event.clientX;
      return;
    }
    if (event.pointerId !== this.carrier) return;
    const point = this.deps.plane(event.clientX, event.clientY);
    if (point) this.target = { x: point.x + this.offset.x, z: point.z + this.offset.z };
  };

  private onUp = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) this.twist = null;
    if (event.pointerId === this.rotator) this.rotator = null;
    if (event.pointerId === this.carrier) this.drop();
  };

  private onWheel = (event: WheelEvent): void => {
    if (!this.held) return;
    event.preventDefault();
    this.rotateSteps(event.deltaY < 0 ? 1 : -1);
  };
}
