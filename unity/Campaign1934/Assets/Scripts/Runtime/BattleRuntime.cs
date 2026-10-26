using System.Collections;
using System.Collections.Generic;
using Campaign1934.Core;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.UI;
using System.Runtime.InteropServices;

namespace Campaign1934.Runtime
{
    public sealed class BattleRuntime : MonoBehaviour, IBattleDirectorCallbacks
    {
        private const int RuntimeBotLimit = 20;
        private const int BridgeRedLimit = 5;
        private const int AssaultGroupSize = 3;
        private const float AssaultGroupInterval = 6f;
        private readonly List<BotAgent> bots = new List<BotAgent>();
        private readonly List<ProjectionScreen> screens = new List<ProjectionScreen>();
        private BattleDirector director;
        private Material redMaterial, kmtMaterial, groundMaterial, metalMaterial, woodMaterial, riverMaterial, foliageMaterial;
        private Text statusText;
        private Text titleText;
        private CanvasGroup transitionOverlay;
        private AppAudioManager audioManager;
        private FirstPersonController playerController;
        private int phaseIndex = -1;
        private float cinematicTimer;
        private bool battleStarted;
        private float jungleConditionTimer;
        private float setbackTimer = 12f;
        private float combatTimer = 3f;
        private int playerShots, playerHits, playerKills;
        private float smoothedFps = 60f;

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] private static extern void Campaign1934Notify(string eventName);
#endif

        private void Awake()
        {
            Application.targetFrameRate = 60;
            BuildMaterials();
            BuildEnvironment();
            BuildUi();
            playerController = Camera.main.gameObject.AddComponent<FirstPersonController>();
            playerController.enabled = false;
            audioManager = new GameObject("App Audio Manager").AddComponent<AppAudioManager>();
            director = new BattleDirector(CreatePhases(), this);
            titleText.text = "飞夺泸定桥 · 第一人称战役模拟\n点击或按任意键进入体验";
        }

        private void Update()
        {
            if (!battleStarted)
            {
                if ((Keyboard.current != null && Keyboard.current.anyKey.wasPressedThisFrame) || (Mouse.current != null && Mouse.current.leftButton.wasPressedThisFrame))
                { battleStarted = true; audioManager.EnterBattle(); titleText.gameObject.SetActive(false); playerController.enabled = true; }
                return;
            }

            if (cinematicTimer > 0f) cinematicTimer -= Time.deltaTime;
            smoothedFps = Mathf.Lerp(smoothedFps, 1f / Mathf.Max(0.001f, Time.unscaledDeltaTime), 0.05f);
            director.Update(Time.deltaTime);
            SimulateSquadCombat();
            UpdatePhaseConditions();
            UpdateBridgeSetbacks();
            UpdateBotDestinations();
            DirectorSnapshot snapshot = director.Snapshot;
            statusText.text = $"{snapshot.PhaseName}\n任务：{snapshot.Objective}\n红军 {snapshot.RedAlive}  守军 {snapshot.KmtAlive}  FPS {smoothedFps:0}\n{(cinematicTimer > 0f ? "先锋突击队正冲入碉堡……" : "WASD 移动 · 鼠标观察 · 点击射击")}";
            if (Mouse.current != null && Mouse.current.leftButton.wasPressedThisFrame) FirePlayerWeapon();
        }

        public bool Spawn(Faction faction, int count, bool key)
        {
            if (bots.Count >= RuntimeBotLimit) return false;
            CreateBot(faction, key, bots.Count);
            return true;
        }

        public int SpawnSquad(Faction faction, int count)
        {
            int spawned = 0;
            while (spawned < count && bots.Count < RuntimeBotLimit) { CreateBot(faction, faction == Faction.Red && spawned < 2, bots.Count); spawned++; }
            return spawned;
        }

        public void OnPhase(PhaseConfig phase, int index)
        {
            phaseIndex = index;
            for (int i = 0; i < screens.Count; i++) screens[i].SetActive(i == (index == 0 ? 0 : index < 3 ? 1 : 2));
            if (index == 1 || index == 2) audioManager?.PlayCharge();
            if (index == 3)
            {
                cinematicTimer = 8f;
                StartCoroutine(PlayStreetTransition());
            }
        }
        public void OnModifiers(float accuracy, float fireRate) { }
        public void OnRetreatKmt() { }
        public void OnVictory()
        {
            titleText.gameObject.SetActive(true); titleText.text = "红军胜利\n战役模拟结束";
#if UNITY_WEBGL && !UNITY_EDITOR
            Campaign1934Notify("victory");
#endif
        }

