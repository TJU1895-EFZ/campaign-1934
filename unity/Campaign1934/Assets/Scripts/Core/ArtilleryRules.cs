using System;

namespace Campaign1934.Core
{
    public static class ArtilleryRules
    {
        public const float InnerRadius = 2.5f;
        public const float OuterRadius = 6f;
        public const int InnerDamage = 50;
        public const int OuterDamage = 25;
        public const float MinIntervalSeconds = 5f;
        public const float MaxIntervalSeconds = 8f;
        public const float ShellFlightSeconds = 1.25f;
        public const float ShellStartHeight = 34f;

        public static int DamageAt(float distance) => distance <= InnerRadius ? InnerDamage : distance <= OuterRadius ? OuterDamage : 0;
        public static bool IsInBlast(float distance) => distance <= OuterRadius;
        public static float NextInterval(float randomValue) => MinIntervalSeconds + (MaxIntervalSeconds - MinIntervalSeconds) * Clamp01(randomValue);
        public static float ShellHeight(float targetHeight, float elapsedSeconds, float flightSeconds = ShellFlightSeconds)
        {
            float progress = Clamp01(elapsedSeconds / Math.Max(0.001f, flightSeconds));
            float remaining = 1f - progress;
            return targetHeight + ShellStartHeight * remaining * remaining;
        }
        public static ShellPosition ShellPositionAt(float targetX, float targetZ, float targetHeight, float elapsedSeconds, float randomX, float randomZ, float flightSeconds = ShellFlightSeconds)
        {
            float progress = Clamp01(elapsedSeconds / Math.Max(0.001f, flightSeconds));
            float startX = targetX + (Clamp01(randomX) - 0.5f) * 4f;
            float startZ = targetZ + 18f + Clamp01(randomZ) * 12f;
            return new ShellPosition(startX + (targetX - startX) * progress, ShellHeight(targetHeight, elapsedSeconds, flightSeconds), startZ + (targetZ - startZ) * progress);
        }
        private static float Clamp01(float value) => Math.Max(0f, Math.Min(1f, value));
    }
}
