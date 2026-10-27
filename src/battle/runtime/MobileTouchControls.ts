import * as THREE from 'three';

/**
 * MobileTouchControls — virtual joystick + aim zone + fire button
 * for touch devices. Provides movement vector and trigger state
 * that the PlayerController can consume.
 *
 * Layout:
 *   - Left half (bottom): virtual joystick for WASD movement
 *   - Right half (top): touch-drag to rotate camera (aim)
 *   - Right half (bottom): fire button for shooting
 */
export interface MobileTouchCallbacks {
  onMove(moveX: number, moveY: number): void;
  onAim(deltaX: number, deltaY: number): void;
  onTriggerDown(): void;
  onTriggerUp(): void;
}

export class MobileTouchControls {
  private readonly container: HTMLElement;
  private readonly callbacks: MobileTouchCallbacks;
  private readonly joystickZone!: HTMLElement;
  private readonly aimZone!: HTMLElement;
  private readonly fireBtn!: HTMLElement;
  private readonly hint!: HTMLElement;
  private readonly joystickBase!: HTMLElement;
  private readonly joystickThumb!: HTMLElement;

  private joystickActive = false;
  private joystickPointerId: number | null = null;
  private joystickCenter = { x: 0, y: 0 };
  private readonly maxJoystickRadius = 48;

  private aimPointerId: number | null = null;
  private aimLast = { x: 0, y: 0 };

  private firePointerId: number | null = null;

  private isMobile = false;
  private disposed = false;

