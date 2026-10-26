using System;

namespace Campaign1934.Core
{
    public static class CombatRules
    {
        public static int DamageForHit() => BattleConstants.ShotDamage;
        public static float ApplyDamage(float currentHp, float damage = BattleConstants.ShotDamage) =>
            Math.Max(0f, currentHp - Math.Max(0f, damage));
        public static bool IsDown(float hp) => hp <= 0f;
        public static bool IsCritical(float hp) => hp > 0f && hp <= BattleConstants.CriticalHp;
        public static bool CanDamage(Faction attacker, Faction target) => attacker != target;
        public static bool IsFriendlyFire(Faction attacker, Faction target) => attacker == target;
    }
}
