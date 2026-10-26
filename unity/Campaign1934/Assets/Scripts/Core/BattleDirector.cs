using System;
using System.Collections.Generic;

namespace Campaign1934.Core
{
    public interface IBattleDirectorCallbacks
    {
        bool Spawn(Faction faction, int count, bool key);
        int SpawnSquad(Faction faction, int count);
        void OnPhase(PhaseConfig phase, int index);
        void OnModifiers(float accuracy, float fireRate);
        void OnRetreatKmt();
        void OnVictory();
    }

    public sealed class BattleDirector
    {
        private readonly IReadOnlyList<PhaseConfig> phases;
        private readonly IBattleDirectorCallbacks callbacks;
        private readonly PhaseController phaseController;
        private int redAlive, kmtAlive, redPending, kmtPending, keyAlive;
        private BattleResult? result;
        private float totalElapsed, accuracy, fireRate;
        private int redReinforcementsLeft, kmtReinforcementsLeft;
        private float reinforcementTimer, kmtReinforcementTimer, emergencyCooldown, keyBackfillCooldown, sustainRedTimer, sustainKmtTimer;
        private bool keyBackfillNeeded, retreatTriggered;

        public BattleDirector(IReadOnlyList<PhaseConfig> phases, IBattleDirectorCallbacks callbacks)
        {
            if (phases == null || phases.Count == 0) throw new ArgumentException("BattleDirector requires at least one phase", nameof(phases));
            this.phases = phases;
            this.callbacks = callbacks ?? throw new ArgumentNullException(nameof(callbacks));
            phaseController = new PhaseController(phases);
            EnterPhase(0);
        }

        public BattleResult? CurrentResult => result;
        public int PhaseIndex => phaseController.CurrentIndex;
        public bool IsFinished => result.HasValue;
        public DirectorSnapshot Snapshot => new DirectorSnapshot
        {
            PhaseIndex = phaseController.CurrentIndex, PhaseName = phaseController.Current.Name,
            PhaseElapsed = phaseController.TimeInPhase, PhaseDuration = phaseController.Current.DurationSeconds,
            TotalElapsed = totalElapsed, RedAlive = redAlive, KmtAlive = kmtAlive,
            RedPending = redPending, KmtPending = kmtPending, Result = result,
            Accuracy = accuracy, FireRate = fireRate,
            Objective = string.Join(" · ", phaseController.Current.Objectives)
        };

        public void Update(float deltaSeconds)
        {
            if (result.HasValue) return;
            float dt = Math.Max(0f, deltaSeconds);
            totalElapsed += dt;
            emergencyCooldown = Math.Max(0f, emergencyCooldown - dt);
            keyBackfillCooldown = Math.Max(0f, keyBackfillCooldown - dt);
            sustainRedTimer = Math.Max(0f, sustainRedTimer - dt);
            sustainKmtTimer = Math.Max(0f, sustainKmtTimer - dt);
            PhaseUpdate update = phaseController.Update(dt);
            if (update.Finished) { TriggerVictory(); return; }
            if (update.Changed) EnterPhase(phaseController.CurrentIndex);
            UpdateReinforcements(dt);
            EnforceInvariants();
            MaintainBattlefield();
            MaybeTriggerRetreat();
            FlushPending();
        }

        public void NotifyDowned(Faction faction, bool isKey = false)
        {
            if (result.HasValue) return;
            if (faction == Faction.Red)
            {
                redAlive = Math.Max(0, redAlive - 1);
                if (isKey) { keyAlive = Math.Max(0, keyAlive - 1); keyBackfillNeeded = true; keyBackfillCooldown = 0.5f; }
                if (keyAlive < 2) keyBackfillNeeded = true;
            }
            else kmtAlive = Math.Max(0, kmtAlive - 1);
            FlushPending();
        }

        public void NotifyPlayerDowned() { }

