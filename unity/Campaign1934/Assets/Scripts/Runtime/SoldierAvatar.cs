using Campaign1934.Core;
using UnityEngine;
using System;
using UnityEngine.Animations;
using UnityEngine.Playables;

namespace Campaign1934.Runtime
{
    public sealed class SoldierAvatar : MonoBehaviour
    {
        private static Material sharedSkin, sharedLeather, sharedRedBand, sharedSteelHelmet;
        private Transform torso, head, leftArm, rightArm, leftLeg, rightLeg, rifle;
        private PlayableGraph animationGraph;
        private AnimationMixerPlayable animationMixer;
        private int activeAnimation = -1;
        private bool riggedModel;
        private bool hasImportedClips;
        private Transform riggedLeftArm, riggedRightArm, riggedLeftLeg, riggedRightLeg;
        private Quaternion riggedLeftArmBind, riggedRightArmBind, riggedLeftLegBind, riggedRightLegBind;
        private BotPosture posture;
        private bool moving;
        private float gait;

        public bool UsesRiggedModel => riggedModel;

        public void Build(Faction faction, Material uniform)
        {
            if (BuildRiggedModel(faction)) return;
            sharedSkin ??= CreateMaterial("Skin", new Color(0.34f, 0.24f, 0.17f));
            sharedLeather ??= CreateMaterial("Leather", new Color(0.07f, 0.045f, 0.025f));
            sharedRedBand ??= CreateMaterial("Red Armband", new Color(0.52f, 0.018f, 0.012f));
            sharedSteelHelmet ??= CreateMaterial("Steel Helmet", new Color(0.12f, 0.14f, 0.09f));
            Material skin = sharedSkin, leather = sharedLeather, redBand = sharedRedBand;
            Material helmet = faction == Faction.Red ? uniform : sharedSteelHelmet;

            torso = Part("Torso", PrimitiveType.Cube, transform, new Vector3(0f, 1.35f, 0f), new Vector3(0.56f, 0.74f, 0.32f), uniform);
            head = Part("Head", PrimitiveType.Sphere, transform, new Vector3(0f, 2.02f, 0f), new Vector3(0.34f, 0.38f, 0.34f), skin);
            Part(faction == Faction.Red ? "Cloth Cap" : "Helmet", PrimitiveType.Sphere, head, new Vector3(0f, 0.18f, 0f), new Vector3(1.08f, 0.42f, 1.08f), helmet);
            leftArm = Limb("Left Arm", transform, new Vector3(-0.43f, 1.5f, 0f), uniform);
            rightArm = Limb("Right Arm", transform, new Vector3(0.43f, 1.5f, 0f), uniform);
            leftLeg = Limb("Left Leg", transform, new Vector3(-0.18f, 0.55f, 0f), uniform, true);
            rightLeg = Limb("Right Leg", transform, new Vector3(0.18f, 0.55f, 0f), uniform, true);
            Part("Backpack", PrimitiveType.Cube, torso, new Vector3(0f, 0f, 0.28f), new Vector3(0.72f, 0.75f, 0.22f), leather);
            rifle = Part("Rifle", PrimitiveType.Cube, torso, new Vector3(0.28f, 0.02f, -0.34f), new Vector3(0.08f, 0.08f, 1.45f), leather);
            rifle.localRotation = Quaternion.Euler(0f, 0f, -8f);
            if (faction == Faction.Red)
                Part("Red Armband", PrimitiveType.Cylinder, leftArm, new Vector3(0f, 0.15f, 0f), new Vector3(0.26f, 0.07f, 0.26f), redBand);
            var lod = gameObject.AddComponent<LODGroup>();
            Renderer[] renderers = GetComponentsInChildren<Renderer>();
            lod.SetLODs(new[] { new LOD(0.06f, renderers), new LOD(0.015f, Array.Empty<Renderer>()) });
            lod.RecalculateBounds();
        }

        public void SetState(BotPosture nextPosture, bool isMoving)
        {
            posture = nextPosture;
            moving = isMoving;
        }

