using Campaign1934.Core;
using UnityEngine;

namespace Campaign1934.Runtime
{
    public enum BotPosture { Stand, Crouch, Prone }

    public sealed class BotAgent : MonoBehaviour
    {
        public const float CrouchSpeedMultiplier = 0.5f;
        public const float ProneSpeedMultiplier = 0.25f;
        public const float AvoidanceCrouchProbability = 0.5f;
        private const float StuckDistance = 0.05f;
        private const float StuckWindow = 0.3f;

        private Vector3 destination;
        private Vector3 samplePosition;
        private float sampleTimer;
        private float avoidanceTimer;
        private float sideDirection;
        private bool goingAround;
        private SoldierAvatar avatar;

        public Faction Faction { get; private set; }
        public bool IsKey { get; private set; }
        public bool IsOnBridge { get; set; }
        public bool IsMoving { get; private set; }
        public BotPosture Posture { get; private set; }
        public float Speed { get; set; } = 2.2f;

        public void Initialize(Faction faction, bool key, Material material, int stableIndex)
        {
            Faction = faction;
            IsKey = key;
            Renderer bodyRenderer = GetComponent<Renderer>();
            if (bodyRenderer != null) bodyRenderer.enabled = false;
            avatar = new GameObject("Soldier Avatar").AddComponent<SoldierAvatar>();
            avatar.transform.SetParent(transform, false);
            avatar.Build(faction, material);
            samplePosition = transform.position;
            sideDirection = stableIndex % 2 == 0 ? 1f : -1f;
            SetPosture(BotPosture.Stand);
        }

        public void SetDestination(Vector3 value) => destination = value;

        public void SetBridgePosture(int stableIndex)
        {
            IsOnBridge = true;
            SetPosture(stableIndex % 3 == 0 ? BotPosture.Prone : BotPosture.Stand);
            Speed = stableIndex % 4 == 0 ? 3.2f : 4f;
        }

        public void SetOffBridge(float speed = 2.2f)
        {
            IsOnBridge = false;
            Speed = speed;
            if (avoidanceTimer <= 0f) SetPosture(BotPosture.Stand);
        }

        private void Update()
        {
            float dt = Time.deltaTime;
            if (avoidanceTimer > 0f)
            {
                avoidanceTimer -= dt;
                if (goingAround) transform.position += transform.right * (sideDirection * 1.8f * dt);
                if (avoidanceTimer <= 0f) { goingAround = false; SetPosture(IsOnBridge && GetInstanceID() % 3 == 0 ? BotPosture.Prone : BotPosture.Stand); }
            }

            Vector3 flatDelta = destination - transform.position;
            flatDelta.y = 0f;
            float multiplier = Posture == BotPosture.Crouch ? CrouchSpeedMultiplier : Posture == BotPosture.Prone ? ProneSpeedMultiplier : 1f;
            Vector3 movement = flatDelta.sqrMagnitude < 0.04f ? Vector3.zero : flatDelta.normalized * (Speed * multiplier * dt);
            if (movement.sqrMagnitude > flatDelta.sqrMagnitude) movement = flatDelta;
            transform.position += movement;
            if (movement.sqrMagnitude > 0.00001f) transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(movement), dt * 8f);

            sampleTimer += dt;
            if (sampleTimer >= StuckWindow)
            {
                float distance = Vector3.Distance(samplePosition, transform.position);
                IsMoving = distance >= StuckDistance;
                if (!IsMoving && flatDelta.sqrMagnitude > 1f && avoidanceTimer <= 0f) BeginAvoidance();
                samplePosition = transform.position;
                sampleTimer = 0f;
            }
            avatar?.SetState(Posture, movement.sqrMagnitude > 0.00001f);
        }

        private void OnCollisionStay(Collision collision)
        {
            if (avoidanceTimer <= 0f && collision.collider.gameObject.name.Contains("Building")) BeginAvoidance();
        }

        private void BeginAvoidance()
        {
            bool crouch = Random.value < AvoidanceCrouchProbability;
            goingAround = !crouch;
            avoidanceTimer = Random.Range(0.8f, 1.5f);
            SetPosture(crouch ? BotPosture.Crouch : BotPosture.Stand);
        }

        private void SetPosture(BotPosture posture)
        {
            Posture = posture;
            avatar?.SetState(posture, IsMoving);
        }
    }
}