        private void UpdatePhaseConditions()
        {
            if (phaseIndex != 0) return;
            bool redAtBridgehead = false;
            for (int i = 0; i < bots.Count; i++)
                if (bots[i] != null && bots[i].Faction == Faction.Red && bots[i].transform.position.z <= 22f) { redAtBridgehead = true; break; }
            jungleConditionTimer = redAtBridgehead && director.Snapshot.KmtAlive <= 1 ? jungleConditionTimer + Time.deltaTime : 0f;
            if (jungleConditionTimer >= 2f) director.CompleteCurrentPhase();
        }

        private void FirePlayerWeapon()
        {
            playerShots++;
            audioManager.PlayWeapon();
            RaycastHit hit;
            if (!Physics.Raycast(Camera.main.transform.position, Camera.main.transform.forward, out hit, 120f)) return;
            BotAgent bot = hit.collider.GetComponentInParent<BotAgent>();
            if (bot == null || bot.Faction != Faction.Kmt) return;
            playerHits++; playerKills++;
            director.NotifyDowned(Faction.Kmt, false);
            bots.Remove(bot);
            Destroy(bot.gameObject);
        }

        private void SimulateSquadCombat()
        {
            if (director == null || director.IsFinished) return;
            combatTimer -= Time.deltaTime;
            if (combatTimer > 0f) return;
            combatTimer = phaseIndex == 0 ? 3f : 4.5f;
            DownFirst(Faction.Kmt);
            if (phaseIndex > 0 && Random.value < 0.35f) DownFirst(Faction.Red);
        }

        private void DownFirst(Faction faction)
        {
            for (int i = bots.Count - 1; i >= 0; i--)
            {
                BotAgent bot = bots[i];
                if (bot == null || bot.Faction != faction) continue;
                director.NotifyDowned(faction, bot.IsKey);
                bots.RemoveAt(i);
                Destroy(bot.gameObject);
                return;
            }
        }

        private void UpdateBridgeSetbacks()
        {
            if (phaseIndex < 1 || phaseIndex > 2) return;
            setbackTimer -= Time.deltaTime;
            if (setbackTimer > 0f) return;
            setbackTimer = 12f;
            for (int i = 0; i < bots.Count; i++)
            {
                BotAgent bot = bots[i];
                if (bot == null || bot.Faction != Faction.Red || !bot.IsOnBridge) continue;
                director.NotifyDowned(Faction.Red, bot.IsKey);
                bots.RemoveAt(i);
                Destroy(bot.gameObject);
                audioManager.PlaySpatialExplosion(new Vector3(0f, 1f, -10f));
                break;
            }
        }

        private void CreateBot(Faction faction, bool key, int index)
        {
            GameObject bot = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            bot.name = (faction == Faction.Red ? "红军" : "守军") + " Bot " + index;
            bot.transform.position = faction == Faction.Red ? new Vector3(-7f + index % 7 * 2f, 1f, 38f + index / 7 * 3f) : new Vector3(-6f + index % 6 * 2.4f, 1f, 14f - index / 6 * 5f);
            BotAgent agent = bot.AddComponent<BotAgent>();
            agent.Initialize(faction, key, faction == Faction.Red ? redMaterial : kmtMaterial, index);
            bots.Add(agent);
        }

        private void UpdateBotDestinations()
        {
            int bridgeRed = 0;
            int redOrdinal = 0;
            int activeWave = phaseIndex < 1 ? 0 : Mathf.FloorToInt(director.Snapshot.PhaseElapsed / AssaultGroupInterval) % 4;
            for (int i = 0; i < bots.Count; i++)
            {
                BotAgent bot = bots[i];
                if (bot == null) continue;
                if (bot.Faction == Faction.Kmt)
                { bot.SetDestination(new Vector3(bot.transform.position.x, 1f, phaseIndex < 3 ? -26f : -82f)); continue; }

                int formationIndex = redOrdinal++;
                Vector3 target;
                if (phaseIndex == 0) { bot.SetOffBridge(); target = new Vector3(-6f + i % 7 * 2f, 1f, 20f); }
                else if (phaseIndex < 3)
                {
                    int wave = formationIndex / AssaultGroupSize;
                    if (wave == activeWave && bridgeRed < BridgeRedLimit)
                    { bridgeRed++; bot.SetBridgePosture(formationIndex); target = new Vector3(-2.4f + bridgeRed * 0.8f, 1f, -34f); }
                    else { bot.SetOffBridge(3.2f); target = new Vector3(-2.4f + formationIndex % AssaultGroupSize * 2.4f, 1f, 12f + wave * 2.2f); }
                }
                else
                {
                    bot.SetOffBridge(3.4f);
                    bool isVanguard = cinematicTimer > 0f && formationIndex < 3;
                    target = isVanguard ? new Vector3(-2f + formationIndex * 2f, 1f, -47f) : new Vector3(-10f + i % 8 * 2.5f, 1f, -88f);
                }
                bot.SetDestination(target);
            }
        }