        private void Update()
        {
            if (riggedModel)
            {
                int target = posture == BotPosture.Prone ? 3 : posture == BotPosture.Crouch ? 2 : moving ? 1 : 0;
                if (hasImportedClips) SetAnimation(target);
                else AnimateRiggedBones();
                Vector3 riggedPosition = posture == BotPosture.Prone ? new Vector3(0f, -0.82f, -0.3f) : new Vector3(0f, -1f, 0f);
                Quaternion riggedRotation = posture == BotPosture.Prone ? Quaternion.Euler(76f, 0f, 0f) : Quaternion.identity;
                transform.localPosition = Vector3.Lerp(transform.localPosition, riggedPosition, Time.deltaTime * 8f);
                transform.localRotation = Quaternion.Slerp(transform.localRotation, riggedRotation, Time.deltaTime * 8f);
                return;
            }
            if (torso == null) return;
            float targetGait = moving ? 1f : 0f;
            gait = Mathf.MoveTowards(gait, targetGait, Time.deltaTime * 6f);
            float cycle = Mathf.Sin(Time.time * (posture == BotPosture.Prone ? 5f : 9f)) * gait;
            float limbAngle = posture == BotPosture.Prone ? 14f : 32f;
            leftLeg.localRotation = Quaternion.Euler(cycle * limbAngle, 0f, 0f);
            rightLeg.localRotation = Quaternion.Euler(-cycle * limbAngle, 0f, 0f);
            leftArm.localRotation = Quaternion.Euler(-cycle * limbAngle * 0.65f, 0f, 8f);
            rightArm.localRotation = Quaternion.Euler(cycle * limbAngle * 0.65f, 0f, -8f);

            Vector3 targetScale = Vector3.one;
            Vector3 targetPosition = Vector3.zero;
            Quaternion targetRotation = Quaternion.identity;
            if (posture == BotPosture.Crouch)
            {
                targetScale = new Vector3(1f, 0.72f, 1f);
                targetPosition.y = -0.18f;
                torso.localRotation = Quaternion.Slerp(torso.localRotation, Quaternion.Euler(18f, 0f, 0f), Time.deltaTime * 9f);
            }
            else if (posture == BotPosture.Prone)
            {
                targetScale = new Vector3(1f, 0.74f, 1f);
                targetPosition = new Vector3(0f, -0.64f, -0.2f);
                targetRotation = Quaternion.Euler(76f, 0f, 0f);
            }
            else torso.localRotation = Quaternion.Slerp(torso.localRotation, Quaternion.identity, Time.deltaTime * 9f);
            transform.localScale = Vector3.Lerp(transform.localScale, targetScale, Time.deltaTime * 9f);
            transform.localPosition = Vector3.Lerp(transform.localPosition, targetPosition, Time.deltaTime * 9f);
            transform.localRotation = Quaternion.Slerp(transform.localRotation, targetRotation, Time.deltaTime * 9f);
        }

        private static Transform Limb(string name, Transform parent, Vector3 position, Material material, bool leg = false)
        {
            Transform limb = Part(name, PrimitiveType.Capsule, parent, position, leg ? new Vector3(0.18f, 0.48f, 0.18f) : new Vector3(0.15f, 0.42f, 0.15f), material);
            return limb;
        }

        private static Transform Part(string name, PrimitiveType primitive, Transform parent, Vector3 position, Vector3 scale, Material material)
        {
            GameObject part = GameObject.CreatePrimitive(primitive);
            part.name = name;
            part.transform.SetParent(parent, false);
            part.transform.localPosition = position;
            part.transform.localScale = scale;
            part.GetComponent<Renderer>().sharedMaterial = material;
            Collider collider = part.GetComponent<Collider>();
            if (collider != null) Destroy(collider);
            return part.transform;
        }

        private static Material CreateMaterial(string name, Color color)
        {
            Material material = new Material(Shader.Find("Universal Render Pipeline/Lit")) { name = name, color = color, enableInstancing = true };
            material.SetFloat("_Smoothness", 0.2f);
            return material;
        }

