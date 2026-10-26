using System;

namespace Campaign1934.Core
{
    public readonly struct BattleStatsData
    {
        public BattleStatsData(int shots, int hits, int kills, int deaths, int durationSeconds)
        { Shots = shots; Hits = hits; Kills = kills; Deaths = deaths; DurationSeconds = durationSeconds; }
        public int Shots { get; }
        public int Hits { get; }
        public int Kills { get; }
        public int Deaths { get; }
        public int DurationSeconds { get; }
    }

    public sealed class BattleStats
    {
        private readonly Func<DateTime> now;
        private readonly DateTime startedAt;
        private DateTime? endedAt;

        public BattleStats(Func<DateTime> clock = null)
        {
            now = clock ?? (() => DateTime.UtcNow);
            startedAt = now();
        }

        public int Shots { get; private set; }
        public int Hits { get; private set; }
        public int Kills { get; private set; }
        public int Deaths { get; private set; }
        public int Accuracy => Shots == 0 ? 0 : (int)Math.Round(Hits * 100d / Shots, MidpointRounding.AwayFromZero);
        public int DurationSeconds => Math.Max(0, (int)Math.Round(((endedAt ?? now()) - startedAt).TotalSeconds, MidpointRounding.AwayFromZero));
        public void RecordShot() => Shots++;
        public void RecordHit() => Hits++;
        public void RecordKill() => Kills++;
        public void RecordDeath() => Deaths++;
        public void Finish() { if (!endedAt.HasValue) endedAt = now(); }
        public BattleStatsData ToData() => new BattleStatsData(Shots, Hits, Kills, Deaths, DurationSeconds);
    }
}
