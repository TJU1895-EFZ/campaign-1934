using System;
using System.Collections.Generic;

namespace Campaign1934.Core
{
    public sealed class PhaseController
    {
        private readonly IReadOnlyList<PhaseConfig> phases;
        private int index;
        private float elapsed;
        private bool finished;

        public PhaseController(IReadOnlyList<PhaseConfig> phases)
        {
            if (phases == null || phases.Count == 0)
                throw new ArgumentException("PhaseController requires at least one phase", nameof(phases));
            this.phases = phases;
        }

        public PhaseConfig Current => phases[index];
        public int CurrentIndex => index;
        public bool IsLast => index >= phases.Count - 1;
        public float TimeInPhase => elapsed;
        public bool IsFinished => finished;

        public PhaseUpdate Update(float deltaSeconds)
        {
            if (finished) return new PhaseUpdate(false, true);
            bool changed = false;
            elapsed += Math.Max(0f, deltaSeconds);
            while (!finished && elapsed >= Current.DurationSeconds)
            {
                elapsed -= Current.DurationSeconds;
                if (IsLast) { finished = true; break; }
                index++;
                changed = true;
            }
            return new PhaseUpdate(changed, finished);
        }

        public PhaseUpdate CompleteCurrent()
        {
            if (finished) return new PhaseUpdate(false, true);
            if (IsLast)
            {
                finished = true;
                return new PhaseUpdate(false, true);
            }
            index++;
            elapsed = 0f;
            return new PhaseUpdate(true, false);
        }
    }
}
