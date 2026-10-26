using System;
using System.Collections.Generic;

namespace Campaign1934.Core
{
    public enum Faction { Red, Kmt }
    public enum BattleResult { RedVictory }
    public enum PhaseId { Phase1, Phase2, Phase3, Phase4 }
    public enum BattleZone { Jungle, Bridge, Street }
    public enum PhaseEndCondition { Timer, RedAtBridgehead, KmtRetreat }
    public enum FrontlineEscalation { None, Reinforce, Strike }

    [Serializable]
    public sealed class ForceConfig
    {
        public int Initial;
        public int Reinforcements;
        public float ReinforcementIntervalSeconds;
        public int MaxAlive;
        public float Accuracy;
        public float FireRate;
        public bool RetreatAtEnd;
    }

    [Serializable]
    public sealed class PhaseConfig
    {
        public PhaseId Id;
        public string Name = string.Empty;
        public BattleZone Zone;
        public float DurationSeconds;
        public string NarrationId = string.Empty;
        public ForceConfig Red = new ForceConfig();
        public ForceConfig Kmt = new ForceConfig();
        public List<string> Objectives = new List<string>();
        public PhaseEndCondition EndCondition;
    }

    public readonly struct PhaseUpdate
    {
        public PhaseUpdate(bool changed, bool finished)
        {
            Changed = changed;
            Finished = finished;
        }

        public bool Changed { get; }
        public bool Finished { get; }
    }

    public readonly struct GroundPoint
    {
        public GroundPoint(float x, float z) { X = x; Z = z; }
        public float X { get; }
        public float Z { get; }
    }

    public readonly struct ColliderBounds
    {
        public ColliderBounds(float minX, float maxX, float minZ, float maxZ, float height)
        {
            MinX = minX; MaxX = maxX; MinZ = minZ; MaxZ = maxZ; Height = height;
        }

        public float MinX { get; }
        public float MaxX { get; }
        public float MinZ { get; }
        public float MaxZ { get; }
        public float Height { get; }
    }

    public readonly struct AutomaticFireStep
    {
        public AutomaticFireStep(int shots, float timer) { Shots = shots; Timer = timer; }
        public int Shots { get; }
        public float Timer { get; }
    }

    public readonly struct ShellPosition
    {
        public ShellPosition(float x, float y, float z) { X = x; Y = y; Z = z; }
        public float X { get; }
        public float Y { get; }
        public float Z { get; }
    }

    public sealed class DirectorSnapshot
    {
        public int PhaseIndex;
        public string PhaseName = string.Empty;
        public float PhaseElapsed;
        public float PhaseDuration;
        public float TotalElapsed;
        public int RedAlive;
        public int KmtAlive;
        public int RedPending;
        public int KmtPending;
        public BattleResult? Result;
        public float Accuracy;
        public float FireRate;
        public string Objective = string.Empty;
    }
}
