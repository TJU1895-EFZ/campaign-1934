import * as THREE from 'three';
import {
  ARTILLERY_SHELL_FLIGHT_SECONDS,
  artilleryShellHeight,
  artilleryShellPosition,
} from '../core/artillery';
import { convoyPositionZ, hasConvoyExited } from '../core/cinematics';
import { MACHINE_GUN_COUNT } from '../core/machineGun';
import type { Collider } from '../core/collision';
import { colliderFromCenter } from '../core/collision';

export interface BridgeBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  deckY: number;
  worldMinZ: number;
  worldMaxZ: number;
}

export interface BattleScene {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  bounds: BridgeBounds;
  redSpawn: THREE.Vector3;
  kmtSpawn: THREE.Vector3;
  machineGun: THREE.Group;
  colliders: Collider[];
  bulletBlockers: THREE.Object3D[];
  update(dt: number): void;
  resize(width: number, height: number): void;
  setPixelRatio(ratio: number): void;
  setMachineGunFiring(firing: boolean): void;
  destroyMachineGun(): void;
  isMachineGunDestroyed(): boolean;
  getMachineGunMuzzlePositions(): THREE.Vector3[];
  launchArtilleryStrike(position: THREE.Vector3, onImpact: () => void): void;
  getActiveArtilleryShellCount(): number;
  startEnemyConvoy(): void;
  isConvoyActive(): boolean;
  dispose(): void;
}

const DECK_Y = 8;
const BRIDGE_HALF_LENGTH = 30;
const BUNKER_WALL_Z = -31.5;
const BUNKER_CENTER_Z = -34;

