import type { PhaseConfig } from './types';

export interface PhaseUpdate {
  changed: boolean;
  finished: boolean;
}

export class PhaseController {
  private index = 0;
  private elapsed = 0;
  private finishedFlag = false;
  private conditionCallbacks: ((index: number) => boolean)[] = [];

  constructor(private readonly phases: PhaseConfig[]) {
    if (phases.length === 0) {
      throw new Error('PhaseController requires at least one phase');
    }
  }

  get current(): PhaseConfig {
    return this.phases[this.index];
  }

  get currentIndex(): number {
    return this.index;
  }

  get isLast(): boolean {
    return this.index >= this.phases.length - 1;
  }

  get timeInPhase(): number {
    return this.elapsed;
  }

  get isFinished(): boolean {
    return this.finishedFlag;
  }

  setConditionCallback(index: number, callback: (index: number) => boolean): void {
    this.conditionCallbacks[index] = callback;
  }

  update(dt: number): PhaseUpdate {
    if (this.finishedFlag) {
      return { changed: false, finished: true };
    }

    let changed = false;
    this.elapsed += Math.max(0, dt);

    // Check condition-based transition first (when a callback is registered)
    const cb = this.conditionCallbacks[this.index];
    if (cb && cb(this.index)) {
      this.advance();
      changed = true;
    }

    // Fallback: timer-based transition
    while (!this.finishedFlag && this.elapsed >= this.current.durationSec) {
      this.elapsed -= this.current.durationSec;
      if (this.isLast) {
        this.finishedFlag = true;
        break;
      }
      this.index += 1;
      changed = true;
    }

    return { changed, finished: this.finishedFlag };
  }

  private advance(): void {
    if (this.isLast) {
      this.finishedFlag = true;
    } else {
      this.index += 1;
    }
  }
}
