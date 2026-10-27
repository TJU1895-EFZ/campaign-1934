export const ARTILLERY_INNER_RADIUS = 2.5;
export const ARTILLERY_OUTER_RADIUS = 6;
export const ARTILLERY_INNER_DAMAGE = 50;
export const ARTILLERY_OUTER_DAMAGE = 25;
export const ARTILLERY_MIN_INTERVAL_SECONDS = 5;
export const ARTILLERY_MAX_INTERVAL_SECONDS = 8;
export const ARTILLERY_SHELL_FLIGHT_SECONDS = 1.25;
export const ARTILLERY_SHELL_START_HEIGHT = 34;

export function artilleryDamageAt(distance: number): number {
  if (distance <= ARTILLERY_INNER_RADIUS) return ARTILLERY_INNER_DAMAGE;
  if (distance <= ARTILLERY_OUTER_RADIUS) return ARTILLERY_OUTER_DAMAGE;
  return 0;
}

export function isInArtilleryBlast(distance: number): boolean {
  return distance <= ARTILLERY_OUTER_RADIUS;
}

export function nextArtilleryInterval(randomValue: number): number {
  const t = Math.min(1, Math.max(0, randomValue));
  return (
    ARTILLERY_MIN_INTERVAL_SECONDS +
    (ARTILLERY_MAX_INTERVAL_SECONDS - ARTILLERY_MIN_INTERVAL_SECONDS) * t
  );
}

export function artilleryShellHeight(
  targetHeight: number,
  elapsedSeconds: number,
  flightSeconds = ARTILLERY_SHELL_FLIGHT_SECONDS,
): number {
  const progress = Math.min(1, Math.max(0, elapsedSeconds / Math.max(0.001, flightSeconds)));
  const remaining = 1 - progress;
  return targetHeight + ARTILLERY_SHELL_START_HEIGHT * remaining * remaining;
}

export function artilleryShellPosition(
  targetX: number,
  targetZ: number,
  targetHeight: number,
  elapsedSeconds: number,
  flightSeconds = ARTILLERY_SHELL_FLIGHT_SECONDS,
): { x: number; y: number; z: number } {
  const progress = Math.min(1, Math.max(0, elapsedSeconds / Math.max(0.001, flightSeconds)));
  const y = artilleryShellHeight(targetHeight, elapsedSeconds, flightSeconds);
  // Arc from the KMT side (positive Z, far bank) down to the target
  const startX = targetX + (Math.random() - 0.5) * 4;
  const startZ = targetZ + 18 + Math.random() * 12; // 18–30 meters behind target, from KMT direction
  return {
    x: startX + (targetX - startX) * progress,
    y,
    z: startZ + (targetZ - startZ) * progress,
  };
}