        private IReadOnlyList<PhaseConfig> CreatePhases() => new[]
        {
            Phase(PhaseId.Phase1, "丛林接敌", BattleZone.Jungle, 90f, 12, 6, false, "清除丛林守军并抵达桥头", PhaseEndCondition.RedAtBridgehead),
            Phase(PhaseId.Phase2, "第一波突击受挫", BattleZone.Bridge, 70f, 12, 6, false, "三人编组冲击铁索桥并保存突击力量", PhaseEndCondition.Timer),
            Phase(PhaseId.Phase3, "第二波突击", BattleZone.Bridge, 70f, 14, 6, false, "提速冲锋，压制碉堡并突破桥头", PhaseEndCondition.Timer),
            Phase(PhaseId.Phase4, "街巷肃清", BattleZone.Street, 70f, 14, 6, true, "跟随主力肃清街巷", PhaseEndCondition.KmtRetreat)
        };

        private static PhaseConfig Phase(PhaseId id, string name, BattleZone zone, float duration, int red, int kmt, bool retreat, string objective, PhaseEndCondition end) => new PhaseConfig
        {
            Id = id, Name = name, Zone = zone, DurationSeconds = duration, NarrationId = id.ToString(), Objectives = new List<string> { objective }, EndCondition = end,
            Red = new ForceConfig { Initial = red, Reinforcements = 4, ReinforcementIntervalSeconds = 18f, MaxAlive = 14 },
            Kmt = new ForceConfig { Initial = kmt, Reinforcements = zone == BattleZone.Jungle ? 0 : 4, Accuracy = 0.22f, FireRate = 0.9f, RetreatAtEnd = retreat }
        };

        private void BuildMaterials()
        {
            Shader lit = Shader.Find("Universal Render Pipeline/Lit");
            redMaterial = Material(lit, "Red Army PBR", new Color(0.16f, 0.08f, 0.045f), 0.15f, 0.2f);
            kmtMaterial = Material(lit, "KMT PBR", new Color(0.16f, 0.18f, 0.10f), 0.05f, 0.3f);
            groundMaterial = Material(lit, "Earth PBR", new Color(0.12f, 0.09f, 0.055f), 0f, 0.1f);
            metalMaterial = Material(lit, "Rust Metal PBR", new Color(0.22f, 0.10f, 0.055f), 0.72f, 0.35f);
            woodMaterial = Material(lit, "Wood PBR", new Color(0.20f, 0.12f, 0.06f), 0f, 0.25f);
            riverMaterial = Material(lit, "Muddy River PBR", new Color(0.10f, 0.16f, 0.14f), 0.18f, 0.88f);
            foliageMaterial = Material(lit, "Wet Foliage PBR", new Color(0.055f, 0.12f, 0.045f), 0f, 0.12f);
            ApplyPbrTextures(groundMaterial, "dark_rock");
            ApplyPbrTextures(metalMaterial, "rusty_metal");
            ApplyPbrTextures(woodMaterial, "wooden_planks");
        }

        private static Material Material(Shader shader, string name, Color color, float metallic, float smoothness)
        { var material = new Material(shader) { name = name, color = color, enableInstancing = true }; material.SetFloat("_Metallic", metallic); material.SetFloat("_Smoothness", smoothness); return material; }

        private static void ApplyPbrTextures(Material material, string textureName)
        {
            Texture2D albedo = Resources.Load<Texture2D>("Textures/" + textureName + "_diff_1k");
            Texture2D normal = Resources.Load<Texture2D>("Textures/" + textureName + "_nor_gl_1k");
            if (albedo != null) material.SetTexture("_BaseMap", albedo);
            if (normal != null)
            {
                material.SetTexture("_BumpMap", normal);
                material.SetFloat("_BumpScale", 0.65f);
                material.EnableKeyword("_NORMALMAP");
            }
        }

