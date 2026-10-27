import * as THREE from 'three';
import {
  PLAYER_DOWN_RESPAWN_SECONDS,
  PLAYER_MAX_HP,
} from '../core/constants';
import { isBlockedAt, type Collider } from '../core/collision';
import type { BridgeBounds } from '../three/SceneFactory';

export interface PlayerCallbacks {
  onTriggerDown(): void;
  onTriggerUp(): void;
  onReload(): void;
  onDamage(amount: number): void;
  onDown: (reason: 'shot' | 'fall') => void;
  onRespawn(): void;
  onPauseRequest(): void;
  onLockChange(locked: boolean): void;
  onFootstep(): void;
  /** Mobile joystick: moveX (-1 to 1), moveY (-1 to 1, forward is positive) */
  onMobileMove?(moveX: number, moveY: number): void;
  /** Mobile aim: pixel deltas from touch drag */
  onMobileAim?(deltaX: number, deltaY: number): void;
}

export class PlayerController {
  readonly camera: THREE.PerspectiveCamera;
  hp = PLAYER_MAX_HP;
  downed = false;

  private readonly domElement: HTMLElement;
  private readonly bounds: BridgeBounds;
  private readonly colliders: Collider[];
  private readonly spawnPosition: THREE.Vector3;
  private readonly callbacks: PlayerCallbacks;
  private readonly keys = new Set<string>();
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly movement = new THREE.Vector3();
  private mobileMoveX = 0;
  private mobileMoveY = 0;

