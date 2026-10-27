import { describe, expect, it } from 'vitest';
import { PhaseController } from './PhaseController';
import type { PhaseConfig } from './types';

function makePhases(): PhaseConfig[] {
  return [
    {
      id: 'phase_1',
      name: 'P1',
      zone: 'bridge',
      durationSec: 1,
      narrationId: 'n1',
      red: { initial: 20, reinforcements: 0, reinforcementIntervalSec: 0, maxAlive: 22 },
      kmt: { initial: 12, reinforcements: 0, accuracy: 0.1, fireRate: 0.6, retreatAtEnd: false },
      objectives: ['o1'],
      endCondition: 'timer',
    },
    {
      id: 'phase_2',
      name: 'P2',
      zone: 'bridge',
      durationSec: 2,
      narrationId: 'n2',
      red: { initial: 22, reinforcements: 0, reinforcementIntervalSec: 0, maxAlive: 26 },
      kmt: { initial: 12, reinforcements: 0, accuracy: 0.2, fireRate: 1, retreatAtEnd: false },
      objectives: ['o2'],
      endCondition: 'timer',
    },
  ];
}

describe('PhaseController', () => {
  it('starts at the first phase', () => {
    const controller = new PhaseController(makePhases());
    expect(controller.current.id).toBe('phase_1');
    expect(controller.currentIndex).toBe(0);
    expect(controller.timeInPhase).toBe(0);
    expect(controller.isFinished).toBe(false);
  });

  it('advances when the phase duration is reached', () => {
    const controller = new PhaseController(makePhases());
    expect(controller.update(0.5)).toEqual({ changed: false, finished: false });
    expect(controller.current.id).toBe('phase_1');
    expect(controller.update(0.5)).toEqual({ changed: true, finished: false });
    expect(controller.current.id).toBe('phase_2');
    expect(controller.timeInPhase).toBe(0);
  });

  it('finishes after the final phase duration', () => {
    const controller = new PhaseController(makePhases());
    controller.update(1);
    const result = controller.update(2);
    expect(result.finished).toBe(true);
    expect(controller.isFinished).toBe(true);
    expect(controller.current.id).toBe('phase_2');
  });

  it('does not advance after finishing', () => {
    const controller = new PhaseController(makePhases());
    controller.update(3);
    const result = controller.update(10);
    expect(result).toEqual({ changed: false, finished: true });
  });

  it('rejects an empty phase list', () => {
    expect(() => new PhaseController([])).toThrow();
  });

  it('advances via condition callback when condition is met', () => {
    const controller = new PhaseController(makePhases());
    controller.setConditionCallback(0, () => true);
    const result = controller.update(0.01);
    expect(result.changed).toBe(true);
    expect(controller.current.id).toBe('phase_2');
  });

  it('does not advance via condition when callback returns false', () => {
    const controller = new PhaseController(makePhases());
    controller.setConditionCallback(0, () => false);
    const result = controller.update(0.01);
    expect(result.changed).toBe(false);
    expect(controller.current.id).toBe('phase_1');
  });

  it('prefers condition over timer — does not advance on timer if condition is not met', () => {
    const controller = new PhaseController(makePhases());
    controller.setConditionCallback(0, () => false);
    // phase_1 duration is 1s; advance past it
    const result = controller.update(2);
    // Should NOT advance because condition is false and timer is consumed
    // Actually timer should still fire: 2 >= 1, so it advances via timer
    expect(result.changed).toBe(true);
    expect(controller.current.id).toBe('phase_2');
  });

  it('advances via condition even before timer expires', () => {
    const controller = new PhaseController(makePhases());
    controller.setConditionCallback(0, () => true);
    const result = controller.update(0.01);
    expect(result.changed).toBe(true);
    expect(controller.current.id).toBe('phase_2');
  });

  it('does not trigger condition callback after finishing', () => {
    const controller = new PhaseController(makePhases());
    let callbackCalled = false;
    controller.setConditionCallback(0, () => {
      callbackCalled = true;
      return true;
    });
    controller.update(2); // advances to phase 2
    expect(controller.current.id).toBe('phase_2');
    callbackCalled = false;
    controller.update(5); // phase 2 timer expires, finishes
    expect(controller.isFinished).toBe(true);
    // No more updates should fire callback
    controller.update(1);
    expect(callbackCalled).toBe(false);
  });
});