export function createBattleScene(host: HTMLElement): BattleScene {
  const width = Math.max(1, host.clientWidth || window.innerWidth);
  const height = Math.max(1, host.clientHeight || window.innerHeight);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x121b1e);
  scene.fog = new THREE.FogExp2(0x182326, 0.017);

  const camera = new THREE.PerspectiveCamera(72, width / height, 0.1, 520);
  camera.rotation.order = 'YXZ';
  camera.position.set(0, DECK_Y + 1.65, 73);
  scene.add(camera);

  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(width, height);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  host.appendChild(renderer.domElement);

  const disposables: Array<{ dispose(): void }> = [];
  const colliders: Collider[] = [];
  const bulletBlockers: THREE.Object3D[] = [];
  const track = <T extends { dispose(): void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const assetBase = import.meta.env.BASE_URL;
  const textureLoader = new THREE.TextureLoader();
  const loadTexture = (
    url: string,
    colorSpace: THREE.ColorSpace,
    repeatX: number,
    repeatY: number,
  ): THREE.Texture => {
    const texture = textureLoader.load(url);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.colorSpace = colorSpace;
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return track(texture);
  };

  const woodDiffuse = loadTexture(
    `${assetBase}assets/textures/wooden_planks_diff_1k.jpg`,
    THREE.SRGBColorSpace,
    2,
    2,
  );
  const woodNormal = loadTexture(
    `${assetBase}assets/textures/wooden_planks_nor_gl_1k.jpg`,
    THREE.NoColorSpace,
    2,
    2,
  );
  const woodRoughness = loadTexture(
    `${assetBase}assets/textures/wooden_planks_rough_1k.jpg`,
    THREE.NoColorSpace,
    2,
    2,
  );
  const rustDiffuse = loadTexture(
    `${assetBase}assets/textures/rusty_metal_diff_1k.jpg`,
    THREE.SRGBColorSpace,
    1,
    4,
  );
  const rustNormal = loadTexture(
    `${assetBase}assets/textures/rusty_metal_nor_gl_1k.jpg`,
    THREE.NoColorSpace,
    1,
    4,
  );
  const rustRoughness = loadTexture(
    `${assetBase}assets/textures/rusty_metal_rough_1k.jpg`,
    THREE.NoColorSpace,
    1,
    4,
  );
  const rockDiffuse = loadTexture(
    `${assetBase}assets/textures/dark_rock_diff_1k.jpg`,
    THREE.SRGBColorSpace,
    2,
    2,
  );
  const rockNormal = loadTexture(
    `${assetBase}assets/textures/dark_rock_nor_gl_1k.jpg`,
    THREE.NoColorSpace,
    2,
    2,
  );
  const rockRoughness = loadTexture(
    `${assetBase}assets/textures/dark_rock_rough_1k.jpg`,
    THREE.NoColorSpace,
    2,
    2,
  );

  const hemisphere = new THREE.HemisphereLight(0xa8c2d2, 0x2a2018, 1.55);
  scene.add(hemisphere);
  const moon = new THREE.DirectionalLight(0xffd4a4, 1.75);
  moon.position.set(-24, 38, 18);
  scene.add(moon);
  const fill = new THREE.AmbientLight(0x40515c, 0.65);
  scene.add(fill);
  const bridgeheadFireLight = new THREE.PointLight(0xff7138, 2.2, 34, 2);
  bridgeheadFireLight.position.set(0, 12, BUNKER_CENTER_Z + 1);
  scene.add(bridgeheadFireLight);

  // River
  const waterTexture = track(createWaterTexture());
  const waterMaterial = track(
    new THREE.MeshBasicMaterial({
      map: waterTexture,
      color: 0x8e8774,
      fog: true,
    }),
  );
  const water = new THREE.Mesh(track(new THREE.PlaneGeometry(250, 230)), waterMaterial);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0;
  scene.add(water);

  // Bridge deck base and planks
  const woodMaterial = track(
    new THREE.MeshStandardMaterial({
      map: woodDiffuse,
      normalMap: woodNormal,
      roughnessMap: woodRoughness,
      color: 0x8a7965,
      roughness: 1,
      metalness: 0.04,
    }),
  );
  const plankMaterial = track(
    new THREE.MeshStandardMaterial({
      map: woodDiffuse,
      normalMap: woodNormal,
      roughnessMap: woodRoughness,
      color: 0x9c8468,
      roughness: 1,
      metalness: 0.02,
    }),
  );
  const deck = new THREE.Mesh(
    track(new THREE.BoxGeometry(1.05, 0.14, BRIDGE_HALF_LENGTH * 2)),
    woodMaterial,
  );
  deck.position.y = DECK_Y - 0.02;
  scene.add(deck);

  const instanceDummy = new THREE.Object3D();
  const plankGeometry = track(new THREE.BoxGeometry(2.55, 0.08, 0.4));
  const plankTransforms: Array<{ y: number; z: number; ry: number }> = [];
  for (let i = 0; i < 32; i += 1) {
    if (i % 4 === 2 || i % 11 === 5) continue;
    plankTransforms.push({
      y: DECK_Y + 0.13,
      z: BRIDGE_HALF_LENGTH - i * 1.9,
      ry: (Math.random() - 0.5) * 0.02,
    });
  }
  const planks = new THREE.InstancedMesh(plankGeometry, plankMaterial, plankTransforms.length);
  plankTransforms.forEach((transform, index) => {
    instanceDummy.position.set(0, transform.y, transform.z);
    instanceDummy.rotation.set(0, transform.ry, 0);
    instanceDummy.scale.set(1, 1, 1);
    instanceDummy.updateMatrix();
    planks.setMatrixAt(index, instanceDummy.matrix);
  });
  planks.instanceMatrix.needsUpdate = true;
  scene.add(planks);

  const beamMaterial = track(
    new THREE.MeshStandardMaterial({ color: 0x4d4437, roughness: 0.7, metalness: 0.25 }),
  );
  const beamGeometry = track(new THREE.BoxGeometry(3.05, 0.07, 0.12));
  const beams = new THREE.InstancedMesh(beamGeometry, beamMaterial, 16);
  for (let i = 0; i < 16; i += 1) {
    instanceDummy.position.set(0, DECK_Y - 0.1, BRIDGE_HALF_LENGTH - 1.5 - i * 3.8);
    instanceDummy.rotation.set(0, 0, 0);
    instanceDummy.scale.set(1, 1, 1);
    instanceDummy.updateMatrix();
    beams.setMatrixAt(i, instanceDummy.matrix);
  }
  beams.instanceMatrix.needsUpdate = true;
  scene.add(beams);

  // 13 iron chains: 9 walkway chains and 4 handrail chains
  const chainMaterial = track(
    new THREE.MeshStandardMaterial({
      map: rustDiffuse,
      normalMap: rustNormal,
      roughnessMap: rustRoughness,
      color: 0xb0a89a,
      roughness: 1,
      metalness: 0.62,
    }),
  );
  const makeChainGeometry = (endY: number, middleY: number, radius: number): THREE.TubeGeometry => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, endY, BRIDGE_HALF_LENGTH),
      new THREE.Vector3(0, middleY, 0),
      new THREE.Vector3(0, endY, -BRIDGE_HALF_LENGTH),
    ]);
    return track(new THREE.TubeGeometry(curve, 14, radius, 5, false));
  };

  const bottomChains = new THREE.InstancedMesh(
    makeChainGeometry(DECK_Y + 0.32, DECK_Y - 0.18, 0.028),
    chainMaterial,
    9,
  );
  for (let i = 0; i < 9; i += 1) {
    instanceDummy.position.set(-1.16 + i * 0.29, 0, 0);
    instanceDummy.rotation.set(0, 0, 0);
    instanceDummy.scale.set(1, 1, 1);
    instanceDummy.updateMatrix();
    bottomChains.setMatrixAt(i, instanceDummy.matrix);
  }
  bottomChains.instanceMatrix.needsUpdate = true;
  scene.add(bottomChains);

  const lowerRailGeometry = makeChainGeometry(DECK_Y + 1.32, DECK_Y + 0.94, 0.032);
  const lowerRails = new THREE.InstancedMesh(lowerRailGeometry, chainMaterial, 2);
  [-1.55, 1.55].forEach((x, index) => {
    instanceDummy.position.set(x, 0, 0);
    instanceDummy.rotation.set(0, 0, 0);
    instanceDummy.scale.set(1, 1, 1);
    instanceDummy.updateMatrix();
    lowerRails.setMatrixAt(index, instanceDummy.matrix);
  });
  lowerRails.instanceMatrix.needsUpdate = true;
  scene.add(lowerRails);

  const upperRailGeometry = makeChainGeometry(DECK_Y + 1.68, DECK_Y + 1.3, 0.032);
  const upperRails = new THREE.InstancedMesh(upperRailGeometry, chainMaterial, 2);
  [-1.55, 1.55].forEach((x, index) => {
    instanceDummy.position.set(x, 0, 0);
    instanceDummy.rotation.set(0, 0, 0);
    instanceDummy.scale.set(1, 1, 1);
    instanceDummy.updateMatrix();
    upperRails.setMatrixAt(index, instanceDummy.matrix);
  });
  upperRails.instanceMatrix.needsUpdate = true;
  scene.add(upperRails);

  // Bridge towers
  const stoneMaterial = track(
    new THREE.MeshStandardMaterial({
      map: rockDiffuse,
      normalMap: rockNormal,
      roughnessMap: rockRoughness,
      color: 0x9a9084,
      roughness: 1,
      metalness: 0.03,
    }),
  );
  for (const z of [BRIDGE_HALF_LENGTH + 0.2, -(BRIDGE_HALF_LENGTH + 0.2)]) {
    for (const x of [-2.05, 2.05]) {
      const tower = new THREE.Mesh(track(new THREE.BoxGeometry(1.15, 7.2, 1.15)), stoneMaterial);
      tower.position.set(x, DECK_Y + 3.4, z);
      scene.add(tower);
    }
    const beam = new THREE.Mesh(track(new THREE.BoxGeometry(5.4, 0.48, 0.55)), stoneMaterial);
    beam.position.set(0, DECK_Y + 6.8, z);
    scene.add(beam);
  }

  // Bridgehead platform, sandbags and machine-gun nests
  const platform = new THREE.Mesh(
    track(new THREE.BoxGeometry(16, 0.45, 12)),
    track(new THREE.MeshStandardMaterial({ color: 0x28251f, roughness: 0.95 })),
  );
  platform.position.set(0, DECK_Y, BUNKER_CENTER_Z);
  scene.add(platform);

  // Far-bank bunker: Nationalist soldiers fire from openings, not from the bridge.
  const bunkerMaterial = track(
    new THREE.MeshStandardMaterial({
      map: rockDiffuse,
      normalMap: rockNormal,
      roughnessMap: rockRoughness,
      color: 0x8f8576,
      roughness: 1,
      metalness: 0.02,
    }),
  );
  const bunkerDarkMaterial = track(
    new THREE.MeshStandardMaterial({
      map: woodDiffuse,
      normalMap: woodNormal,
      roughnessMap: woodRoughness,
      color: 0x4b3f32,
      roughness: 1,
      metalness: 0.03,
    }),
  );
  const addBunkerBox = (
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    material: THREE.MeshStandardMaterial,
    rotationY = 0,
  ): void => {
    const mesh = new THREE.Mesh(
      track(new THREE.BoxGeometry(width, height, depth)),
      material,
    );
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotationY;
    scene.add(mesh);
    bulletBlockers.push(mesh);
  };

  // Leave a real central entrance. The front wall is split rather than being
  // a decorative solid box that the player can walk through.
  addBunkerBox(8.4, 1.2, 0.55, -5.8, DECK_Y + 0.6, BUNKER_WALL_Z, bunkerMaterial);
  addBunkerBox(8.4, 1.2, 0.55, 5.8, DECK_Y + 0.6, BUNKER_WALL_Z, bunkerMaterial);
  colliders.push(
    colliderFromCenter(-5.8, BUNKER_WALL_Z, 8.4, 0.8, 1.2),
    colliderFromCenter(5.8, BUNKER_WALL_Z, 8.4, 0.8, 1.2),
  );
  // Angled wings form a shallow arc around the far bridgehead.
  for (const x of [-11, -8.5, 8.5, 11]) {
    const z = BUNKER_WALL_Z + Math.abs(x) * 0.22;
    const rotationY = x < 0 ? -0.32 : 0.32;
    addBunkerBox(3.4, 2.8, 0.7, x, DECK_Y + 1.4, z, bunkerMaterial, rotationY);
    colliders.push(colliderFromCenter(x, z, 3.8, 1.8, 2.8));
  }
  for (const x of [-9, -7, -5, -3, 3, 5, 7, 9]) {
    addBunkerBox(0.55, 3.6, 0.55, x, DECK_Y + 1.8, BUNKER_WALL_Z, bunkerMaterial);
  }
  addBunkerBox(20, 0.5, 0.55, 0, DECK_Y + 3.85, BUNKER_WALL_Z, bunkerMaterial);
  addBunkerBox(20, 0.3, 6.2, 0, DECK_Y + 4.05, BUNKER_CENTER_Z, bunkerDarkMaterial);
  addBunkerBox(0.55, 4.5, 6.5, -9.5, DECK_Y + 2.25, BUNKER_CENTER_Z, bunkerMaterial);
  addBunkerBox(0.55, 4.5, 6.5, 9.5, DECK_Y + 2.25, BUNKER_CENTER_Z, bunkerMaterial);
  colliders.push(
    colliderFromCenter(-9.5, BUNKER_CENTER_Z, 0.8, 6.5, 4.5),
    colliderFromCenter(9.5, BUNKER_CENTER_Z, 0.8, 6.5, 4.5),
  );

  // Roof parapet makes the troops on top visible but still partially covered.
  addBunkerBox(20, 1.0, 0.3, 0, DECK_Y + 4.65, BUNKER_WALL_Z, bunkerMaterial);
  addBunkerBox(20, 1.0, 0.3, 0, DECK_Y + 4.65, BUNKER_CENTER_Z - 2.8, bunkerMaterial);
  addBunkerBox(0.3, 1.0, 6.2, -9.5, DECK_Y + 4.65, BUNKER_CENTER_Z, bunkerMaterial);
  addBunkerBox(0.3, 1.0, 6.2, 9.5, DECK_Y + 4.65, BUNKER_CENTER_Z, bunkerMaterial);

  // Back-wall gate and a short stair corridor into the street, instead of
  // letting the player walk through a solid wall.
  addBunkerBox(8.9, 4.5, 0.55, -5.55, DECK_Y + 2.25, BUNKER_CENTER_Z - 2.4, bunkerMaterial);
  addBunkerBox(8.9, 4.5, 0.55, 5.55, DECK_Y + 2.25, BUNKER_CENTER_Z - 2.4, bunkerMaterial);
  colliders.push(
    colliderFromCenter(-5.55, BUNKER_CENTER_Z - 2.4, 8.9, 0.8, 4.5),
    colliderFromCenter(5.55, BUNKER_CENTER_Z - 2.4, 8.9, 0.8, 4.5),
  );

  const passageFloor = new THREE.Mesh(
    track(new THREE.BoxGeometry(3, 0.2, 6)),
    bunkerDarkMaterial,
  );
  passageFloor.position.set(0, DECK_Y - 0.05, BUNKER_CENTER_Z - 4.4);
  scene.add(passageFloor);

  for (const [index, z] of [-37.4, -38.4, -39.4].entries()) {
    const step = new THREE.Mesh(
      track(new THREE.BoxGeometry(3, 0.14, 0.9)),
      bunkerDarkMaterial,
    );
    step.position.set(0, DECK_Y - 0.02 - index * 0.03, z);
    scene.add(step);
  }

  for (const x of [-1.5, 1.5]) {
    const passageWall = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.35, 3, 6.5)),
      bunkerMaterial,
    );
    passageWall.position.set(x, DECK_Y + 1.5, BUNKER_CENTER_Z - 4.6);
    scene.add(passageWall);
    colliders.push(colliderFromCenter(x, BUNKER_CENTER_Z - 4.6, 0.5, 6.5, 3));
    bulletBlockers.push(passageWall);
  }

  for (const x of [-3.3, 3.3]) {
    addBunkerBox(1.1, 0.4, 0.8, x, DECK_Y + 1.15, BUNKER_WALL_Z - 0.4, bunkerDarkMaterial);
    const barrel = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.035, 0.035, 1.1, 6)),
      bunkerDarkMaterial,
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(x, DECK_Y + 1.35, BUNKER_WALL_Z + 0.15);
    scene.add(barrel);
  }

  // Three heavy machine guns cover the whole bridgehead until the scripted
  // grenade strike in the second charge destroys the emplacement.
  const machineGunGroup = new THREE.Group();
  const machineGunMaterial = track(
    new THREE.MeshStandardMaterial({ color: 0x303638, roughness: 0.48, metalness: 0.68 }),
  );
  const muzzleTexture = track(
    createGlowTexture('rgba(255, 235, 170, 1)', 'rgba(255, 120, 40, 0)'),
  );
  const machineGunUnits: THREE.Group[] = [];
  const machineGunMuzzles: THREE.Sprite[] = [];
  for (let index = 0; index < MACHINE_GUN_COUNT; index += 1) {
    const x = (index - 1) * 5;
    const unit = new THREE.Group();
    const shield = new THREE.Mesh(
      track(new THREE.BoxGeometry(1.15, 0.78, 0.14)),
      machineGunMaterial,
    );
    shield.position.set(0, 0.12, 0.24);
    unit.add(shield);
    const barrel = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.045, 0.045, 1.45, 6)),
      machineGunMaterial,
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.18, 0.9);
    unit.add(barrel);
    const ammoBox = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.42, 0.32, 0.48)),
      bunkerDarkMaterial,
    );
    ammoBox.position.set(0.52, -0.22, 0.02);
    unit.add(ammoBox);
    const muzzle = new THREE.Sprite(
      track(
        new THREE.SpriteMaterial({
          map: muzzleTexture,
          color: 0xffb15c,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      ),
    );
    muzzle.position.set(0, 0.18, 1.68);
    muzzle.scale.setScalar(0.55);
    muzzle.visible = false;
    unit.add(muzzle);
    unit.position.set(x, DECK_Y + 1.3, BUNKER_WALL_Z - 0.35 + Math.abs(x) * 0.08);
    machineGunGroup.add(unit);
    machineGunUnits.push(unit);
    machineGunMuzzles.push(muzzle);
  }
  scene.add(machineGunGroup);

  const destroyedSmokeTexture = track(
    createGlowTexture('rgba(75, 78, 76, 0.65)', 'rgba(20, 22, 22, 0)'),
  );
  const destroyedSmokes = machineGunUnits.map((unit) => {
    const smoke = new THREE.Sprite(
      track(
        new THREE.SpriteMaterial({
          map: destroyedSmokeTexture,
          transparent: true,
          opacity: 0.7,
          depthWrite: false,
        }),
      ),
    );
    smoke.position.copy(unit.position);
    smoke.position.y += 0.4;
    smoke.scale.set(2.8, 2.8, 1);
    smoke.visible = false;
    scene.add(smoke);
    return smoke;
  });

  let machineGunFiring = false;
  let machineGunDestroyed = false;

  const sandbagMaterial = track(
    new THREE.MeshStandardMaterial({ color: 0x6a5e43, roughness: 0.95 }),
  );
  const sandbagGeometry = track(new THREE.CylinderGeometry(0.24, 0.27, 0.5, 7));
  const sandbagTransforms: Array<{ x: number; y: number; z: number; ry: number }> = [];
  for (let i = 0; i < 20; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    sandbagTransforms.push({
      x: side * (2.4 + Math.random() * 2.8),
      y: DECK_Y + 0.25 + (i % 3) * 0.34,
      z: BUNKER_WALL_Z + 0.2 + Math.random() * 1.6,
      ry: Math.random() * 0.4,
    });
  }
  for (let i = 0; i < 10; i += 1) {
    sandbagTransforms.push({
      x: (i % 2 === 0 ? -1 : 1) * (2.2 + Math.random() * 2.4),
      y: DECK_Y + 0.25 + (i % 3) * 0.36,
      z: 27.2 + Math.random() * 1.8,
      ry: Math.random() * 0.5,
    });
  }
  const sandbags = new THREE.InstancedMesh(
    sandbagGeometry,
    sandbagMaterial,
    sandbagTransforms.length,
  );
  sandbagTransforms.forEach((transform, index) => {
    instanceDummy.position.set(transform.x, transform.y, transform.z);
    instanceDummy.rotation.set(0, transform.ry, Math.PI / 2);
    instanceDummy.scale.set(1, 1, 1);
    instanceDummy.updateMatrix();
    sandbags.setMatrixAt(index, instanceDummy.matrix);
  });
  sandbags.instanceMatrix.needsUpdate = true;
  scene.add(sandbags);

  // Red start flag
  const pole = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.035, 0.045, 5, 6)),
    track(new THREE.MeshStandardMaterial({ color: 0x5c4b34, roughness: 0.8 })),
  );
  pole.position.set(3.5, DECK_Y + 2.5, 29);
  scene.add(pole);
  const flag = new THREE.Mesh(
    track(new THREE.PlaneGeometry(1.55, 0.88, 8, 2)),
    track(
      new THREE.MeshStandardMaterial({
        color: 0xa62f27,
        roughness: 0.7,
        side: THREE.DoubleSide,
      }),
    ),
  );
  flag.position.set(4.3, DECK_Y + 4.45, 29);
  scene.add(flag);

  // Cliffs and mountains
  const rockMaterial = track(
    new THREE.MeshStandardMaterial({
      map: rockDiffuse,
      normalMap: rockNormal,
      roughnessMap: rockRoughness,
      color: 0x8a8a86,
      roughness: 1,
      metalness: 0,
    }),
  );
  const mountainMaterial = track(
    new THREE.MeshStandardMaterial({
      map: rockDiffuse,
      normalMap: rockNormal,
      roughnessMap: rockRoughness,
      color: 0x5f6868,
      roughness: 1,
      metalness: 0,
    }),
  );

  // Gorge walls frame the bridge without blocking the central sightline.
  for (const side of [-1, 1]) {
    const cliff = new THREE.Mesh(track(new THREE.BoxGeometry(8, 20, 132)), rockMaterial);
    cliff.position.set(side * 16, 7, 0);
    cliff.rotation.y = side * 0.03;
    scene.add(cliff);

    for (const z of [30, -12, -36]) {
      const shoulder = new THREE.Mesh(
        track(new THREE.ConeGeometry(6, 18, 5)),
        rockMaterial,
      );
      shoulder.position.set(side * (24 + Math.random() * 3), 6, z + Math.random() * 5);
      shoulder.rotation.y = Math.random() * Math.PI;
      scene.add(shoulder);
    }
  }

  const mountainGeometry = track(new THREE.ConeGeometry(1, 1, 5));
  const rockMountainTransforms: Array<{
    x: number;
    y: number;
    z: number;
    radius: number;
    height: number;
    ry: number;
  }> = [];
  const darkMountainTransforms: typeof rockMountainTransforms = [];
  for (let i = 0; i < 16; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const radius = 8 + Math.random() * 8;
    const height = 22 + Math.random() * 32;
    const transform = {
      x: side * (36 + Math.random() * 40),
      y: height / 2 - 2,
      z: -60 + Math.random() * 120,
      radius,
      height,
      ry: Math.random() * Math.PI,
    };
    if (i % 3 === 0) {
      rockMountainTransforms.push(transform);
    } else {
      darkMountainTransforms.push(transform);
    }
  }

  const addMountainInstances = (
    transforms: typeof rockMountainTransforms,
    material: THREE.MeshStandardMaterial,
  ): void => {
    const mesh = new THREE.InstancedMesh(mountainGeometry, material, transforms.length);
    transforms.forEach((transform, index) => {
      instanceDummy.position.set(transform.x, transform.y, transform.z);
      instanceDummy.rotation.set(0, transform.ry, 0);
      instanceDummy.scale.set(transform.radius, transform.height, transform.radius);
      instanceDummy.updateMatrix();
      mesh.setMatrixAt(index, instanceDummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
  };
  addMountainInstances(rockMountainTransforms, rockMaterial);
  addMountainInstances(darkMountainTransforms, mountainMaterial);

  // Wet jungle foliage on the gorge walls, matching the reference material.
  const foliageGeometry = track(new THREE.IcosahedronGeometry(1, 0));
  const foliageMaterials = [
    track(new THREE.MeshStandardMaterial({ color: 0x2d4636, roughness: 1 })),
    track(new THREE.MeshStandardMaterial({ color: 0x3c5942, roughness: 1 })),
  ];
  const foliageTransforms: Array<Array<{
    x: number;
    y: number;
    z: number;
    scale: number;
  }>> = [[], []];
  for (let i = 0; i < 42; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    foliageTransforms[i % 2].push({
      x: side * (18 + Math.random() * 18),
      y: 5 + Math.random() * 14,
      z: -60 + Math.random() * 120,
      scale: 1 + Math.random() * 2.6,
    });
  }
  foliageTransforms.forEach((transforms, materialIndex) => {
    const mesh = new THREE.InstancedMesh(
      foliageGeometry,
      foliageMaterials[materialIndex],
      transforms.length,
    );
    transforms.forEach((transform, index) => {
      instanceDummy.position.set(transform.x, transform.y, transform.z);
      instanceDummy.rotation.set(
        Math.random() * 0.4,
        Math.random() * Math.PI,
        Math.random() * 0.4,
      );
      instanceDummy.scale.setScalar(transform.scale);
      instanceDummy.updateMatrix();
      mesh.setMatrixAt(index, instanceDummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
  });

  // Jungle approach before the bridge.
  const jungleGround = new THREE.Mesh(
    track(new THREE.PlaneGeometry(72, 72)),
    track(new THREE.MeshStandardMaterial({ color: 0x26362b, roughness: 1 })),
  );
  jungleGround.rotation.x = -Math.PI / 2;
  jungleGround.position.set(0, 7.85, 52);
  scene.add(jungleGround);

  const stagingGround = new THREE.Mesh(
    track(new THREE.PlaneGeometry(42, 22)),
    track(new THREE.MeshStandardMaterial({ color: 0x4a4336, roughness: 1 })),
  );
  stagingGround.rotation.x = -Math.PI / 2;
  stagingGround.position.set(0, 7.86, 98);
  scene.add(stagingGround);

  // Several narrow, offset trails instead of one obvious central avenue.
  const pathMaterial = track(
    new THREE.MeshStandardMaterial({ color: 0x4a4336, roughness: 1 }),
  );
  for (const segment of [
    { x: -11, z: 70, width: 2.5, length: 20, rotation: -0.42 },
    { x: 9, z: 68, width: 2.4, length: 18, rotation: 0.48 },
    { x: -7, z: 53, width: 2.2, length: 22, rotation: 0.34 },
    { x: 10, z: 50, width: 2.6, length: 20, rotation: -0.38 },
    { x: -2, z: 37, width: 2.4, length: 15, rotation: 0.2 },
  ]) {
    const path = new THREE.Mesh(
      track(new THREE.PlaneGeometry(segment.width, segment.length)),
      pathMaterial,
    );
    path.rotation.x = -Math.PI / 2;
    path.rotation.z = segment.rotation;
    path.position.set(segment.x, 7.9, segment.z);
    scene.add(path);
  }

  const trunkGeometry = track(new THREE.CylinderGeometry(0.22, 0.35, 4, 5));
  const trunkMaterial = track(
    new THREE.MeshStandardMaterial({ color: 0x3f3328, roughness: 1 }),
  );
  const canopyGeometry = track(new THREE.IcosahedronGeometry(1, 0));
  const canopyMaterial = track(
    new THREE.MeshStandardMaterial({ color: 0x2f4a38, roughness: 1 }),
  );
  const jungleTreeCount = 84;
  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, jungleTreeCount);
  const canopies = new THREE.InstancedMesh(canopyGeometry, canopyMaterial, jungleTreeCount);
  for (let i = 0; i < jungleTreeCount; i += 1) {
    const x = -29 + ((i * 17) % 59) + (Math.random() - 0.5) * 1.2;
    const z = 25 + ((i * 23) % 58) + (Math.random() - 0.5) * 1.2;
    const height = 3 + Math.random() * 3;
    colliders.push(colliderFromCenter(x, z, 0.9, 0.9, height));
    instanceDummy.position.set(x, 8 + height / 2, z);
    instanceDummy.rotation.set(0, Math.random() * Math.PI, 0);
    instanceDummy.scale.set(1, height / 4, 1);
    instanceDummy.updateMatrix();
    trunks.setMatrixAt(i, instanceDummy.matrix);

    const canopyScale = 1.4 + Math.random() * 1.7;
    instanceDummy.position.set(x, 8 + height + 0.6, z);
    instanceDummy.rotation.set(
      Math.random() * 0.3,
      Math.random() * Math.PI,
      Math.random() * 0.3,
    );
    instanceDummy.scale.setScalar(canopyScale);
    instanceDummy.updateMatrix();
    canopies.setMatrixAt(i, instanceDummy.matrix);
  }
  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  scene.add(trunks, canopies);
  bulletBlockers.push(trunks, canopies);

  const bushGeometry = track(new THREE.IcosahedronGeometry(0.8, 0));
  const bushMaterial = track(
    new THREE.MeshStandardMaterial({ color: 0x3a5741, roughness: 1 }),
  );
  const jungleBushCount = 56;
  const bushes = new THREE.InstancedMesh(bushGeometry, bushMaterial, jungleBushCount);
  for (let i = 0; i < jungleBushCount; i += 1) {
    const x = -27 + ((i * 13) % 55) + (Math.random() - 0.5);
    const z = 26 + ((i * 19) % 56) + (Math.random() - 0.5);
    instanceDummy.position.set(x, 8.4, z);
    instanceDummy.rotation.set(0, Math.random() * Math.PI, 0);
    instanceDummy.scale.setScalar(0.6 + Math.random() * 0.9);
    instanceDummy.updateMatrix();
    bushes.setMatrixAt(i, instanceDummy.matrix);
    colliders.push(colliderFromCenter(x, z, 1.3, 1.3, 0.8));
  }
  bushes.instanceMatrix.needsUpdate = true;
  scene.add(bushes);
  bulletBlockers.push(bushes);

  // Street and ruined houses after the bridgehead.
  const streetGround = new THREE.Mesh(
    track(new THREE.PlaneGeometry(64, 96)),
    track(new THREE.MeshStandardMaterial({ color: 0x3c3a35, roughness: 1 })),
  );
  streetGround.rotation.x = -Math.PI / 2;
  streetGround.position.set(0, 7.85, -70);
  scene.add(streetGround);

  const streetMaterial = track(
    new THREE.MeshStandardMaterial({ color: 0x555149, roughness: 1 }),
  );
  for (const segment of [
    { x: 0, z: -48, width: 8, length: 24 },
    { x: 0, z: -60, width: 48, length: 8 },
    { x: -16, z: -71, width: 8, length: 26 },
    { x: 16, z: -71, width: 8, length: 26 },
    { x: 0, z: -83, width: 40, length: 8 },
    { x: 0, z: -96, width: 10, length: 30 },
  ]) {
    const streetPath = new THREE.Mesh(
      track(new THREE.PlaneGeometry(segment.width, segment.length)),
      streetMaterial,
    );
    streetPath.rotation.x = -Math.PI / 2;
    streetPath.position.set(segment.x, 7.9, segment.z);
    scene.add(streetPath);
  }

  const buildingSites = [
    [-27, -44], [-27, -56], [-27, -72], [-27, -88],
    [27, -44], [27, -56], [27, -72], [27, -88],
    [-7, -70], [-7, -94], [7, -70], [7, -94],
    [-17, -101], [17, -101],
  ] as const;
  for (const [x, z] of buildingSites) {
      const height = 3.5 + Math.random() * 2.5;
      const wall = new THREE.Mesh(
        track(new THREE.BoxGeometry(5, height, 6)),
        bunkerMaterial,
      );
      wall.position.set(x, 8 + height / 2, z);
      scene.add(wall);
      colliders.push(colliderFromCenter(x, z, 5, 6, height));
      bulletBlockers.push(wall);

      const roof = new THREE.Mesh(
        track(new THREE.BoxGeometry(5.6, 0.4, 6.6)),
        bunkerDarkMaterial,
      );
      roof.position.set(x, 8 + height + 0.2, z);
      scene.add(roof);
      bulletBlockers.push(roof);

      const windowMesh = new THREE.Mesh(
        track(new THREE.BoxGeometry(0.12, 1.2, 1.2)),
        bunkerDarkMaterial,
      );
      windowMesh.position.set(x + (x < 0 ? 2.56 : -2.56), 9.6, z);
      scene.add(windowMesh);
  }

  const trashMaterial = track(
    new THREE.MeshStandardMaterial({ color: 0x4b4c46, roughness: 0.8, metalness: 0.25 }),
  );
  const trashGeometry = track(new THREE.CylinderGeometry(0.35, 0.4, 0.9, 7));
  for (let i = 0; i < 20; i += 1) {
    const x = -22 + ((i * 11) % 45) + (Math.random() - 0.5) * 1.5;
    const z = -43 - ((i * 17) % 55) + (Math.random() - 0.5) * 1.5;
    const trash = new THREE.Mesh(trashGeometry, trashMaterial);
    trash.position.set(x, 8.45, z);
    scene.add(trash);
    colliders.push(colliderFromCenter(x, z, 0.75, 0.75, 0.9));
    bulletBlockers.push(trash);
  }

  const vehicleMaterial = track(
    new THREE.MeshStandardMaterial({ color: 0x3f4b3a, roughness: 0.82, metalness: 0.2 }),
  );
  const wheelMaterial = track(
    new THREE.MeshStandardMaterial({ color: 0x1d1e1d, roughness: 0.95 }),
  );
  const wheelGeometry = track(new THREE.CylinderGeometry(0.38, 0.38, 0.26, 8));
  for (const [x, z] of [[-10, -58], [13, -62], [-17, -78], [16, -82], [-6, -96], [8, -101]] as const) {
      const body = new THREE.Mesh(
        track(new THREE.BoxGeometry(2.2, 1.5, 4.5)),
        vehicleMaterial,
      );
      body.position.set(x, 8.75, z);
      scene.add(body);
      colliders.push(colliderFromCenter(x, z, 2.3, 4.6, 1.6));
      bulletBlockers.push(body);

      for (const wheelZ of [-1.4, 1.4]) {
        for (const wheelX of [-1.05, 1.05]) {
          const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(x + wheelX, 8.4, z + wheelZ);
          scene.add(wheel);
        }
      }
  }

  for (let i = 0; i < 14; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const rubble = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.6 + Math.random(), 0.3, 0.7 + Math.random())),
      bunkerDarkMaterial,
    );
    rubble.position.set(side * (2.5 + Math.random() * 18), 8.15, -40 - Math.random() * 62);
    rubble.rotation.y = Math.random() * Math.PI;
    scene.add(rubble);
  }

  const convoyGroups: THREE.Group[] = [];
  const convoySoldierMaterial = track(
    new THREE.MeshStandardMaterial({ color: 0x8b7b55, roughness: 0.9 }),
  );
  const startEnemyConvoy = (): void => {
    if (convoyGroups.length > 0) return;
    for (let i = 0; i < 2; i += 1) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(
        track(new THREE.BoxGeometry(2.2, 1.45, 4.5)),
        vehicleMaterial,
      );
      body.position.y = 0.85;
      group.add(body);
      const cab = new THREE.Mesh(
        track(new THREE.BoxGeometry(2.0, 0.9, 1.3)),
        vehicleMaterial,
      );
      cab.position.set(0, 1.75, 1.2);
      group.add(cab);
      for (const wheelZ of [-1.4, 1.4]) {
        for (const wheelX of [-1.05, 1.05]) {
          const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(wheelX, 0.4, wheelZ);
          group.add(wheel);
        }
      }
      for (let s = 0; s < 3; s += 1) {
        const soldier = new THREE.Mesh(
          track(new THREE.BoxGeometry(0.35, 0.9, 0.35)),
          convoySoldierMaterial,
        );
        soldier.position.set(-0.55 + s * 0.55, 1.85, -1.3 + (s % 2) * 0.7);
        group.add(soldier);
      }
      group.position.set(i === 0 ? -2.4 : 2.4, 8, -82 - i * 9);
      group.userData.startZ = group.position.z;
      group.userData.convoyElapsed = 0;
      scene.add(group);
      convoyGroups.push(group);
    }
  };
  const isConvoyActive = (): boolean => convoyGroups.length > 0;

  // Rain
  const rainCount = 760;
  const rainPositions = new Float32Array(rainCount * 3);
  for (let i = 0; i < rainCount; i += 1) {
    rainPositions[i * 3] = (Math.random() - 0.5) * 100;
    rainPositions[i * 3 + 1] = 4 + Math.random() * 36;
    rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 110;
  }
  const rainGeometry = track(new THREE.BufferGeometry());
  rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
  const rainMaterial = track(
    new THREE.PointsMaterial({
      color: 0xa9c7d0,
      size: 0.055,
      transparent: true,
      opacity: 0.46,
      depthWrite: false,
    }),
  );
  const rain = new THREE.Points(rainGeometry, rainMaterial);
  scene.add(rain);

  // Fire and smoke at the far bridgehead
  const glowTexture = track(createGlowTexture('rgba(255, 214, 130, 1)', 'rgba(255, 94, 30, 0.7)'));
  const smokeTexture = track(createGlowTexture('rgba(160, 170, 170, 0.55)', 'rgba(30, 36, 38, 0)'));
  const fireSprites: Array<{ sprite: THREE.Sprite; baseScale: number; phase: number }> = [];
  for (let i = 0; i < 4; i += 1) {
    const material = track(
      new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0xff8e42,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const sprite = new THREE.Sprite(material);
    const baseScale = 1.0 + Math.random() * 1.2;
    sprite.scale.set(baseScale, baseScale, 1);
    const side = i % 2 === 0 ? -1 : 1;
    sprite.position.set(
      side * (5.4 + Math.random() * 1.2),
      DECK_Y + 1.4,
      BUNKER_WALL_Z + 0.7 - Math.random() * 1.4,
    );
    scene.add(sprite);
    fireSprites.push({ sprite, baseScale, phase: Math.random() * Math.PI * 2 });
  }
  const smokeSprites: Array<{ sprite: THREE.Sprite; speed: number; baseY: number }> = [];
  for (let i = 0; i < 5; i += 1) {
    const material = track(
      new THREE.SpriteMaterial({
        map: smokeTexture,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      }),
    );
    const sprite = new THREE.Sprite(material);
    const scale = 4 + Math.random() * 4;
    sprite.scale.set(scale, scale, 1);
    sprite.position.set(-4 + i * 2, DECK_Y + 3.0, BUNKER_CENTER_Z - Math.random() * 2);
    scene.add(sprite);
    smokeSprites.push({ sprite, speed: 0.45 + Math.random() * 0.5, baseY: sprite.position.y });
  }

  const artilleryBursts: Array<{
    fire: THREE.Sprite;
    smoke: THREE.Sprite;
    light: THREE.PointLight;
    life: number;
    maxLife: number;
  }> = [];
  const artilleryShellGeometry = track(new THREE.SphereGeometry(0.18, 6, 5));
  const artilleryShellMaterial = track(
    new THREE.MeshBasicMaterial({ color: 0x272321 }),
  );
  const artilleryShells: Array<{
    shell: THREE.Mesh;
    trail: THREE.Sprite;
    target: THREE.Vector3;
    elapsed: number;
    onImpact: () => void;
    startPos: THREE.Vector3;
  }> = [];

  const spawnArtilleryStrike = (position: THREE.Vector3): void => {
    const fireMaterial = track(
      new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0xff7432,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const fire = new THREE.Sprite(fireMaterial);
    fire.position.copy(position);
    fire.position.y += 1.4;
    fire.scale.set(4.5, 4.5, 1);
    scene.add(fire);

    const smokeMaterial = track(
      new THREE.SpriteMaterial({
        map: smokeTexture,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
      }),
    );
    const smoke = new THREE.Sprite(smokeMaterial);
    smoke.position.copy(position);
    smoke.position.y += 2.2;
    smoke.scale.set(7, 7, 1);
    scene.add(smoke);

    const light = new THREE.PointLight(0xff6a2a, 5, 24, 2);
    light.position.copy(position);
    light.position.y += 2.5;
    scene.add(light);

    artilleryBursts.push({ fire, smoke, light, life: 1.2, maxLife: 1.2 });
  };

  const launchArtilleryStrike = (position: THREE.Vector3, onImpact: () => void): void => {
    const target = position.clone();
    const shell = new THREE.Mesh(artilleryShellGeometry, artilleryShellMaterial);
    scene.add(shell);

    const trailMaterial = track(
      new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0xff9a45,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const trail = new THREE.Sprite(trailMaterial);
    scene.add(trail);

    const pos = artilleryShellPosition(target.x, target.z, target.y, 0);
    shell.position.set(pos.x, pos.y, pos.z);
    trail.position.set(pos.x, pos.y + 0.7, pos.z);

    artilleryShells.push({ shell, trail, target, elapsed: 0, onImpact, startPos: shell.position.clone() });
  };

  const getActiveArtilleryShellCount = (): number => artilleryShells.length;

  let elapsed = 0;
  const rainAttribute = rainGeometry.getAttribute('position') as THREE.BufferAttribute;

  const update = (dt: number): void => {
    elapsed += dt;
    waterTexture.offset.y -= dt * 0.035;
    waterTexture.offset.x += dt * 0.008;

    const positions = rainAttribute.array as Float32Array;
    for (let i = 0; i < rainCount; i += 1) {
      const yIndex = i * 3 + 1;
      positions[yIndex] -= dt * 28;
      if (positions[yIndex] < 1) {
        positions[yIndex] = 38 + Math.random() * 4;
        positions[i * 3] = (Math.random() - 0.5) * 100;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 110;
      }
    }
    rainAttribute.needsUpdate = true;

    for (const item of fireSprites) {
      const flicker = 0.86 + Math.sin(elapsed * 7 + item.phase) * 0.14;
      item.sprite.scale.set(item.baseScale * flicker, item.baseScale * flicker, 1);
      (item.sprite.material as THREE.SpriteMaterial).opacity = 0.65 + flicker * 0.2;
    }
    bridgeheadFireLight.intensity = 1.8 + Math.sin(elapsed * 8.3) * 0.45;

    for (const item of smokeSprites) {
      item.sprite.position.y += item.speed * dt;
      const material = item.sprite.material as THREE.SpriteMaterial;
      material.opacity = Math.max(0, 0.24 - (item.sprite.position.y - item.baseY) * 0.012);
      if (item.sprite.position.y > item.baseY + 9) {
        item.sprite.position.y = item.baseY;
        material.opacity = 0.22;
      }
    }

    for (let i = convoyGroups.length - 1; i >= 0; i -= 1) {
      const group = convoyGroups[i];
      group.userData.convoyElapsed = Number(group.userData.convoyElapsed ?? 0) + dt;
      group.position.z = convoyPositionZ(
        Number(group.userData.startZ ?? group.position.z),
        Number(group.userData.convoyElapsed),
      );
      if (hasConvoyExited(group.position.z)) {
        scene.remove(group);
        convoyGroups.splice(i, 1);
      }
    }

    for (let i = artilleryBursts.length - 1; i >= 0; i -= 1) {
      const burst = artilleryBursts[i];
      burst.life -= dt;
      if (burst.life <= 0) {
        scene.remove(burst.fire, burst.smoke, burst.light);
        artilleryBursts.splice(i, 1);
        continue;
      }
      const t = burst.life / burst.maxLife;
      (burst.fire.material as THREE.SpriteMaterial).opacity = t;
      (burst.smoke.material as THREE.SpriteMaterial).opacity = 0.6 * t;
      burst.light.intensity = 5 * t;
      burst.fire.scale.setScalar(4.5 + (1 - t) * 3);
    }

    for (let i = artilleryShells.length - 1; i >= 0; i -= 1) {
      const item = artilleryShells[i];
      item.elapsed += dt;
      item.shell.position.y = artilleryShellHeight(item.target.y, item.elapsed);
      item.trail.position.copy(item.shell.position);
      item.trail.position.y += 0.7;
      if (item.elapsed < ARTILLERY_SHELL_FLIGHT_SECONDS) continue;

      scene.remove(item.shell, item.trail);
      spawnArtilleryStrike(item.target);
      item.onImpact();
      artilleryShells.splice(i, 1);
    }

    if (machineGunFiring && !machineGunDestroyed) {
      machineGunMuzzles.forEach((muzzle, index) => {
        muzzle.visible = Math.sin(elapsed * 58 + index * 1.7) > -0.05;
      });
    } else {
      machineGunMuzzles.forEach((muzzle) => { muzzle.visible = false; });
    }
    destroyedSmokes.forEach((smoke, index) => {
      if (!smoke.visible) return;
      (smoke.material as THREE.SpriteMaterial).opacity =
        0.45 + Math.sin(elapsed * 3 + index) * 0.12;
    });
  };

  const setMachineGunFiring = (firing: boolean): void => {
    machineGunFiring = firing && !machineGunDestroyed;
    if (!machineGunFiring) {
      machineGunMuzzles.forEach((muzzle) => { muzzle.visible = false; });
    }
  };

  const destroyMachineGun = (): void => {
    if (machineGunDestroyed) return;
    machineGunDestroyed = true;
    machineGunFiring = false;
    machineGunMuzzles.forEach((muzzle) => { muzzle.visible = false; });
    machineGunUnits.forEach((unit, index) => {
      unit.rotation.z = index === 1 ? 0.45 : index === 0 ? -0.32 : 0.32;
      unit.position.y -= 0.18;
    });
    destroyedSmokes.forEach((smoke) => { smoke.visible = true; });
  };

  const isMachineGunDestroyed = (): boolean => machineGunDestroyed;
  const getMachineGunMuzzlePositions = (): THREE.Vector3[] =>
    machineGunMuzzles.map((muzzle) => muzzle.getWorldPosition(new THREE.Vector3()));

  const resize = (nextWidth: number, nextHeight: number): void => {
    const w = Math.max(1, nextWidth);
    const h = Math.max(1, nextHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };

  const setPixelRatio = (ratio: number): void => {
    renderer.setPixelRatio(Math.max(0.5, ratio));
    renderer.setSize(
      Math.max(1, host.clientWidth || width),
      Math.max(1, host.clientHeight || height),
    );
  };

  const dispose = (): void => {
    for (const item of disposables) item.dispose();
    scene.clear();
    renderer.dispose();
    renderer.domElement.remove();
  };

  return {
    scene,
    renderer,
    camera,
    bounds: {
      minX: -1.55,
      maxX: 1.55,
      minZ: -BRIDGE_HALF_LENGTH,
      maxZ: BRIDGE_HALF_LENGTH,
      deckY: DECK_Y,
      worldMinZ: -112,
      worldMaxZ: 108,
    },
    redSpawn: new THREE.Vector3(0, DECK_Y, 73),
    kmtSpawn: new THREE.Vector3(0, DECK_Y, BUNKER_CENTER_Z),
    machineGun: machineGunGroup,
    colliders,
    bulletBlockers,
    update,
    resize,
    setPixelRatio,
    setMachineGunFiring,
    destroyMachineGun,
    isMachineGunDestroyed,
    getMachineGunMuzzlePositions,
    launchArtilleryStrike,
    getActiveArtilleryShellCount,
    startEnemyConvoy,
    isConvoyActive,
    dispose,
  };
}

function createWaterTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) {
    return new THREE.CanvasTexture(canvas);
  }

  context.fillStyle = '#3d3b31';
  context.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i += 1) {
    const y = Math.random() * 256;
    const alpha = 0.035 + Math.random() * 0.09;
    context.strokeStyle = `rgba(170, 174, 146, ${alpha})`;
    context.lineWidth = 1 + Math.random() * 1.5;
    context.beginPath();
    context.moveTo(0, y);
    context.bezierCurveTo(
      64,
      y + (Math.random() - 0.5) * 22,
      192,
      y + (Math.random() - 0.5) * 22,
      256,
      y,
    );
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 10);
  texture.anisotropy = 2;
  return texture;
}

function createGlowTexture(inner: string, outer: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, inner);
    gradient.addColorStop(1, outer);
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(canvas);
}
