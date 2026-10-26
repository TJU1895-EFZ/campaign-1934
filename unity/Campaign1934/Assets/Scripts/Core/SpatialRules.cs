using System;
using System.Collections.Generic;

namespace Campaign1934.Core
{
    public static class SpatialRules
    {
        public const float JungleFrontZ = 34f;
        public const float BridgeFrontZ = -28f;
        public const float JungleMaxDistance = 24f;
        public const float BridgeMaxDistance = 18f;
        public const float StreetMaxDistance = 28f;
        public const float FrontlineReinforceSeconds = 0.45f;
        public const float FrontlineStrikeSeconds = 1.4f;

        public static ColliderBounds ColliderFromCenter(float x, float z, float width, float depth, float height) =>
            new ColliderBounds(x - width / 2f, x + width / 2f, z - depth / 2f, z + depth / 2f, height);

        public static bool PointInCollider(ColliderBounds c, float x, float z, float padding = 0f) =>
            x >= c.MinX - padding && x <= c.MaxX + padding && z >= c.MinZ - padding && z <= c.MaxZ + padding;

        public static bool IsBlockedAt(IEnumerable<ColliderBounds> colliders, float x, float z, float jumpOffset, float padding = 0.3f)
        {
            foreach (ColliderBounds c in colliders)
                if (PointInCollider(c, x, z, padding) && jumpOffset <= c.Height) return true;
            return false;
        }

        public static IReadOnlyList<GroundPoint> CoverPointsAround(ColliderBounds c, float clearance = 1.25f)
        {
            float centerX = (c.MinX + c.MaxX) / 2f;
            float centerZ = (c.MinZ + c.MaxZ) / 2f;
            return new[] { new GroundPoint(c.MinX - clearance, centerZ), new GroundPoint(c.MaxX + clearance, centerZ), new GroundPoint(centerX, c.MinZ - clearance), new GroundPoint(centerX, c.MaxZ + clearance) };
        }

        public static GroundPoint? ChooseSeparatedPoint(IReadOnlyList<GroundPoint> candidates, IReadOnlyList<GroundPoint> occupied, float minimumDistance, int startIndex = 0)
        {
            if (candidates.Count == 0) return null;
            float minimumSquared = minimumDistance * minimumDistance;
            for (int offset = 0; offset < candidates.Count; offset++)
            {
                GroundPoint candidate = candidates[(startIndex + offset) % candidates.Count];
                bool separated = true;
                for (int i = 0; i < occupied.Count; i++)
                {
                    float dx = occupied[i].X - candidate.X;
                    float dz = occupied[i].Z - candidate.Z;
                    if (dx * dx + dz * dz < minimumSquared) { separated = false; break; }
                }
                if (separated) return candidate;
            }
            return null;
        }

        public static bool IsOutOfFrontline(BattleZone zone, float playerZ, float nearestRedDistance)
        {
            if (zone == BattleZone.Jungle) return playerZ < JungleFrontZ || nearestRedDistance > JungleMaxDistance;
            if (zone == BattleZone.Bridge) return playerZ < BridgeFrontZ || nearestRedDistance > BridgeMaxDistance;
            return nearestRedDistance > StreetMaxDistance;
        }

        public static FrontlineEscalation GetFrontlineEscalation(float elapsedSeconds)
        {
            if (elapsedSeconds >= FrontlineStrikeSeconds) return FrontlineEscalation.Strike;
            if (elapsedSeconds >= FrontlineReinforceSeconds) return FrontlineEscalation.Reinforce;
            return FrontlineEscalation.None;
        }
    }
}
