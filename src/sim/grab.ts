import {
  CARRY_Y,
  GRAB_GRAVITY_SCALE,
  GRAB_OMEGA,
  PLAY_RADIUS,
  ROTATE_STEP_DEG,
  U,
} from '../config';
import type { Piece, Substep } from './world';
import { RigidBodyType } from '@dimforge/rapier3d-compat';

/**
 * The hand.
 *
 * A carried piece behaves like something held rather than something thrown. A
 * kinematic hand lifts it out of contact and toward the pointer on the horizontal
 * carry plane. It is held flat with
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
   * Master switch for the hand. Currently always on during play; the flag stays
   * so some future mode (a replay, a cutscene) can own the toy for a while.
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
  private press = { x: 0, y: 0 };
  private dragged = false;
  private latched = false;
  private dropOnTap = false;

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
    this.yaw -= radians;
  }

  rotateSteps(steps: number): void {
    this.rotate((steps * ROTATE_STEP_DEG * Math.PI) / 180);
  }

  /** Puts the carried piece down. */
  drop(): void {
    const held = this.held;
    if (!held) return;
    held.body.setBodyType(RigidBodyType.Dynamic, true);
    held.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    held.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    held.body.setGravityScale(1, true);
    held.body.wakeUp();
    this.held = null;
    this.carrier = null;
    this.rotator = null;
    this.twist = null;
    this.latched = false;
    this.dropOnTap = false;
    this.pointers.clear();
    this.deps.onChange?.(null);
  }

  before(dt: number): void {
    const held = this.held;
    if (!held) return;
    const body = held.body;
    const position = body.translation();
    const target = this.clampedTarget();
    const blend = 1 - Math.exp(-GRAB_OMEGA * dt);
    body.setNextKinematicTranslation({
      x: position.x + (target.x - position.x) * blend,
      y: position.y + (CARRY_Y - position.y) * blend,
      z: position.z + (target.z - position.z) * blend,
    });
    body.setNextKinematicRotation(yawQuaternion(this.yaw));
  }

  /** Keeps a carried piece inside the play area so it can never be lost off-screen. */
  private clampedTarget(): { x: number; z: number } {
    // PLAY_RADIUS is toy millimetres; the target rides in world metres.
    const limit = U(PLAY_RADIUS);
    const radius = Math.hypot(this.target.x, this.target.z);
    if (radius <= limit) return this.target;
    const scale = limit / radius;
    return { x: this.target.x * scale, z: this.target.z * scale };
  }

  private onDown = (event: PointerEvent): void => {
    if (!this.enabled) return;
    if (this.held && this.latched && event.button === 0 && this.pointers.size === 0) {
      this.dropOnTap = true;
      this.latched = false;
      this.carrier = event.pointerId;
      this.press = { x: event.clientX, y: event.clientY };
      this.dragged = false;
    }
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.deps.element.setPointerCapture?.(event.pointerId);

    // Two fingers twist. The distance between them sets the piece's angle.
    if (this.pointers.size >= 2 && this.held) {
      this.dragged = true;
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
    this.press = { x: event.clientX, y: event.clientY };
    this.dragged = false;
    const q = piece.body.rotation();
    this.yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
    this.offset = { x: position.x - point.x, z: position.z - point.z };
    this.target = { x: position.x, z: position.z };
    piece.body.setGravityScale(GRAB_GRAVITY_SCALE, true);
    piece.body.setBodyType(RigidBodyType.KinematicPositionBased, true);
    piece.body.wakeUp();
    this.deps.onChange?.(piece);
  };

  private onMove = (event: PointerEvent): void => {
    if (this.pointers.has(event.pointerId)) {
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (!this.held) return;
    if (event.pointerId === this.carrier && Math.hypot(event.clientX - this.press.x, event.clientY - this.press.y) > 5) this.dragged = true;

    if (this.twist && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      this.yaw = this.twist.yaw - (Math.atan2(b.y - a.y, b.x - a.x) - this.twist.angle);
      return;
    }
    if (event.pointerId === this.rotator) {
      this.yaw += (event.clientX - this.lastX) * 0.012;
      this.lastX = event.clientX;
      return;
    }
    if (event.pointerId !== this.carrier && !this.latched) return;
    const point = this.deps.plane(event.clientX, event.clientY);
    if (point) this.target = { x: point.x + this.offset.x, z: point.z + this.offset.z };
  };

  private onUp = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) this.twist = null;
    if (event.pointerId === this.rotator) this.rotator = null;
    if (event.pointerId === this.carrier) {
      if (event.type === 'pointerup' && this.pointers.size > 0) {
        const [id, pointer] = [...this.pointers.entries()][0];
        this.carrier = id;
        const point = this.deps.plane(pointer.x, pointer.y);
        if (point) this.offset = { x: this.target.x - point.x, z: this.target.z - point.z };
      }
      else if (event.type === 'pointercancel' || event.type === 'lostpointercapture' || (event.type === 'pointerup' && (this.dragged || this.dropOnTap))) this.drop();
      else if (event.type === 'pointerup') {
        this.latched = true;
        this.carrier = null;
      }
    }
  };

  private onWheel = (event: WheelEvent): void => {
    if (!this.held) return;
    event.preventDefault();
    this.rotateSteps(event.deltaY < 0 ? 1 : -1);
  };
}