        private void BuildEnvironment()
        {
            RenderSettings.fog = true; RenderSettings.fogMode = FogMode.ExponentialSquared; RenderSettings.fogDensity = 0.008f; RenderSettings.fogColor = new Color(0.38f, 0.42f, 0.39f);
            Material sky = new Material(Shader.Find("Skybox/Procedural")); sky.SetColor("_SkyTint", new Color(0.34f, 0.39f, 0.42f)); sky.SetColor("_GroundColor", new Color(0.10f, 0.09f, 0.07f)); sky.SetFloat("_AtmosphereThickness", 0.72f); sky.SetFloat("_Exposure", 0.72f); RenderSettings.skybox = sky;
            Camera camera = Camera.main; camera.transform.SetPositionAndRotation(new Vector3(0f, 4f, 52f), Quaternion.Euler(8f, 180f, 0f)); camera.farClipPlane = 180f;
            CreateBox("Ground", new Vector3(0f, -0.6f, -15f), new Vector3(70f, 1f, 150f), groundMaterial, false);
            CreateBox("Dadu River", new Vector3(0f, -0.02f, -14f), new Vector3(28f, 0.18f, 70f), riverMaterial, false);
            for (int i = 0; i < 9; i++) { CreateBox("Bridge Plank", new Vector3(0f, 0.15f, 10f - i * 6f), new Vector3(5f, 0.3f, 5f), woodMaterial, false); }
            CreateBox("Bridge Cable L", new Vector3(-3f, 1.2f, -14f), new Vector3(0.18f, 0.18f, 58f), metalMaterial, false);
            CreateBox("Bridge Cable R", new Vector3(3f, 1.2f, -14f), new Vector3(0.18f, 0.18f, 58f), metalMaterial, false);
            CreateBox("Bunker", new Vector3(0f, 3f, -42f), new Vector3(18f, 6f, 8f), groundMaterial, true);
            for (int i = 0; i < 18; i++)
            {
                float side = i % 2 == 0 ? -1f : 1f;
                CreatePrimitive("Cliff Rock", PrimitiveType.Sphere, new Vector3(side * (18f + i % 4 * 2.8f), 2f + i % 3, 42f - i * 7f), new Vector3(8f, 5f + i % 4, 9f), groundMaterial);
            }
            for (int i = 0; i < 16; i++)
            {
                float x = i % 2 == 0 ? -11f - i % 3 * 2f : 11f + i % 3 * 2f;
                float z = 48f - i * 5.5f;
                CreatePrimitive("Tree Trunk", PrimitiveType.Cylinder, new Vector3(x, 2.5f, z), new Vector3(0.45f, 2.5f, 0.45f), woodMaterial);
                CreatePrimitive("Tree Crown", PrimitiveType.Sphere, new Vector3(x, 6f, z), new Vector3(3.2f, 4.2f, 3.2f), foliageMaterial);
            }
            for (int i = 0; i < 12; i++) CreatePrimitive("Sandbag", PrimitiveType.Capsule, new Vector3(-5.5f + i, 0.65f, -37.5f), new Vector3(0.55f, 0.35f, 0.8f), groundMaterial);
            for (int i = 0; i < 8; i++) CreateBox("Street Building", new Vector3(i % 2 == 0 ? -14f : 14f, 4f, -62f - i * 7f), new Vector3(12f, 8f, 6f), groundMaterial, true);
            CreateScreen("Jungle Projection", new Vector3(-12f, 5f, 26f), Quaternion.Euler(0f, 25f, 0f), "vid_jungle_board.mp4");
            CreateScreen("Bunker Projection", new Vector3(0f, 3.5f, -37.9f), Quaternion.identity, "vid_bunker_wall.mp4");
            CreateScreen("Street Projection", new Vector3(-7.8f, 4f, -76f), Quaternion.Euler(0f, 90f, 0f), "vid_street_wall.mp4");
            CreatePostProcessing();
        }

        private GameObject CreateBox(string objectName, Vector3 position, Vector3 scale, Material material, bool obstacle)
        { GameObject box = GameObject.CreatePrimitive(PrimitiveType.Cube); box.name = objectName; box.transform.position = position; box.transform.localScale = scale; box.GetComponent<Renderer>().sharedMaterial = material; return box; }
        private GameObject CreatePrimitive(string objectName, PrimitiveType primitiveType, Vector3 position, Vector3 scale, Material material)
        { GameObject value = GameObject.CreatePrimitive(primitiveType); value.name = objectName; value.transform.position = position; value.transform.localScale = scale; value.GetComponent<Renderer>().sharedMaterial = material; return value; }
        private void CreateScreen(string screenName, Vector3 position, Quaternion rotation, string videoFile)
        { GameObject screen = CreateBox(screenName, position, new Vector3(8f, 4.5f, 0.15f), metalMaterial, false); screen.transform.rotation = rotation; ProjectionScreen projection = screen.AddComponent<ProjectionScreen>(); projection.Initialize(videoFile); screens.Add(projection); }

