using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using System.Linq;

namespace Campaign1934.Runtime.Tests
{
    public sealed class BattleRuntimeSmokeTests
    {
        [UnityTest]
        public IEnumerator BootstrapSceneCreatesRuntimeAndKeepsBotBudget()
        {
            SceneManager.LoadScene("Bootstrap");
            yield return null;
            yield return null;
            Assert.That(Object.FindObjectOfType<BattleRuntime>(), Is.Not.Null);
            Assert.That(Object.FindObjectsOfType<BotAgent>().Length, Is.InRange(15, 20));
            SoldierAvatar[] soldiers = Object.FindObjectsOfType<SoldierAvatar>();
            Assert.That(soldiers.Length, Is.InRange(15, 20));
            Assert.That(soldiers.All(soldier => soldier.UsesRiggedModel), Is.True, "Every bot should use an imported rigged soldier model.");
            ProjectionScreen[] screens = Object.FindObjectsOfType<ProjectionScreen>();
            Assert.That(screens.Length, Is.EqualTo(3));
            Assert.That(screens.Select(screen => screen.VideoFile).Distinct().Count(), Is.EqualTo(3));
        }
    }
}
