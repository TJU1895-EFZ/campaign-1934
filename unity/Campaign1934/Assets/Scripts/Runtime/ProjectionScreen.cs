using System.Collections;
using UnityEngine;
using UnityEngine.Video;

namespace Campaign1934.Runtime
{
    public sealed class ProjectionScreen : MonoBehaviour
    {
        private VideoPlayer player;
        private Renderer screenRenderer;
        private Material material;
        private RenderTexture texture;
        private Coroutine transition;
        private bool requestedActive;
        public string VideoFile { get; private set; }

        public void Initialize(string videoFile)
        {
            VideoFile = videoFile;
            screenRenderer = GetComponent<Renderer>();
            material = screenRenderer.material;
            texture = new RenderTexture(640, 360, 0, RenderTextureFormat.ARGB32) { name = name + " Video" };
            material.mainTexture = texture;
            material.EnableKeyword("_EMISSION");
            material.SetTexture("_EmissionMap", texture);
            player = gameObject.AddComponent<VideoPlayer>();
            player.renderMode = VideoRenderMode.RenderTexture;
            player.targetTexture = texture;
            player.source = VideoSource.Url;
            if (!Application.isBatchMode)
                player.url = System.IO.Path.Combine(Application.streamingAssetsPath, "Video", videoFile);
            player.isLooping = true;
            player.audioOutputMode = VideoAudioOutputMode.None;
            player.playOnAwake = false;
            SetEmission(0f);
        }

        public void SetActive(bool active)
        {
            requestedActive = active;
            if (transition != null) StopCoroutine(transition);
            transition = StartCoroutine(Fade(active));
        }

        private void Update()
        {
            if (Application.isBatchMode) return;
            if (!requestedActive || Camera.main == null || player == null) return;
            bool near = Vector3.Distance(Camera.main.transform.position, transform.position) <= 60f;
            if (near && !player.isPlaying) player.Play();
            else if (!near && player.isPlaying) player.Pause();
        }

        private IEnumerator Fade(bool active)
        {
            if (active && !Application.isBatchMode) player.Play();
            float start = material.GetColor("_EmissionColor").maxColorComponent;
            float target = active ? 1.4f : 0f;
            for (float t = 0f; t < 0.5f; t += Time.deltaTime) { SetEmission(Mathf.Lerp(start, target, t / 0.5f)); yield return null; }
            SetEmission(target);
            if (!active && !Application.isBatchMode) player.Stop();
        }

        private void SetEmission(float intensity) => material.SetColor("_EmissionColor", new Color(0.75f, 0.82f, 1f) * intensity);

        private void OnDestroy()
        {
            if (texture != null) { texture.Release(); Destroy(texture); }
        }
    }
}