  constructor(container: HTMLElement, callbacks: MobileTouchCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    // Detect touch device
    this.isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (!this.isMobile) return;

    // Build DOM
    this.hint = document.createElement('div');
    this.hint.className = 'mobile-hint';
    this.hint.textContent = '左侧滑动移动 · 右侧滑动瞄准 · 按钮射击';

    this.joystickZone = document.createElement('div');
    this.joystickZone.className = 'mobile-joystick-zone';
    this.joystickBase = document.createElement('div');
    this.joystickBase.className = 'mobile-joystick-base';
    this.joystickBase.style.display = 'none';
    this.joystickThumb = document.createElement('div');
    this.joystickThumb.className = 'mobile-joystick-thumb';
    this.joystickThumb.style.display = 'none';
    this.joystickZone.appendChild(this.joystickBase);
    this.joystickZone.appendChild(this.joystickThumb);

    this.aimZone = document.createElement('div');
    this.aimZone.className = 'mobile-aim-zone';

    this.fireBtn = document.createElement('div');
    this.fireBtn.className = 'mobile-fire-btn';

    const controls = document.createElement('div');
    controls.className = 'mobile-controls is-active';
    controls.appendChild(this.hint);
    controls.appendChild(this.joystickZone);
    controls.appendChild(this.aimZone);
    controls.appendChild(this.fireBtn);

    this.container.appendChild(controls);

    // Joystick events
    this.joystickZone.addEventListener('touchstart', this.handleJoystickStart, { passive: false });
    this.joystickZone.addEventListener('touchmove', this.handleJoystickMove, { passive: false });
    this.joystickZone.addEventListener('touchend', this.handleJoystickEnd, { passive: false });
    this.joystickZone.addEventListener('touchcancel', this.handleJoystickEnd, { passive: false });

    // Aim events
    this.aimZone.addEventListener('touchstart', this.handleAimStart, { passive: false });
    this.aimZone.addEventListener('touchmove', this.handleAimMove, { passive: false });
    this.aimZone.addEventListener('touchend', this.handleAimEnd, { passive: false });
    this.aimZone.addEventListener('touchcancel', this.handleAimEnd, { passive: false });

    // Fire button events
    this.fireBtn.addEventListener('touchstart', this.handleFireStart, { passive: false });
    this.fireBtn.addEventListener('touchend', this.handleFireEnd, { passive: false });
    this.fireBtn.addEventListener('touchcancel', this.handleFireEnd, { passive: false });

    // Prevent context menu on touch
    controls.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  isActive(): boolean {
    return this.isMobile && !this.disposed;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.joystickZone.removeEventListener('touchstart', this.handleJoystickStart);
    this.joystickZone.removeEventListener('touchmove', this.handleJoystickMove);
    this.joystickZone.removeEventListener('touchend', this.handleJoystickEnd);
    this.joystickZone.removeEventListener('touchcancel', this.handleJoystickEnd);

    this.aimZone.removeEventListener('touchstart', this.handleAimStart);
    this.aimZone.removeEventListener('touchmove', this.handleAimMove);
    this.aimZone.removeEventListener('touchend', this.handleAimEnd);
    this.aimZone.removeEventListener('touchcancel', this.handleAimEnd);

    this.fireBtn.removeEventListener('touchstart', this.handleFireStart);
    this.fireBtn.removeEventListener('touchend', this.handleFireEnd);
    this.fireBtn.removeEventListener('touchcancel', this.handleFireEnd);

    this.hint.remove();
    this.joystickZone.remove();
    this.aimZone.remove();
    this.fireBtn.remove();
  }

  private getTouchPos(event: TouchEvent): { x: number; y: number } | null {
    if (event.touches.length === 0) return null;
    const rect = this.container.getBoundingClientRect();
    const touch = event.touches[0];
    return {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    };
  }

  private handleJoystickStart = (event: TouchEvent): void => {
    event.preventDefault();
    if (this.joystickActive || this.joystickPointerId !== null) return;

    const pos = this.getTouchPos(event);
    if (!pos) return;

    this.joystickActive = true;
    this.joystickPointerId = event.touches[0].identifier;

    // Position joystick base at touch point
    const baseX = Math.min(pos.x, this.container.clientWidth * 0.25);
    const baseY = Math.min(pos.y, this.container.clientHeight * 0.7);
    this.joystickCenter = { x: baseX, y: baseY };
    this.joystickBase.style.left = `${baseX}px`;
    this.joystickBase.style.top = `${baseY}px`;
    this.joystickBase.style.display = 'block';
    this.joystickThumb.style.display = 'block';
    this.joystickThumb.style.left = `${baseX}px`;
    this.joystickThumb.style.top = `${baseY}px`;

    this.callbacks.onMove(0, 0);
  };

  private handleJoystickMove = (event: TouchEvent): void => {
    event.preventDefault();
    if (!this.joystickActive || this.joystickPointerId === null) return;

    const touch = Array.from(event.touches).find((t) => t.identifier === this.joystickPointerId);
    if (!touch) return;

    const rect = this.container.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    const dx = x - this.joystickCenter.x;
    const dy = y - this.joystickCenter.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    const clampedDist = Math.min(distance, this.maxJoystickRadius);
    const angle = Math.atan2(dy, dx);
    const thumbX = this.joystickCenter.x + Math.cos(angle) * clampedDist;
    const thumbY = this.joystickCenter.y + Math.sin(angle) * clampedDist;

    this.joystickThumb.style.left = `${thumbX}px`;
    this.joystickThumb.style.top = `${thumbY}px`;

    // Normalize output: -1 to 1
    const moveX = (Math.cos(angle) * clampedDist) / this.maxJoystickRadius;
    const moveY = (Math.sin(angle) * clampedDist) / this.maxJoystickRadius;

    this.callbacks.onMove(moveX, moveY);
  };

  private handleJoystickEnd = (event: TouchEvent): void => {
    if (!this.joystickActive) return;

    // Check if our pointer ended
    const ourTouch = Array.from(event.touches).find((t) => t.identifier === this.joystickPointerId);
    if (ourTouch) return; // Still tracking

    this.joystickActive = false;
    this.joystickPointerId = null;
    this.joystickBase.style.display = 'none';
    this.joystickThumb.style.display = 'none';
    this.callbacks.onMove(0, 0);
  };

  private handleAimStart = (event: TouchEvent): void => {
    event.preventDefault();
    if (this.aimPointerId !== null) return;

    const touch = event.touches[0];
    this.aimPointerId = touch.identifier;
    this.aimLast = { x: touch.clientX, y: touch.clientY };
  };

  private handleAimMove = (event: TouchEvent): void => {
    event.preventDefault();
    if (this.aimPointerId === null) return;

    const touch = Array.from(event.touches).find((t) => t.identifier === this.aimPointerId);
    if (!touch) return;

    const dx = touch.clientX - this.aimLast.x;
    const dy = touch.clientY - this.aimLast.y;
    this.aimLast = { x: touch.clientX, y: touch.clientY };

    // Sensitivity tuned for touch
    this.callbacks.onAim(dx * 0.5, dy * 0.5);
  };

  private handleAimEnd = (event: TouchEvent): void => {
    const ourTouch = Array.from(event.touches).find((t) => t.identifier === this.aimPointerId);
    if (ourTouch) return;
    this.aimPointerId = null;
  };

  private handleFireStart = (event: TouchEvent): void => {
    event.preventDefault();
    if (this.firePointerId !== null) return;
    this.firePointerId = event.touches[0].identifier;
    this.fireBtn.classList.add('is-pressed');
    this.callbacks.onTriggerDown();
  };

  private handleFireEnd = (event: TouchEvent): void => {
    if (this.firePointerId === null) return;
    const ourTouch = Array.from(event.touches).find((t) => t.identifier === this.firePointerId);
    if (ourTouch) return;
    this.firePointerId = null;
    this.fireBtn.classList.remove('is-pressed');
    this.callbacks.onTriggerUp();
  };
}