        public int SpawnRedSquad(int count = 8)
        {
            PhaseConfig phase = phaseController.Current;
            int available = Math.Max(0, Math.Min(count, Math.Min(phase.Red.MaxAlive - redAlive, Math.Min(BattleConstants.MaxRedBots - redAlive, BattleConstants.MaxTotalBots - redAlive - kmtAlive))));
            if (available <= 0) { AddPending(Faction.Red, count); return 0; }
            int spawned = callbacks.SpawnSquad(Faction.Red, available);
            redAlive += spawned;
            if (spawned < count) AddPending(Faction.Red, count - spawned);
            return spawned;
        }

        public int SpawnKmtInterceptionTeam()
        {
            if (result.HasValue || retreatTriggered) return 0;
            int count = BattleConstants.KmtTeamSize;
            int capacity = Math.Min(BattleConstants.MaxKmtBots - kmtAlive, Math.Min(BattleConstants.MaxTotalBots - redAlive - kmtAlive, Math.Max(0, redAlive - kmtAlive - 2)));
            if (capacity < count) return 0;
            int spawned = callbacks.SpawnSquad(Faction.Kmt, count);
            kmtAlive += spawned;
            return spawned;
        }

        public void DebugSkipPhase()
        {
            if (result.HasValue) return;
            Update(Math.Max(0f, phaseController.Current.DurationSeconds - phaseController.TimeInPhase) + 0.001f);
        }

        public void CompleteCurrentPhase()
        {
            if (result.HasValue) return;
            PhaseUpdate update = phaseController.CompleteCurrent();
            if (update.Finished) { TriggerVictory(); return; }
            if (update.Changed) EnterPhase(phaseController.CurrentIndex);
        }

        private void EnterPhase(int index)
        {
            PhaseConfig phase = phases[index];
            redReinforcementsLeft = phase.Red.Reinforcements;
            kmtReinforcementsLeft = phase.Kmt.Reinforcements;
            reinforcementTimer = kmtReinforcementTimer = emergencyCooldown = keyBackfillCooldown = sustainRedTimer = sustainKmtTimer = 0f;
            keyBackfillNeeded = retreatTriggered = false;
            accuracy = phase.Kmt.Accuracy; fireRate = phase.Kmt.FireRate;
            callbacks.OnModifiers(accuracy, fireRate); callbacks.OnPhase(phase, index);
            SpawnRedSquad(Math.Max(0, phase.Red.Initial - redAlive));
            SpawnTo(Faction.Kmt, Math.Max(0, phase.Kmt.Initial - kmtAlive));
        }

        private void UpdateReinforcements(float dt)
        {
            PhaseConfig phase = phaseController.Current;
            if (redReinforcementsLeft > 0 && phase.Red.ReinforcementIntervalSeconds > 0f)
            {
                reinforcementTimer += dt;
                while (redReinforcementsLeft > 0 && reinforcementTimer >= phase.Red.ReinforcementIntervalSeconds)
                {
                    reinforcementTimer -= phase.Red.ReinforcementIntervalSeconds;
                    int spawned = SpawnRedSquad(Math.Min(4, redReinforcementsLeft));
                    if (spawned == 0) break;
                    redReinforcementsLeft -= spawned;
                }
            }
            if (kmtReinforcementsLeft > 0)
            {
                kmtReinforcementTimer += dt;
                if (kmtReinforcementTimer >= BattleConstants.KmtReinforcementIntervalSeconds && kmtAlive <= BattleConstants.KmtReinforcementTrigger)
                {
                    kmtReinforcementTimer = 0f;
                    if (SpawnKmtTeams() > 0) kmtReinforcementsLeft = 0;
                }
            }
            if (keyBackfillNeeded && keyBackfillCooldown <= 0f && SpawnTo(Faction.Red, 1) > 0)
            { keyBackfillNeeded = false; keyBackfillCooldown = 2f; }
        }

        private void EnforceInvariants()
        {
            if (phaseController.CurrentIndex >= 1 && redAlive < kmtAlive + 2 && emergencyCooldown <= 0f)
            {
                int spawned = SpawnRedSquad(4); emergencyCooldown = BattleConstants.DirectorEmergencyCooldownSeconds;
                if (spawned == 0) { accuracy = Math.Max(0.05f, accuracy * 0.85f); callbacks.OnModifiers(accuracy, fireRate); }
            }
            if (redAlive == 0)
            { SpawnRedSquad(6); accuracy = Math.Max(0.02f, accuracy * 0.5f); callbacks.OnModifiers(accuracy, fireRate); }
        }

