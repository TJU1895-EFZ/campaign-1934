import { describe, expect, it } from 'vitest';
import {
  ARTILLERY_MAX_INTERVAL_SECONDS,
  ARTILLERY_MIN_INTERVAL_SECONDS,
  ARTILLERY_SHELL_FLIGHT_SECONDS,
  artilleryDamageAt,
  artilleryShellHeight,
  artilleryShellPosition,
  isInArtilleryBlast,
  nextArtilleryInterval,
} from './artillery';

describe('artillery', () => {
  it('deals heavy damage at the impact point and lighter damage nearby', () => {
    expect(artilleryDamageAt(0)).toBe(50);
    expect(artilleryDamageAt(2.5)).toBe(50);
    expect(artilleryDamageAt(4)).toBe(25);
    expect(artilleryDamageAt(6)).toBe(25);
    expect(artilleryDamageAt(6.1)).toBe(0);
  });

  it('reports blast membership', () => {
    expect(isInArtilleryBlast(5.9)).toBe(true);
    expect(isInArtilleryBlast(6)).toBe(true);
    expect(isInArtilleryBlast(7)).toBe(false);
  });

  it('schedules frequent barrages inside the configured window', () => {
    expect(nextArtilleryInterval(-1)).toBe(ARTILLERY_MIN_INTERVAL_SECONDS);
    expect(nextArtilleryInterval(0.5)).toBe(6.5);
    expect(nextArtilleryInterval(2)).toBe(ARTILLERY_MAX_INTERVAL_SECONDS);
  });

  it('moves a shell down from the sky before impact', () => {
    const start = artilleryShellHeight(8, 0);
    const middle = artilleryShellHeight(8, ARTILLERY_SHELL_FLIGHT_SECONDS / 2);
    const impact = artilleryShellHeight(8, ARTILLERY_SHELL_FLIGHT_SECONDS);

    expect(start).toBe(42);
    expect(middle).toBeGreaterThan(impact);
    expect(middle).toBeLessThan(start);
    expect(impact).toBe(8);
  });

  it('flies in from the Nationalist side and lands on the target', () => {
    const targetZ = -38;
    const start = artilleryShellPosition(0, targetZ, 8, 0);
    const impact = artilleryShellPosition(
      0,
      targetZ,
      8,
      ARTILLERY_SHELL_FLIGHT_SECONDS,
    );

    expect(start.z).toBeLessThan(targetZ - 17);
    expect(impact.z).toBeCloseTo(targetZ, 5);
    expect(impact.y).toBe(8);
  });
});
