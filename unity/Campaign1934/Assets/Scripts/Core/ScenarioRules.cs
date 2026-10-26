using System;
using System.Collections.Generic;

namespace Campaign1934.Core
{
    public static class ScenarioRules
    {
        public const int BunkerRoofDefenderCount = 6;
        public const float StagingDurationSeconds = 3f;
        public const float ConvoySpeed = 7f;
        public const float ConvoyExitZ = -116f;
        public static readonly IReadOnlyList<ShellPosition> BunkerRoofDefenderPoints = new[]
        {
            new ShellPosition(-8f, 12.25f, -33.2f), new ShellPosition(-5f, 12.25f, -35.2f),
            new ShellPosition(-2f, 12.25f, -33.4f), new ShellPosition(2f, 12.25f, -33.4f),
            new ShellPosition(5f, 12.25f, -35.2f), new ShellPosition(8f, 12.25f, -33.2f)
        };
        public static float ConvoyPositionZ(float startZ, float elapsedSeconds) => startZ - Math.Max(0f, elapsedSeconds) * ConvoySpeed;
        public static bool HasConvoyExited(float positionZ) => positionZ < ConvoyExitZ;
    }
}