        private void MaintainBattlefield()
        {
            PhaseConfig phase = phaseController.Current;
            int redFloor = Math.Max(12, phase.Red.Initial - 4);
            if (sustainRedTimer <= 0f && redAlive < redFloor)
            { int spawned = SpawnRedSquad(8); sustainRedTimer = spawned > 0 ? 6f : 4f; }
            if (!retreatTriggered && phase.Kmt.Reinforcements > 0 && sustainKmtTimer <= 0f && kmtAlive <= BattleConstants.KmtReinforcementTrigger)
            { int spawned = SpawnKmtTeams(); sustainKmtTimer = spawned > 0 ? 8f : 3f; }
        }

        private void MaybeTriggerRetreat()
        {
            PhaseConfig phase = phaseController.Current;
            if (!phase.Kmt.RetreatAtEnd || retreatTriggered || phaseController.TimeInPhase < phase.DurationSeconds - BattleConstants.FinalRetreatSeconds) return;
            retreatTriggered = true; accuracy = Math.Min(accuracy, 0.05f);
            callbacks.OnModifiers(accuracy, fireRate); callbacks.OnRetreatKmt();
        }

        private void TriggerVictory()
        {
            if (result.HasValue) return;
            result = BattleResult.RedVictory; accuracy = fireRate = 0f;
            callbacks.OnModifiers(0f, 0f); callbacks.OnRetreatKmt(); callbacks.OnVictory();
        }

        private bool CanSpawn(Faction faction)
        {
            if (redAlive + kmtAlive >= BattleConstants.MaxTotalBots) return false;
            return faction == Faction.Red ? redAlive < BattleConstants.MaxRedBots && redAlive < phaseController.Current.Red.MaxAlive : kmtAlive < BattleConstants.MaxKmtBots;
        }

        private int SpawnKmtTeams()
        {
            int count = BattleConstants.KmtTeamSize * BattleConstants.KmtReinforcementTeams;
            int capacity = Math.Min(BattleConstants.MaxKmtBots - kmtAlive, Math.Min(BattleConstants.MaxTotalBots - redAlive - kmtAlive, Math.Max(0, redAlive - kmtAlive - 2)));
            if (capacity < count) return 0;
            int spawned = callbacks.SpawnSquad(Faction.Kmt, count); kmtAlive += spawned; return spawned;
        }

        private int SpawnTo(Faction faction, int count)
        {
            int spawned = 0;
            for (int i = 0; i < count; i++)
            {
                if (!CanSpawn(faction)) { AddPending(faction, count - i); break; }
                bool isKey = faction == Faction.Red && keyAlive < BattleConstants.KeyAssaultCount;
                if (!callbacks.Spawn(faction, 1, isKey)) { AddPending(faction, count - i); break; }
                if (faction == Faction.Red) { redAlive++; if (isKey) keyAlive++; } else kmtAlive++;
                spawned++;
            }
            return spawned;
        }

        private void FlushPending()
        {
            int guard = 0;
            while (redPending > 0 && CanSpawn(Faction.Red) && guard < 4)
            {
                bool key = keyAlive < BattleConstants.KeyAssaultCount;
                if (!callbacks.Spawn(Faction.Red, 1, key)) break;
                redPending--; redAlive++; if (key) keyAlive++; guard++;
            }
            guard = 0;
            while (kmtPending > 0 && CanSpawn(Faction.Kmt) && guard < 4)
            {
                if (!callbacks.Spawn(Faction.Kmt, 1, false)) break;
                kmtPending--; kmtAlive++; guard++;
            }
        }

        private void AddPending(Faction faction, int count)
        { if (count <= 0) return; if (faction == Faction.Red) redPending += count; else kmtPending += count; }
    }
}
