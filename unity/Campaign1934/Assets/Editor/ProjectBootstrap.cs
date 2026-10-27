using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using Campaign1934.Runtime;
using UnityEngine.SceneManagement;

namespace Campaign1934.Editor
{
    public static class ProjectBootstrap
    {
        private const string SettingsDirectory = "Assets/Settings";
        private const string ScenesDirectory = "Assets/Scenes";
        private const string RendererPath = SettingsDirectory + "/CampaignRenderer.asset";
        private const string PipelinePath = SettingsDirectory + "/CampaignURP.asset";
        private const string ScenePath = ScenesDirectory + "/Bootstrap.unity";

        public static void ConfigureProject()
        {
            EnsureFolder(SettingsDirectory);
            EnsureFolder(ScenesDirectory);
            ConfigureNormalMaps();

            var renderer = AssetDatabase.LoadAssetAtPath<UniversalRendererData>(RendererPath);
            if (renderer == null)
            {
                renderer = ScriptableObject.CreateInstance<UniversalRendererData>();
                AssetDatabase.CreateAsset(renderer, RendererPath);
            }

            var pipeline = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(PipelinePath);
            if (pipeline == null)
            {
                pipeline = UniversalRenderPipelineAsset.Create(renderer);
                AssetDatabase.CreateAsset(pipeline, PipelinePath);
            }

            GraphicsSettings.defaultRenderPipeline = pipeline;
            QualitySettings.renderPipeline = pipeline;
            PlayerSettings.companyName = "Campaign 1934";
            PlayerSettings.productName = "Campaign 1934";
            PlayerSettings.colorSpace = ColorSpace.Linear;
            PlayerSettings.WebGL.template = "PROJECT:Campaign1934";

            CreateBootstrapScene();
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
            AssetDatabase.SaveAssets();
            Debug.Log("Campaign 1934 URP project configured successfully.");
        }

        public static void BuildWebGLSmokeTest()
        {
            ConfigureProject();

            var outputDirectory = Environment.GetEnvironmentVariable("CAMPAIGN1934_WEBGL_OUTPUT");
            if (string.IsNullOrWhiteSpace(outputDirectory))
            {
                outputDirectory = Path.GetFullPath(Path.Combine(Application.dataPath, "../../../.local-tools/webgl-smoke"));
            }

            Directory.CreateDirectory(outputDirectory);
            var options = new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = outputDirectory,
                target = BuildTarget.WebGL,
                options = BuildOptions.None
            };

            BuildReport report = BuildPipeline.BuildPlayer(options);
            BuildSummary summary = report.summary;
            Debug.Log($"WebGL smoke build result: {summary.result}; errors: {summary.totalErrors}; size: {summary.totalSize}");
            if (summary.result != BuildResult.Succeeded)
            {
                throw new InvalidOperationException($"WebGL smoke build failed with {summary.totalErrors} errors.");
            }
        }

        private static void CreateBootstrapScene()
        {
            if (File.Exists(Path.GetFullPath(Path.Combine(Application.dataPath, "Scenes/Bootstrap.unity")))) return;
            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            var cameraObject = new GameObject("Main Camera");
            cameraObject.tag = "MainCamera";
            var camera = cameraObject.AddComponent<Camera>();
            cameraObject.AddComponent<AudioListener>();
            cameraObject.AddComponent<UniversalAdditionalCameraData>();
            cameraObject.AddComponent<BattleRuntime>();
            camera.transform.SetPositionAndRotation(new Vector3(0f, 2.4f, -6f), Quaternion.Euler(12f, 0f, 0f));
            camera.clearFlags = CameraClearFlags.Skybox;

            var lightObject = new GameObject("Sun");
            var light = lightObject.AddComponent<Light>();
            light.type = LightType.Directional;
            light.intensity = 1.1f;
            light.shadows = LightShadows.Soft;
            lightObject.transform.rotation = Quaternion.Euler(48f, -32f, 0f);

            var ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
            ground.name = "Ground";
            ground.transform.localScale = new Vector3(4f, 1f, 4f);

            var marker = GameObject.CreatePrimitive(PrimitiveType.Cube);
            marker.name = "Campaign 1934 Bootstrap Marker";
            marker.transform.SetPositionAndRotation(new Vector3(0f, 1f, 0f), Quaternion.Euler(0f, 30f, 0f));
            marker.transform.localScale = new Vector3(1.2f, 2f, 0.5f);

            var shader = Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null)
            {
                throw new InvalidOperationException("URP Lit shader was not found.");
            }

            var material = new Material(shader)
            {
                name = "Bootstrap Red"
            };
            material.color = new Color(0.45f, 0.035f, 0.025f, 1f);
            marker.GetComponent<Renderer>().sharedMaterial = material;

            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(0.32f, 0.35f, 0.38f);
            RenderSettings.ambientEquatorColor = new Color(0.18f, 0.17f, 0.15f);
            RenderSettings.ambientGroundColor = new Color(0.07f, 0.065f, 0.055f);

            EditorSceneManager.SaveScene(scene, ScenePath);
        }

        private static void EnsureFolder(string path)
        {
            string[] segments = path.Split('/');
            string current = segments[0];
            for (int i = 1; i < segments.Length; i++)
            {
                string next = current + "/" + segments[i];
                if (!AssetDatabase.IsValidFolder(next))
                {
                    AssetDatabase.CreateFolder(current, segments[i]);
                }

                current = next;
            }
        }

        private static void ConfigureNormalMaps()
        {
            string[] normalMaps = AssetDatabase.FindAssets("nor_gl_1k t:Texture2D", new[] { "Assets/Resources/Textures" });
            foreach (string guid in normalMaps)
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);
                var importer = AssetImporter.GetAtPath(path) as TextureImporter;
                if (importer == null || importer.textureType == TextureImporterType.NormalMap) continue;
                importer.textureType = TextureImporterType.NormalMap;
                importer.SaveAndReimport();
            }
        }
    }
}
