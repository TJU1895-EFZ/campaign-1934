using System.Collections;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.Networking;

namespace Campaign1934.Runtime
{
    public sealed class AppAudioManager : MonoBehaviour
    {
        private const string MutedKey = "campaign1934.audio.muted";
        private AudioSource music;
        private AudioSource weapon;
        private AudioSource effects;
        private float lastHoverTime = -10f;
        private float lastChargeTime = -10f;
        private bool unlocked;

        public bool Muted { get; private set; }

        private IEnumerator Start()
        {
            music = CreateSource("Music Bus", false, 0.28f);
            weapon = CreateSource("Weapon Bus", false, 0.9f);
            effects = CreateSource("Environment Bus", true, 0.55f);
            Muted = PlayerPrefs.GetInt(MutedKey, 0) == 1;
            ApplyMute();
            yield return LoadClip("Audio/bgm_battle.mp3", clip => { music.clip = clip; music.loop = true; });
            yield return LoadClip("Audio/guns.mp3", clip => weapon.clip = clip);
            yield return LoadClip("Audio/sfx_horn.mp3", clip => effects.clip = clip);
        }

        private void Update()
        {
            if (!unlocked &&
                ((Keyboard.current != null && Keyboard.current.anyKey.wasPressedThisFrame) ||
                 (Mouse.current != null && Mouse.current.leftButton.wasPressedThisFrame)))
            {
                unlocked = true;
                if (music.clip != null) StartCoroutine(FadeMusic(0f, 0.28f, 2f));
            }
        }

        public void ToggleMute()
        {
            Muted = !Muted; PlayerPrefs.SetInt(MutedKey, Muted ? 1 : 0); PlayerPrefs.Save(); ApplyMute();
        }

        public void EnterBattle()
        {
            if (music.isPlaying) StartCoroutine(FadeMusic(music.volume, 0f, 2f));
        }

        public void PlayWeapon()
        {
            if (weapon.clip == null) return;
            weapon.Stop();
            weapon.time = weapon.clip.length > 0.4f ? Random.Range(0f, weapon.clip.length - 0.25f) : 0f;
            weapon.volume = 0.95f;
            weapon.Play();
            StartCoroutine(StopWeaponSample(0.22f));
        }
        public void PlayCardHover(bool available)
        {
            if (Time.unscaledTime - lastHoverTime < 0.2f) return;
            lastHoverTime = Time.unscaledTime;
            AudioSource.PlayClipAtPoint(CreateTone(available ? 880f : 180f, 0.2f), Vector3.zero, 0.12f);
        }
        public void PlayCharge()
        {
            if (Time.time - lastChargeTime < 8f || effects.clip == null) return;
            lastChargeTime = Time.time;
            effects.PlayOneShot(effects.clip, 0.7f);
            StartCoroutine(DuckEnvironment(Mathf.Min(8f, effects.clip.length)));
        }
        public void PlayExplosion(Vector3 position, AudioClip clip)
        {
            if (clip == null) return;
            var source = new GameObject("Explosion Audio").AddComponent<AudioSource>();
            source.transform.position = position; source.spatialBlend = 1f; source.maxDistance = 60f; source.clip = clip; source.Play(); Destroy(source.gameObject, clip.length + 0.2f);
        }
        public void PlaySpatialExplosion(Vector3 position)
        {
            AudioClip clip = CreateTone(72f, 0.55f);
            var source = new GameObject("Spatial Explosion").AddComponent<AudioSource>();
            source.transform.position = position; source.spatialBlend = 1f; source.maxDistance = 60f;
            source.volume = 0.85f; source.clip = clip; source.Play();
            Destroy(source.gameObject, 0.8f);
        }

        private AudioSource CreateSource(string sourceName, bool spatial, float volume)
        {
            var source = new GameObject(sourceName).AddComponent<AudioSource>();
            source.transform.SetParent(transform); source.playOnAwake = false; source.spatialBlend = spatial ? 1f : 0f; source.volume = volume; return source;
        }
        private void ApplyMute() => AudioListener.volume = Muted ? 0f : 1f;
        private IEnumerator FadeMusic(float from, float to, float seconds)
        {
            if (!music.isPlaying) music.Play();
            for (float t = 0f; t < seconds; t += Time.unscaledDeltaTime) { music.volume = Mathf.Lerp(from, to, t / seconds); yield return null; }
            music.volume = to; if (to <= 0f) { music.Stop(); music.clip = null; }
        }
        private IEnumerator StopWeaponSample(float seconds)
        { yield return new WaitForSeconds(seconds); if (weapon != null) weapon.Stop(); }
        private IEnumerator DuckEnvironment(float seconds)
        {
            float normal = effects.volume;
            effects.volume = normal * 0.4f;
            yield return new WaitForSeconds(seconds);
            if (effects != null) effects.volume = normal;
        }
        private IEnumerator LoadClip(string relativePath, System.Action<AudioClip> receive)
        {
            string url = System.IO.Path.Combine(Application.streamingAssetsPath, relativePath);
            using (UnityWebRequest request = UnityWebRequestMultimedia.GetAudioClip(url, AudioType.MPEG))
            { yield return request.SendWebRequest(); if (request.result == UnityWebRequest.Result.Success) receive(DownloadHandlerAudioClip.GetContent(request)); }
        }
        private static AudioClip CreateTone(float frequency, float duration)
        {
            int rate = 22050, samples = Mathf.CeilToInt(rate * duration); float[] data = new float[samples];
            for (int i = 0; i < samples; i++) data[i] = Mathf.Sin(2f * Mathf.PI * frequency * i / rate) * (1f - i / (float)samples) * 0.2f;
            AudioClip clip = AudioClip.Create("UI tone", samples, 1, rate, false); clip.SetData(data, 0); return clip;
        }
    }
}
