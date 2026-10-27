import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Faction } from '../core/types';

export interface SoldierAssets {
  upper: {
    red: THREE.BufferGeometry;
    kmt: THREE.BufferGeometry;
  };
  leg: {
    red: THREE.BufferGeometry;
    kmt: THREE.BufferGeometry;
  };
  material: THREE.MeshStandardMaterial;
  dispose(): void;
}

export type SoldierPosture = 'stand' | 'crouch' | 'prone';

export interface SoldierView {
  group: THREE.Group;
  upper: THREE.Mesh;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  setMoving: (moving: boolean) => void;
  setPosture: (posture: SoldierPosture) => void;
  update: (dt: number) => void;
  reset: () => void;
}

interface SoldierPalette {
  uniform: number;
  trousers: number;
  cap: number;
  belt: number;
  skin: number;
  boot: number;
  marker: number;
  backpack: number;
  rifleWood: number;
  rifleMetal: number;
}

const RED_PALETTE: SoldierPalette = {
  uniform: 0x53636c,
  trousers: 0x46545b,
  cap: 0x3b4a52,
  belt: 0x332a22,
  skin: 0xa47d62,
  boot: 0x241f1b,
  marker: 0xa8322a,
  backpack: 0x5a5346,
  rifleWood: 0x5a3c24,
  rifleMetal: 0x202628,
};

const KMT_PALETTE: SoldierPalette = {
  uniform: 0x8b7b55,
  trousers: 0x6f6348,
  cap: 0x686048,
  belt: 0x3a3024,
  skin: 0xa47d62,
  boot: 0x241f1b,
  marker: 0xd0b26a,
  backpack: 0x74674b,
  rifleWood: 0x5a3c24,
  rifleMetal: 0x202628,
};

export function createSoldierAssets(): SoldierAssets {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0.03,
  });
  const upperRed = buildUpperGeometry(RED_PALETTE, false);
  const upperKmt = buildUpperGeometry(KMT_PALETTE, true);
  const legRed = buildLegGeometry(RED_PALETTE);
  const legKmt = buildLegGeometry(KMT_PALETTE);

  return {
    upper: { red: upperRed, kmt: upperKmt },
    leg: { red: legRed, kmt: legKmt },
    material,
    dispose() {
      upperRed.dispose();
      upperKmt.dispose();
      legRed.dispose();
      legKmt.dispose();
      material.dispose();
    },
  };
}

export function createSoldier(
  assets: SoldierAssets,
  faction: Faction,
  isKey: boolean,
): SoldierView {
  const group = new THREE.Group();
  const upper = new THREE.Mesh(assets.upper[faction], assets.material);
  const leftLeg = new THREE.Mesh(assets.leg[faction], assets.material);
  const rightLeg = new THREE.Mesh(assets.leg[faction], assets.material);

  leftLeg.position.set(-0.13, 0.95, 0);
  rightLeg.position.set(0.13, 0.95, 0);
  upper.position.y = 0;

  upper.userData = { isBody: true };
  leftLeg.userData = { isBody: true };
  rightLeg.userData = { isBody: true };

  group.add(upper, leftLeg, rightLeg);
  group.userData = { faction, isKey };

  let moving = false;
  let phase = 0;
  let posture: SoldierPosture = 'stand';

  // Posture offsets: how much to lower the group Y and tilt upper body X.
  const postureY: Record<SoldierPosture, number> = { stand: 0, crouch: -0.22, prone: -0.48 };
  const postureTilt: Record<SoldierPosture, number> = { stand: 0, crouch: 0.18, prone: 0.55 };

  const view: SoldierView = {
    group,
    upper,
    leftLeg,
    rightLeg,
    setMoving(next) {
      moving = next;
    },
    setPosture(next) {
      posture = next;
    },
    update(dt) {
      if (moving) {
        phase += dt * 9;
      }
      const damp = Math.min(1, dt * 11);
      const swing = moving ? Math.sin(phase) * 0.55 : 0;
      leftLeg.rotation.x = THREE.MathUtils.lerp(leftLeg.rotation.x, swing, damp);
      rightLeg.rotation.x = THREE.MathUtils.lerp(rightLeg.rotation.x, -swing, damp);
      upper.position.y = moving ? Math.abs(Math.sin(phase)) * 0.022 : 0;
      upper.rotation.x = moving ? Math.sin(phase * 2) * 0.012 : 0;

      // Apply posture offsets on top of animation.
      const targetY = postureY[posture];
      const targetTilt = postureTilt[posture];
      group.position.y = THREE.MathUtils.lerp(group.position.y, targetY, damp);
      upper.rotation.x += THREE.MathUtils.lerp(0, targetTilt, damp) - upper.rotation.x * (1 - damp) * 0.3;
    },
    reset() {
      moving = false;
      posture = 'stand';
      phase = 0;
      leftLeg.rotation.x = 0;
      rightLeg.rotation.x = 0;
      upper.position.y = 0;
      upper.rotation.x = 0;
      group.position.y = 0;
    },
  };

  return view;
}

