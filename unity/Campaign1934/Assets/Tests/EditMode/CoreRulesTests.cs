using System;
using System.Collections.Generic;
using NUnit.Framework;

namespace Campaign1934.Core.Tests
{
    public sealed class CoreRulesTests
    {
        [Test]
        public void CombatRules_PreserveDamageAndFriendlyFireRules()
        {
            Assert.That(CombatRules.ApplyDamage(100f), Is.EqualTo(75f));
            Assert.That(CombatRules.ApplyDamage(10f, -5f), Is.EqualTo(10f));
            Assert.That(CombatRules.IsCritical(25f), Is.True);
            Assert.That(CombatRules.IsDown(0f), Is.True);
            Assert.That(CombatRules.CanDamage(Faction.Red, Faction.Kmt), Is.True);
            Assert.That(CombatRules.CanDamage(Faction.Red, Faction.Red), Is.False);
        }

        [Test]
        public void PhaseController_CarriesOverflowAcrossPhases()
        {
            var controller = new PhaseController(CreatePhases(2f));
            PhaseUpdate update = controller.Update(2.5f);
            Assert.That(update.Changed, Is.True);
            Assert.That(controller.CurrentIndex, Is.EqualTo(1));
            Assert.That(controller.TimeInPhase, Is.EqualTo(0.5f).Within(0.001f));
        }

        [Test]
        public void PhaseController_CanCompleteAConditionalPhase()
        {
            var controller = new PhaseController(CreatePhases(20f));
            controller.Update(3f);
            PhaseUpdate update = controller.CompleteCurrent();
            Assert.That(update.Changed, Is.True);
            Assert.That(update.Finished, Is.False);
            Assert.That(controller.CurrentIndex, Is.EqualTo(1));
            Assert.That(controller.TimeInPhase, Is.Zero);
        }

        [Test]
        public void Director_IdlePlayerAlwaysReachesRedVictory()
        {
            var callbacks = new Harness();
            var director = new BattleDirector(CreatePhases(1f), callbacks);
            for (int i = 0; i < 20 && !director.IsFinished; i++) director.Update(0.5f);
            Assert.That(director.CurrentResult, Is.EqualTo(BattleResult.RedVictory));
            Assert.That(callbacks.Victories, Is.EqualTo(1));
            Assert.That(callbacks.MaximumAlive, Is.LessThanOrEqualTo(BattleConstants.MaxTotalBots));
        }

        [Test]
        public void Director_PlayerDownDoesNotChangeFixedOutcome()
        {
            var director = new BattleDirector(CreatePhases(0.5f), new Harness());
            for (int i = 0; i < 12; i++) { director.NotifyPlayerDowned(); director.Update(0.25f); }
            Assert.That(director.CurrentResult, Is.EqualTo(BattleResult.RedVictory));
        }

        [Test]
        public void ArtilleryAndAutomaticFire_ClampInputs()
        {
            Assert.That(ArtilleryRules.DamageAt(2.5f), Is.EqualTo(50));
            Assert.That(ArtilleryRules.DamageAt(6f), Is.EqualTo(25));
            Assert.That(ArtilleryRules.DamageAt(6.01f), Is.Zero);
            Assert.That(ArtilleryRules.NextInterval(-10f), Is.EqualTo(5f));
            Assert.That(ArtilleryRules.NextInterval(10f), Is.EqualTo(8f));
            AutomaticFireStep fire = WeaponRules.AdvanceAutomaticFire(0f, 0.12f);
            Assert.That(fire.Shots, Is.EqualTo(3));
        }

        [Test]
        public void SpatialRules_RespectJumpHeightAndFrontlineTiming()
        {
            ColliderBounds wall = SpatialRules.ColliderFromCenter(0f, 0f, 2f, 2f, 1f);
            Assert.That(SpatialRules.IsBlockedAt(new[] { wall }, 0f, 0f, 0.5f), Is.True);
            Assert.That(SpatialRules.IsBlockedAt(new[] { wall }, 0f, 0f, 1.1f), Is.False);
            Assert.That(SpatialRules.GetFrontlineEscalation(0.44f), Is.EqualTo(FrontlineEscalation.None));
            Assert.That(SpatialRules.GetFrontlineEscalation(0.45f), Is.EqualTo(FrontlineEscalation.Reinforce));
            Assert.That(SpatialRules.GetFrontlineEscalation(1.4f), Is.EqualTo(FrontlineEscalation.Strike));
        }

        [Test]
        public void BattleStats_FinishFreezesDuration()
        {
            DateTime now = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
            var stats = new BattleStats(() => now);
            stats.RecordShot(); stats.RecordShot(); stats.RecordHit();
            now = now.AddSeconds(4.6); stats.Finish(); now = now.AddSeconds(30);
            Assert.That(stats.Accuracy, Is.EqualTo(50));
            Assert.That(stats.DurationSeconds, Is.EqualTo(5));
        }

        private static IReadOnlyList<PhaseConfig> CreatePhases(float duration)
        {
            var phases = new List<PhaseConfig>();
            for (int i = 0; i < 4; i++)
            {
                phases.Add(new PhaseConfig
                {
                    Id = (PhaseId)i, Name = "Phase " + (i + 1), Zone = i == 0 ? BattleZone.Jungle : i < 3 ? BattleZone.Bridge : BattleZone.Street,
                    DurationSeconds = duration, Objectives = new List<string> { "Advance" }, EndCondition = PhaseEndCondition.Timer,
                    Red = new ForceConfig { Initial = 16, Reinforcements = 4, ReinforcementIntervalSeconds = 0.5f, MaxAlive = 26 },
                    Kmt = new ForceConfig { Initial = 6, Reinforcements = 8, Accuracy = 0.2f, FireRate = 1f, RetreatAtEnd = i == 3 }
                });
            }
            return phases;
        }

        private sealed class Harness : IBattleDirectorCallbacks
        {
            private int red, kmt;
            public int Victories { get; private set; }
            public int MaximumAlive { get; private set; }
            public bool Spawn(Faction faction, int count, bool key) { Add(faction, count); return true; }
            public int SpawnSquad(Faction faction, int count) { Add(faction, count); return count; }
            public void OnPhase(PhaseConfig phase, int index) { }
            public void OnModifiers(float accuracy, float fireRate) { }
            public void OnRetreatKmt() { }
            public void OnVictory() => Victories++;
            private void Add(Faction faction, int count)
            {
                if (faction == Faction.Red) red += count; else kmt += count;
                MaximumAlive = Math.Max(MaximumAlive, red + kmt);
            }
        }
    }
}