        private void CreatePostProcessing()
        {
            var volumeObject = new GameObject("Global Post Processing");
            var volume = volumeObject.AddComponent<Volume>(); volume.isGlobal = true; volume.priority = 1f; volume.profile = ScriptableObject.CreateInstance<VolumeProfile>();
            Bloom bloom = volume.profile.Add<Bloom>(); bloom.intensity.Override(0.18f); bloom.threshold.Override(1.1f);
            Vignette vignette = volume.profile.Add<Vignette>(); vignette.intensity.Override(0.22f); vignette.smoothness.Override(0.45f);
            FilmGrain grain = volume.profile.Add<FilmGrain>(); grain.intensity.Override(0.12f);
            Tonemapping tone = volume.profile.Add<Tonemapping>(); tone.mode.Override(TonemappingMode.ACES);
            ColorAdjustments color = volume.profile.Add<ColorAdjustments>(); color.postExposure.Override(-0.1f); color.saturation.Override(-8f); color.contrast.Override(8f);
        }

        private void BuildUi()
        {
            var canvasObject = new GameObject("Experience UI"); var canvas = canvasObject.AddComponent<Canvas>(); canvas.renderMode = RenderMode.ScreenSpaceOverlay; canvasObject.AddComponent<CanvasScaler>(); canvasObject.AddComponent<GraphicRaycaster>();
            statusText = Text(canvas.transform, "Status", new Vector2(18f, -18f), TextAnchor.UpperLeft, 18); statusText.rectTransform.anchorMin = statusText.rectTransform.anchorMax = new Vector2(0f, 1f); statusText.rectTransform.pivot = new Vector2(0f, 1f);
            titleText = Text(canvas.transform, "Title", Vector2.zero, TextAnchor.MiddleCenter, 30); titleText.rectTransform.anchorMin = Vector2.zero; titleText.rectTransform.anchorMax = Vector2.one; titleText.rectTransform.offsetMin = titleText.rectTransform.offsetMax = Vector2.zero;
            var transition = new GameObject("Phase Transition"); transition.transform.SetParent(canvas.transform, false);
            var image = transition.AddComponent<Image>(); image.color = Color.black; image.raycastTarget = false;
            RectTransform transitionRect = image.rectTransform; transitionRect.anchorMin = Vector2.zero; transitionRect.anchorMax = Vector2.one; transitionRect.offsetMin = transitionRect.offsetMax = Vector2.zero;
            transitionOverlay = transition.AddComponent<CanvasGroup>(); transitionOverlay.alpha = 0f; transitionOverlay.blocksRaycasts = false;
        }

        private IEnumerator PlayStreetTransition()
        {
            if (playerController != null) playerController.enabled = false;
            Vector3 start = Camera.main.transform.position;
            Quaternion startRotation = Camera.main.transform.rotation;
            Vector3 end = new Vector3(0f, 3.2f, -58f);
            Quaternion endRotation = Quaternion.Euler(6f, 180f, 0f);
            for (float t = 0f; t < 2f; t += Time.deltaTime)
            {
                float p = Mathf.SmoothStep(0f, 1f, t / 2f);
                transitionOverlay.alpha = Mathf.Sin(p * Mathf.PI) * 0.92f;
                Camera.main.transform.position = Vector3.Lerp(start, end, p);
                Camera.main.transform.rotation = Quaternion.Slerp(startRotation, endRotation, p);
                yield return null;
            }
            transitionOverlay.alpha = 0f;
            Camera.main.transform.SetPositionAndRotation(end, endRotation);
            if (playerController != null) playerController.enabled = true;
        }
        private static Text Text(Transform parent, string objectName, Vector2 position, TextAnchor alignment, int size)
        { var go = new GameObject(objectName); go.transform.SetParent(parent, false); var text = go.AddComponent<Text>(); text.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf"); text.fontSize = size; text.alignment = alignment; text.color = Color.white; text.text = objectName; var rect = text.rectTransform; rect.anchoredPosition = position; rect.sizeDelta = new Vector2(680f, 180f); return text; }
    }
}
