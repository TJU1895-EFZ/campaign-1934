using System;

namespace Campaign1934.Core
{
    public static class WeaponRules
    {
        public const int MachineGunCount = 3;
        public const int MachineGunDamage = 20;
        public const float MachineGunFireIntervalSeconds = 0.06f;
        public static AutomaticFireStep AdvanceAutomaticFire(float timer, float deltaSeconds)
        {
            float next = Math.Max(0f, timer) - Math.Max(0f, deltaSeconds);
            int shots = 0;
            while (next <= 0f) { shots++; next += MachineGunFireIntervalSeconds; }
            return new AutomaticFireStep(shots, next);
        }
    }
}
