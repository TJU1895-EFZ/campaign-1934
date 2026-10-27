using UnityEngine;
using UnityEngine.InputSystem;

namespace Campaign1934.Runtime
{
    public sealed class FirstPersonController : MonoBehaviour
    {
        [SerializeField] private float moveSpeed = 5f;
        [SerializeField] private float lookSpeed = 0.09f;
        private float pitch;

        private void OnEnable()
        {
            Cursor.lockState = CursorLockMode.Locked;
            Cursor.visible = false;
        }

        private void Update()
        {
            if (Keyboard.current == null || Mouse.current == null) return;
            Vector2 look = Mouse.current.delta.ReadValue() * lookSpeed;
            pitch = Mathf.Clamp(pitch - look.y, -75f, 75f);
            transform.Rotate(0f, look.x, 0f, Space.World);
            Vector3 euler = transform.eulerAngles;
            transform.rotation = Quaternion.Euler(pitch, euler.y, 0f);

            Vector2 input = Vector2.zero;
            if (Keyboard.current.wKey.isPressed) input.y += 1f;
            if (Keyboard.current.sKey.isPressed) input.y -= 1f;
            if (Keyboard.current.dKey.isPressed) input.x += 1f;
            if (Keyboard.current.aKey.isPressed) input.x -= 1f;
            Vector3 movement = (transform.forward * input.y + transform.right * input.x);
            movement.y = 0f;
            if (movement.sqrMagnitude > 1f) movement.Normalize();
            transform.position += movement * (moveSpeed * Time.deltaTime);
            transform.position = new Vector3(Mathf.Clamp(transform.position.x, -28f, 28f), 2.1f, Mathf.Clamp(transform.position.z, -105f, 55f));

            if (Keyboard.current.escapeKey.wasPressedThisFrame)
            {
                Cursor.lockState = CursorLockMode.None;
                Cursor.visible = true;
            }
            if (Mouse.current.leftButton.wasPressedThisFrame)
            {
                Cursor.lockState = CursorLockMode.Locked;
                Cursor.visible = false;
            }
        }
    }
}