        private bool BuildRiggedModel(Faction faction)
        {
            string resource = faction == Faction.Red ? "Models/soldier_red" : "Models/soldier_kmt";
            GameObject source = Resources.Load<GameObject>(resource);
            if (source == null) return false;
            GameObject model = Instantiate(source, transform);
            model.name = faction == Faction.Red ? "Rigged Red Army Soldier" : "Rigged KMT Soldier";
            model.transform.SetLocalPositionAndRotation(new Vector3(0f, -1f, 0f), Quaternion.identity);
            Animator animator = model.GetComponentInChildren<Animator>();
            AnimationClip idle = LoadClip(resource + "@rifle_idle", "Rifle idle", "Idle");
            AnimationClip run = LoadClip(resource + "@rifle_run", "Rifle run", "Run", "Walk");
            AnimationClip crouch = LoadClip(resource + "@rifle_crouch_aim", "Crouch aim", "Crouch");
            AnimationClip crawl = LoadClip(resource + "@rifle_crouch_walk", "Crouch walk", "Walk");
            if (animator == null)
            {
                Destroy(model);
                return false;
            }

            hasImportedClips = idle != null && run != null && crouch != null && crawl != null;
            if (hasImportedClips)
            {
                animationGraph = PlayableGraph.Create(name + " Soldier Animations");
                animationGraph.SetTimeUpdateMode(DirectorUpdateMode.GameTime);
                animationMixer = AnimationMixerPlayable.Create(animationGraph, 4);
                AnimationPlayableOutput output = AnimationPlayableOutput.Create(animationGraph, "Soldier", animator);
                output.SetSourcePlayable(animationMixer);
                ConnectClip(idle, 0); ConnectClip(run, 1); ConnectClip(crouch, 2); ConnectClip(crawl, 3);
                animationGraph.Play();
                SetAnimation(0);
            }
            else
            {
                animator.enabled = false;
                riggedLeftArm = animator.GetBoneTransform(HumanBodyBones.LeftUpperArm);
                riggedRightArm = animator.GetBoneTransform(HumanBodyBones.RightUpperArm);
                riggedLeftLeg = animator.GetBoneTransform(HumanBodyBones.LeftUpperLeg);
                riggedRightLeg = animator.GetBoneTransform(HumanBodyBones.RightUpperLeg);
                if (riggedLeftArm != null) riggedLeftArmBind = riggedLeftArm.localRotation;
                if (riggedRightArm != null) riggedRightArmBind = riggedRightArm.localRotation;
                if (riggedLeftLeg != null) riggedLeftLegBind = riggedLeftLeg.localRotation;
                if (riggedRightLeg != null) riggedRightLegBind = riggedRightLeg.localRotation;
            }
            riggedModel = true;

            if (faction == Faction.Red)
            {
                Transform upperArm = animator.GetBoneTransform(HumanBodyBones.LeftUpperArm);
                if (upperArm != null)
                    Part("Red Armband", PrimitiveType.Cylinder, upperArm, new Vector3(0f, 0.06f, 0f), new Vector3(0.07f, 0.025f, 0.07f), sharedRedBand ??= CreateMaterial("Red Armband", new Color(0.52f, 0.018f, 0.012f)));
            }
            var lod = gameObject.AddComponent<LODGroup>();
            Renderer[] renderers = GetComponentsInChildren<Renderer>();
            lod.SetLODs(new[] { new LOD(0.08f, renderers), new LOD(0.02f, Array.Empty<Renderer>()) });
            lod.RecalculateBounds();
            return true;
        }

        private void ConnectClip(AnimationClip clip, int port)
        {
            AnimationClipPlayable playable = AnimationClipPlayable.Create(animationGraph, clip);
            playable.SetApplyFootIK(true);
            animationGraph.Connect(playable, 0, animationMixer, port);
            animationMixer.SetInputWeight(port, port == 0 ? 1f : 0f);
        }

        private void SetAnimation(int target)
        {
            if (activeAnimation == target || !animationMixer.IsValid()) return;
            activeAnimation = target;
            for (int i = 0; i < animationMixer.GetInputCount(); i++) animationMixer.SetInputWeight(i, i == target ? 1f : 0f);
        }

        private static AnimationClip FindClip(AnimationClip[] clips, params string[] names)
        {
            foreach (string wanted in names)
                foreach (AnimationClip clip in clips)
                    if (!clip.name.StartsWith("__preview__", StringComparison.OrdinalIgnoreCase) && clip.name.IndexOf(wanted, StringComparison.OrdinalIgnoreCase) >= 0) return clip;
            return null;
        }

        private static AnimationClip LoadClip(string resource, params string[] names) => FindClip(Resources.LoadAll<AnimationClip>(resource), names);

        private void AnimateRiggedBones()
        {
            float blend = moving ? 1f : 0f;
            float cycle = Mathf.Sin(Time.time * (posture == BotPosture.Prone ? 5f : 9f));
            float angle = (posture == BotPosture.Prone ? 12f : posture == BotPosture.Crouch ? 20f : 34f) * blend;
            if (riggedLeftLeg != null) riggedLeftLeg.localRotation = riggedLeftLegBind * Quaternion.Euler(cycle * angle, 0f, 0f);
            if (riggedRightLeg != null) riggedRightLeg.localRotation = riggedRightLegBind * Quaternion.Euler(-cycle * angle, 0f, 0f);
            if (riggedLeftArm != null) riggedLeftArm.localRotation = riggedLeftArmBind * Quaternion.Euler(-cycle * angle * 0.35f, 0f, 0f);
            if (riggedRightArm != null) riggedRightArm.localRotation = riggedRightArmBind * Quaternion.Euler(cycle * angle * 0.35f, 0f, 0f);
        }

        private void OnDestroy()
        {
            if (animationGraph.IsValid()) animationGraph.Destroy();
        }
    }
}