function buildUpperGeometry(palette: SoldierPalette, helmet: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (
    geometry: THREE.BufferGeometry,
    color: number,
    position: [number, number, number],
    rotation: [number, number, number] = [0, 0, 0],
  ): void => {
    geometry.rotateX(rotation[0]);
    geometry.rotateY(rotation[1]);
    geometry.rotateZ(rotation[2]);
    geometry.translate(position[0], position[1], position[2]);
    applyVertexColor(geometry, color);
    parts.push(geometry);
  };

  // Torso, belt, shoulder straps, and backpack
  add(new THREE.BoxGeometry(0.46, 0.62, 0.28), palette.uniform, [0, 1.22, 0]);
  add(new THREE.BoxGeometry(0.49, 0.08, 0.3), palette.belt, [0, 0.92, 0]);
  add(new THREE.BoxGeometry(0.055, 0.58, 0.295), palette.belt, [0.13, 1.22, 0.005]);
  add(new THREE.BoxGeometry(0.055, 0.58, 0.295), palette.belt, [-0.13, 1.22, 0.005]);
  add(new THREE.BoxGeometry(0.34, 0.42, 0.18), palette.backpack, [0, 1.22, -0.23]);
  add(new THREE.BoxGeometry(0.28, 0.1, 0.06), palette.belt, [0, 1.0, 0.17]);

  // Arms and hands
  for (const side of [-1, 1]) {
    add(
      new THREE.BoxGeometry(0.14, 0.56, 0.17),
      palette.uniform,
      [side * 0.31, 1.22, 0],
      [0, 0, side * -0.06],
    );
    add(new THREE.SphereGeometry(0.075, 6, 5), palette.skin, [side * 0.33, 0.92, 0.02]);
  }

  // Neck and head
  add(new THREE.CylinderGeometry(0.07, 0.08, 0.1, 6), palette.skin, [0, 1.57, 0]);
  add(new THREE.SphereGeometry(0.16, 8, 6), palette.skin, [0, 1.69, 0]);

  // Headgear
  if (helmet) {
    add(
      new THREE.SphereGeometry(0.19, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      palette.cap,
      [0, 1.72, 0],
    );
    add(new THREE.CylinderGeometry(0.23, 0.23, 0.028, 10), palette.cap, [0, 1.71, 0]);
    add(new THREE.BoxGeometry(0.11, 0.035, 0.035), palette.marker, [0, 1.75, 0.18]);
  } else {
    add(new THREE.CylinderGeometry(0.17, 0.19, 0.13, 8), palette.cap, [0, 1.82, 0]);
    add(
      new THREE.BoxGeometry(0.2, 0.035, 0.14),
      palette.cap,
      [0, 1.77, 0.14],
      [0.12, 0, 0],
    );
    add(
      new THREE.CylinderGeometry(0.045, 0.045, 0.02, 5),
      palette.marker,
      [0, 1.84, 0.175],
      [Math.PI / 2, 0, 0],
    );
    add(new THREE.BoxGeometry(0.155, 0.075, 0.185), palette.marker, [-0.31, 1.34, 0]);
  }

  // Rifle held on the right side
  add(
    new THREE.BoxGeometry(0.05, 0.05, 0.82),
    palette.rifleMetal,
    [0.3, 1.18, 0.28],
    [0.02, 0, 0],
  );
  add(new THREE.BoxGeometry(0.075, 0.1, 0.3), palette.rifleWood, [0.3, 1.15, 0.62]);
  add(
    new THREE.CylinderGeometry(0.018, 0.018, 0.42, 5),
    palette.rifleMetal,
    [0.3, 1.2, 0.78],
    [Math.PI / 2, 0, 0],
  );
  add(new THREE.BoxGeometry(0.035, 0.055, 0.035), palette.rifleMetal, [0.3, 1.24, 0.06]);

  const merged = mergeGeometries(parts, false);
  for (const part of parts) {
    if (part !== merged) part.dispose();
  }
  if (!merged) {
    throw new Error('Unable to merge soldier upper geometry');
  }
  return merged;
}

function buildLegGeometry(palette: SoldierPalette): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (
    geometry: THREE.BufferGeometry,
    color: number,
    position: [number, number, number],
  ): void => {
    geometry.translate(position[0], position[1], position[2]);
    applyVertexColor(geometry, color);
    parts.push(geometry);
  };

  add(new THREE.BoxGeometry(0.16, 0.75, 0.19), palette.trousers, [0, -0.375, 0]);
  add(new THREE.BoxGeometry(0.17, 0.12, 0.2), palette.belt, [0, -0.52, 0]);
  add(new THREE.BoxGeometry(0.2, 0.13, 0.32), palette.boot, [0, -0.8, 0.04]);

  const merged = mergeGeometries(parts, false);
  for (const part of parts) {
    if (part !== merged) part.dispose();
  }
  if (!merged) {
    throw new Error('Unable to merge soldier leg geometry');
  }
  return merged;
}

function applyVertexColor(geometry: THREE.BufferGeometry, color: number): void {
  const position = geometry.getAttribute('position');
  if (!position) return;
  const colors = new Float32Array(position.count * 3);
  const value = new THREE.Color(color);
  for (let i = 0; i < position.count; i += 1) {
    colors[i * 3] = value.r;
    colors[i * 3 + 1] = value.g;
    colors[i * 3 + 2] = value.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}