  private yaw = 0;
  private pitch = -0.1;
  private crouched = false;
  private downEndsAt = 0;
  private footstepTimer = 0;
  private falling = false;
  private fallVelocity = 0;
  private jumpOffset = 0;
  private jumpVelocity = 0;
  private grounded = true;
  private paused = false;
  private enabled = true;
  private locked = false;
  private wasLocked = false;
  private disposed = false;

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    bounds: BridgeBounds,
    colliders: Collider[],
    spawnPosition: THREE.Vector3,
    callbacks: PlayerCallbacks,
  ) {
    this.camera = camera;
    this.domElement = domElement;
    this.bounds = bounds;
    this.colliders = colliders;
    this.spawnPosition = spawnPosition.clone();
    this.callbacks = callbacks;

    this.camera.rotation.order = 'YXZ';
    this.camera.position.set(
      this.spawnPosition.x,
      this.bounds.deckY + this.eyeHeight,
      this.spawnPosition.z,
    );
    this.applyRotation();

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    this.domElement.addEventListener('click', this.handleCanvasClick);
    this.domElement.addEventListener('contextmenu', this.handleContextMenu);
  }

  get isDowned(): boolean {
    return this.downed;
  }

  get isAlive(): boolean {
    return !this.downed && this.hp > 0;
  }

  get isLocked(): boolean {
    return this.locked;
  }

  get downSecondsLeft(): number {
    return this.downed
      ? Math.max(0, (this.downEndsAt - performance.now()) / 1000)
      : 0;
  }

  get position(): THREE.Vector3 {
    return this.camera.position;
  }

  get eyeHeight(): number {
    return this.crouched ? 1.12 : 1.65;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) {
      this.keys.clear();
      this.callbacks.onTriggerUp();
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.keys.clear();
      this.callbacks.onTriggerUp();
    }
  }

  lock(): void {
    if (this.locked || this.paused || this.downed || !this.enabled) return;
    try {
      const result = this.domElement.requestPointerLock() as unknown;
      if (result && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch(() => {
          this.callbacks.onLockChange(false);
        });
      }
    } catch {
      this.callbacks.onLockChange(false);
    }
  }

  update(dt: number): void {
    if (this.disposed || this.paused || !this.enabled) return;

    if (this.downed) {
      if (performance.now() >= this.downEndsAt) {
        this.respawn();
      }
      return;
    }

    if (this.falling) {
      this.fallVelocity += 16 * dt;
      this.camera.position.y -= this.fallVelocity * dt;
      if (this.camera.position.y <= 0.6) {
        this.falling = false;
        this.fallVelocity = 0;
        this.beginDown('fall');
      }
      return;
    }

    if (!this.grounded) {
      this.jumpVelocity -= 14 * dt;
      this.jumpOffset += this.jumpVelocity * dt;
      if (this.jumpOffset <= 0) {
        this.jumpOffset = 0;
        this.jumpVelocity = 0;
        this.grounded = true;
      }
    }

    let forwardInput = 0;
    let rightInput = 0;
    if (this.keys.has('KeyW')) forwardInput += 1;
    if (this.keys.has('KeyS')) forwardInput -= 1;
    if (this.keys.has('KeyD')) rightInput += 1;
    if (this.keys.has('KeyA')) rightInput -= 1;

    // Blend mobile joystick input (positive Y = forward, positive X = right)
    forwardInput += this.mobileMoveY;
    rightInput += this.mobileMoveX;

    this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.movement
      .copy(this.forward)
      .multiplyScalar(forwardInput)
      .addScaledVector(this.right, rightInput);

    const moving = this.movement.lengthSq() > 0;
    if (moving) {
      this.movement.normalize();
      const sprinting = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
      const speed = this.crouched ? 2.1 : sprinting ? 6.2 : 4.1;
      const nextX = this.camera.position.x + this.movement.x * speed * dt;
      const nextZ = this.camera.position.z + this.movement.z * speed * dt;
      if (!isBlockedAt(this.colliders, nextX, this.camera.position.z, this.jumpOffset)) {
        this.camera.position.x = nextX;
      }
      if (!isBlockedAt(this.colliders, this.camera.position.x, nextZ, this.jumpOffset)) {
        this.camera.position.z = nextZ;
      }
      this.footstepTimer -= dt;
      if (this.footstepTimer <= 0) {
        this.footstepTimer = sprinting ? 0.32 : 0.48;
        this.callbacks.onFootstep();
      }
    } else {
      this.footstepTimer = 0;
    }

    this.clampToBattlefield();
    if (this.falling) return;
    this.camera.position.y = this.bounds.deckY + this.eyeHeight + this.jumpOffset;
    this.applyRotation();
  }

  /** Apply mobile joystick input directly. */
  setMobileMove(moveX: number, moveY: number): void {
    this.mobileMoveX = moveX;
    this.mobileMoveY = moveY;
  }

  /** Apply mobile aim deltas. */
  applyMobileAim(deltaX: number, deltaY: number): void {
    if (this.downed || this.paused || !this.enabled) return;
    this.yaw -= deltaX * 0.003;
    this.pitch -= deltaY * 0.003;
    this.applyRotation();
  }

  setSpawnPoint(x: number, z: number): void {
    this.spawnPosition.set(x, this.bounds.deckY, z);
  }

  teleportTo(x: number, z: number): void {
    this.falling = false;
    this.fallVelocity = 0;
    this.jumpOffset = 0;
    this.jumpVelocity = 0;
    this.grounded = true;
    this.yaw = 0;
    this.pitch = -0.1;
    this.camera.position.set(x, this.bounds.deckY + this.eyeHeight, z);
    this.applyRotation();
  }

  takeDamage(amount: number): void {
    if (this.downed || this.paused || !this.enabled || amount <= 0) return;
    this.hp = Math.max(0, this.hp - amount);
    this.callbacks.onDamage(amount);
    if (this.hp <= 0) {
      this.beginDown('shot');
    }
  }

  respawn(): void {
    this.downed = false;
    this.falling = false;
    this.fallVelocity = 0;
    this.jumpOffset = 0;
    this.jumpVelocity = 0;
    this.grounded = true;
    this.hp = PLAYER_MAX_HP;
    this.downEndsAt = 0;
    this.yaw = 0;
    this.pitch = -0.1;
    this.camera.position.set(
      this.spawnPosition.x,
      this.bounds.deckY + this.eyeHeight,
      this.spawnPosition.z,
    );
    this.applyRotation();
    this.callbacks.onRespawn();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mouseup', this.handleMouseUp);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    this.domElement.removeEventListener('click', this.handleCanvasClick);
    this.domElement.removeEventListener('contextmenu', this.handleContextMenu);
    if (this.locked) {
      document.exitPointerLock();
    }
  }

  private beginDown(reason: 'shot' | 'fall'): void {
    if (this.downed) return;
    this.downed = true;
    this.falling = false;
    this.fallVelocity = 0;
    this.downEndsAt = performance.now() + PLAYER_DOWN_RESPAWN_SECONDS * 1000;
    this.keys.clear();
    this.callbacks.onTriggerUp();
    this.callbacks.onDown(reason);
  }

  private clampToBattlefield(): void {
    const z = this.camera.position.z;
    this.camera.position.z = THREE.MathUtils.clamp(
      z,
      this.bounds.worldMinZ,
      this.bounds.worldMaxZ,
    );

    if (this.camera.position.z > this.bounds.minZ && this.camera.position.z < this.bounds.maxZ) {
      if (Math.abs(this.camera.position.x) > this.bounds.maxX) {
        this.falling = true;
        this.fallVelocity = 1.2;
      }
      return;
    }

    this.camera.position.x = THREE.MathUtils.clamp(this.camera.position.x, -28, 28);
  }

  private applyRotation(): void {
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.45, 1.45);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Escape') {
      if (!event.repeat) this.callbacks.onPauseRequest();
      return;
    }
    if (event.code === 'KeyR') {
      event.preventDefault();
      if (!event.repeat) this.callbacks.onReload();
      return;
    }
    if (event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat && this.grounded && !this.paused && !this.downed && this.enabled) {
        this.jumpVelocity = 6;
        this.grounded = false;
      }
      return;
    }
    if (event.code === 'KeyC') {
      if (!event.repeat) this.crouched = !this.crouched;
      return;
    }
    this.keys.add(event.code);
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private handleMouseMove = (event: MouseEvent): void => {
    if (!this.locked || this.paused || this.downed) return;
    const sensitivity = 0.0022;
    this.yaw -= event.movementX * sensitivity;
    this.pitch -= event.movementY * sensitivity;
    this.applyRotation();
  };

  private handleMouseDown = (event: MouseEvent): void => {
    if (!this.locked || this.paused || this.downed || !this.enabled) return;
    if (event.button === 0) {
      this.callbacks.onTriggerDown();
    }
  };

  private handleMouseUp = (event: MouseEvent): void => {
    if (event.button === 0) {
      this.callbacks.onTriggerUp();
    }
  };

  private handlePointerLockChange = (): void => {
    const locked = document.pointerLockElement === this.domElement;
    this.locked = locked;
    this.callbacks.onLockChange(locked);
    if (!locked) {
      this.callbacks.onTriggerUp();
    }

    if (this.wasLocked && !locked && !this.paused && !this.downed && this.enabled) {
      this.callbacks.onPauseRequest();
    }
    this.wasLocked = locked;
  };

  private handleCanvasClick = (): void => {
    if (!this.locked && !this.paused && !this.downed && this.enabled) {
      this.lock();
    }
  };

  private handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };
}
