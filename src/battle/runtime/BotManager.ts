import * as THREE from 'three';
import {
  BUNKER_ROOF_DEFENDER_COUNT,
  BUNKER_ROOF_DEFENDER_POINTS,
} from '../core/bunker';
import { SHOT_DAMAGE } from '../core/constants';
import { isBlockedAt, type Collider } from '../core/collision';
import {
  chooseSeparatedPoint,
  coverPointsAround,
  type GroundPoint,
} from '../core/positioning';
import type { BattleZone, Faction } from '../core/types';
import {
  createSoldier,
  createSoldierAssets,
  type SoldierAssets,
  type SoldierPosture,
  type SoldierView,
} from '../three/SoldierView';

export interface BotWorld {
  playerPosition: THREE.Vector3;
  playerAlive: boolean;
  playerDowned: boolean;
  damagePlayer(amount: number): void;
  playBotShot(faction: Faction, position: THREE.Vector3): void;
  spawnTracer(from: THREE.Vector3, to: THREE.Vector3): void;
  spawnMuzzleFlash(position: THREE.Vector3): void;
  hasLineOfSight(from: THREE.Vector3, to: THREE.Vector3): boolean;
}

export interface BotManagerOptions {
  scene: THREE.Scene;
  colliders?: Collider[];
  onBotDowned: (bot: Bot, killedByPlayer: boolean) => void;
}

type BotState = 'advance' | 'hold' | 'retreat' | 'downed' | 'falling';

interface BotTarget {
  kind: 'player' | 'bot';
  botId?: string;
}

export class Bot {
  readonly id: string;
  faction: Faction;
  isKey: boolean;
  alive = true;
  hp = 100;
  zone: BattleZone = 'jungle';
  state: BotState = 'advance';
  baseY = 8;
  targetZ = 40;
  laneX = 0;
  speed = 1.4;
  fireTimer = 0;
  retargetTimer = 0;
  dodgeTimer = 0;
  dodgeDir = 1;
  strafeTime = Math.random() * 10;
  burstRemaining = 0;
  burstTimer = 0;
  target: BotTarget | null = null;
  deathTimer = 0;
  inactive = false;
  fallVelocity = 0;
  fallSide = 1;
  lastPositionZ = 0;
  lastPositionX = 0;
  stuckTimer = 0;

  // B2: posture tracking (visual only, no collision change)
  posture: SoldierPosture = 'stand';
  postureTimer = 0;

  readonly group: THREE.Group;
  readonly hitMeshes: THREE.Mesh[];

  private readonly view: SoldierView;

  constructor(id: string, assets: SoldierAssets, faction: Faction, isKey: boolean, position: THREE.Vector3) {
    this.id = id;
    this.faction = faction;
    this.isKey = isKey;

    this.view = createSoldier(assets, faction, isKey);
    this.group = this.view.group;
    this.hitMeshes = [this.view.upper, this.view.leftLeg, this.view.rightLeg];

    for (const mesh of this.hitMeshes) {
      mesh.userData.botId = id;
      mesh.userData.faction = faction;
    }

    this.reset(faction, isKey, position);
  }

  reset(faction: Faction, isKey: boolean, position: THREE.Vector3): void {
    this.faction = faction;
    this.isKey = isKey;
    this.alive = true;
    this.inactive = false;
    this.hp = 100;
    this.state = 'advance';
    this.deathTimer = 0;
    this.fallVelocity = 0;
    this.fallSide = 1;
    this.fireTimer = 0.8 + Math.random() * 1.4;
    this.retargetTimer = Math.random() * 0.8;
    this.dodgeTimer = 0;
    this.dodgeDir = 1;
    this.burstRemaining = 0;
    this.burstTimer = 0;
    this.strafeTime = Math.random() * 10;
    this.target = null;
    // C1: base speed — bridge red bots will be boosted later in zone-specific logic
    this.speed = faction === 'red' ? 1.25 + Math.random() * 0.55 : 0.7 + Math.random() * 0.35;
    this.laneX = (Math.random() - 0.5) * 1.9;
    if (isKey) this.laneX = (Math.random() - 0.5) * 1.2;
    if (faction === 'kmt') this.laneX = (Math.random() - 0.5) * 8;
    this.group.visible = true;
    this.group.position.copy(position);
    this.baseY = position.y;
    this.lastPositionZ = position.z;
    this.lastPositionX = position.x;
    this.stuckTimer = 0;
    this.posture = 'stand';
    this.postureTimer = 0;
    this.group.rotation.set(0, faction === 'red' ? Math.PI : 0, 0);
    this.view.reset();
    this.setPhase(0);
  }

  resetView(): void {
    this.view.reset();
  }

  setPosture(posture: SoldierPosture): void {
    this.posture = posture;
    this.view.setPosture(posture);
  }

  setMoving(moving: boolean): void {
    this.view.setMoving(moving);
  }

  setPhase(phaseIndex: number): void {
    if (this.zone === 'jungle') {
      this.targetZ =
        this.faction === 'red'
          ? 38 + Math.random() * 12 - (this.isKey ? 1.5 : 0)
          : 44 + Math.random() * 12;
    } else if (this.zone === 'street') {
      this.targetZ =
        this.faction === 'red'
          ? -46 - Math.random() * 10 - (this.isKey ? 1.5 : 0)
          : -58 - Math.random() * 14;
    } else if (this.faction === 'red') {
      const targets = [27, 10, -8, -24];
      const spread = [2, 8, 8, 2];
      const base = targets[Math.min(phaseIndex, targets.length - 1)];
      const range = spread[Math.min(phaseIndex, spread.length - 1)];
      this.targetZ = base + Math.random() * range - (this.isKey ? 1.5 : 0);
    } else {
      // Nationalist troops hold inside the far-bank bunker, never on the bridge.
      this.targetZ = -34.5 - Math.random() * 2.5;
    }

    if (this.baseY > 10) {
      // Troops on the bunker roof hold their firing position.
      this.targetZ = this.group.position.z;
      this.state = 'hold';
      return;
    }

    this.state = this.group.position.z > this.targetZ ? 'advance' : 'hold';
  }

  takeDamage(amount: number): boolean {
    if (!this.alive) return false;
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp > 0) {
      this.dodgeTimer = 0.35;
      this.dodgeDir = Math.random() > 0.5 ? 1 : -1;
      this.strafeTime += 0.7;
      return false;
    }

    const onBridge =
      this.zone === 'bridge' &&
      this.group.position.z > -30 &&
      this.group.position.z < 30 &&
      Math.abs(this.group.position.x) < 1.5;
    if (onBridge) {
      const side = this.group.position.x === 0
        ? (Math.random() > 0.5 ? 1 : -1)
        : Math.sign(this.group.position.x);
      this.fallOffBridge(side);
      return true;
    }

    this.view.setMoving(false);
    this.alive = false;
    this.state = 'downed';
    this.deathTimer = 3.2;
    this.group.rotation.z = (Math.random() > 0.5 ? 1 : -1) * (Math.PI / 2);
    this.group.position.y = 8.16;
    return true;
  }

  fallOffBridge(side: number): void {
    if (!this.alive && this.state === 'falling') return;
    this.view.setMoving(false);
    this.alive = false;
    this.hp = 0;
    this.state = 'falling';
    this.deathTimer = 5;
    this.fallSide = side === 0 ? 1 : Math.sign(side);
    this.fallVelocity = 1.5;
    this.group.rotation.z = this.fallSide * 0.3;
  }

  tickDeath(dt: number): void {
    if (this.alive) return;

    if (this.state === 'falling') {
      this.fallVelocity += 16 * dt;
      this.group.position.y -= this.fallVelocity * dt;
      this.group.position.x += this.fallSide * 1.4 * dt;
      this.group.rotation.z += this.fallSide * 1.8 * dt;
      if (this.group.position.y < 0.2 && this.group.visible) {
        this.group.visible = false;
        this.inactive = true;
      }
      return;
    }

    this.deathTimer -= dt;
    if (this.deathTimer <= 0 && this.group.visible) {
      this.group.visible = false;
      this.inactive = true;
    }
  }

  updateMovement(dt: number): void {
    if (!this.alive) return;

    if (this.state === 'retreat') {
      this.view.setMoving(true);
      this.view.update(dt);
      this.group.position.z -= 3.2 * dt;
      if (this.group.position.z < -58) {
        this.group.visible = false;
      }
      return;
    }

    // B2: apply posture speed multiplier (visual only, no collision change)
    const postureMultiplier: Record<SoldierPosture, number> = { stand: 1, crouch: 0.5, prone: 0.25 };
    const effectiveSpeed = this.speed * postureMultiplier[this.posture];

    // B3: decay dodge timer for obstacle avoidance
    if (this.postureTimer > 0) {
      this.postureTimer -= dt;
      if (this.postureTimer <= 0) {
        this.posture = 'stand';
        this.view.setPosture('stand');
      }
    }

    const dz = this.targetZ - this.group.position.z;
    const dx = this.laneX - this.group.position.x;
    const distance = Math.hypot(dx, dz);

    if (Math.abs(dz) > 0.35 && this.state === 'advance') {
      const step = Math.min(Math.abs(dz), effectiveSpeed * dt);
      this.group.position.z += Math.sign(dz) * step;
    } else {
      this.state = 'hold';
    }

    if (Math.abs(dx) > 0.05) {
      this.group.position.x += Math.sign(dx) * Math.min(Math.abs(dx), effectiveSpeed * 0.5 * dt);
    }

    this.strafeTime += dt;
    const maxX = this.zone === 'bridge' ? 1.35 : this.zone === 'jungle' ? 27 : 24;
    if (this.dodgeTimer > 0) {
      this.dodgeTimer -= dt;
      this.group.position.x = THREE.MathUtils.clamp(
        this.group.position.x + this.dodgeDir * 3.2 * dt,
        -maxX,
        maxX,
      );
    } else if (this.state === 'hold') {
      this.group.position.x = THREE.MathUtils.clamp(
        this.group.position.x + Math.sin(this.strafeTime * 1.6) * 0.55 * dt,
        -maxX,
        maxX,
      );
    }

    const moving = distance > 0.4 && this.state === 'advance';
    if (moving) {
      this.stuckTimer = 0;
      const actualDz = this.group.position.z - this.lastPositionZ;
      const actualDx = this.group.position.x - this.lastPositionX;
      const actualDistance = Math.abs(actualDz) + Math.abs(actualDx);
      this.lastPositionZ = this.group.position.z;
      this.lastPositionX = this.group.position.x;
      if (actualDistance < 0.05) {
        this.stuckTimer += dt;
        if (this.stuckTimer >= 0.3) {
          this.view.setMoving(false);
          this.view.update(dt);
          this.group.position.y = this.baseY;
          return;
        }
      }
    } else {
      this.stuckTimer = 0;
    }
    this.view.setMoving(moving);
    this.view.update(dt);
    this.group.position.y = this.baseY;
  }

  dispose(): void {
    for (const mesh of this.hitMeshes) {
      mesh.userData.botId = undefined;
      mesh.userData.faction = undefined;
    }
  }
}

export class BotManager {
  private readonly assets: SoldierAssets;
  private readonly scene: THREE.Scene;
  private readonly colliders: Collider[];
  private readonly onBotDowned: (bot: Bot, killedByPlayer: boolean) => void;
  private readonly bots: Bot[] = [];
  private readonly raycastTargets: THREE.Object3D[] = [];
  private nextId = 1;
  private phaseIndex = 0;
  private zone: BattleZone = 'jungle';
  private kmtAccuracy = 0.2;
  private selfFallTimer = 8 + Math.random() * 8;
  private kmtFireRate = 1;
  private readonly coverPoints: Record<BattleZone, GroundPoint[]>;

  constructor(options: BotManagerOptions) {
    this.assets = createSoldierAssets();
    this.scene = options.scene;
    this.colliders = options.colliders ?? [];
    this.onBotDowned = options.onBotDowned;
    this.coverPoints = {
      jungle: this.createCoverPoints('jungle'),
      bridge: [],
      street: this.createCoverPoints('street'),
    };
  }

  get aliveRed(): number {
    return this.bots.filter((bot) => bot.alive && bot.faction === 'red').length;
  }

  get aliveKmt(): number {
    return this.bots.filter((bot) => bot.alive && bot.faction === 'kmt').length;
  }

  spawn(faction: Faction, count: number, isKey = false): boolean {
    let spawned = 0;
    for (let i = 0; i < count; i += 1) {
      let bot = this.bots.find(
        (candidate) => candidate.inactive && candidate.faction === faction,
      );
      if (!bot) {
        if (this.bots.length >= 60) break;
        bot = new Bot(
          `bot_${this.nextId}`,
          this.assets,
          faction,
          isKey,
          new THREE.Vector3(0, 8, 0),
        );
        this.nextId += 1;
        this.scene.add(bot.group);
        this.bots.push(bot);
      }
      if (!bot) break;
      const position = this.makeSpawnPosition(faction);
      bot.zone = this.zone;
      bot.reset(faction, isKey, position);
      bot.setPhase(this.phaseIndex);
      this.assignCoverTarget(bot);
      spawned += 1;
    }
    this.refreshRaycastTargets();
    return spawned === count;
  }

  setPhase(phaseIndex: number): void {
    this.phaseIndex = phaseIndex;
    this.bots.forEach((bot) => {
      if (!bot.alive) return;
      bot.setPhase(phaseIndex);
      this.assignCoverTarget(bot);
    });
  }

  stageRedFormation(centerZ = 98): void {
    const redBots = this.bots.filter((bot) => bot.alive && bot.faction === 'red');
    redBots.forEach((bot, index) => {
      const row = Math.floor(index / 5);
      const column = index % 5;
      bot.group.position.set((column - 2) * 2.1, 8, centerZ + row * 1.7);
      bot.baseY = 8;
      bot.laneX = bot.group.position.x;
      bot.targetZ = bot.group.position.z;
      bot.state = 'hold';
      bot.group.rotation.y = Math.PI;
      bot.resetView();
    });
  }

  releaseStagingFormation(): void {
    this.setPhase(this.phaseIndex);
  }

  spawnSquad(faction: Faction, count: number): number {
    let spawned = 0;
    for (let i = 0; i < count; i += 1) {
      let bot = this.bots.find(
        (candidate) => candidate.inactive && candidate.faction === faction,
      );
      if (!bot) {
        if (this.bots.length >= 60) break;
        bot = new Bot(
          `bot_${this.nextId}`,
          this.assets,
          faction,
          false,
          new THREE.Vector3(0, 8, 0),
        );
        this.nextId += 1;
        this.scene.add(bot.group);
        this.bots.push(bot);
      }
      const position = this.formationPosition(faction, spawned);
      bot.zone = this.zone;
      bot.reset(faction, false, position);
      bot.setPhase(this.phaseIndex);
      this.assignCoverTarget(bot);
      spawned += 1;
    }
    this.refreshRaycastTargets();
    return spawned;
  }

  setBattleZone(zone: BattleZone): void {
    if (this.zone === zone) return;
    this.zone = zone;

    for (const bot of this.bots) {
      if (!bot.alive) continue;
      bot.zone = zone;
      const position = this.makeSpawnPosition(bot.faction);
      bot.group.position.copy(position);
      bot.baseY = position.y;
      bot.group.rotation.set(0, bot.faction === 'red' ? Math.PI : 0, 0);
      bot.fireTimer = 0.8 + Math.random() * 1.4;
      bot.burstRemaining = 0;
      bot.burstTimer = 0;
      bot.dodgeTimer = 0;
      bot.resetView();
      bot.setPhase(this.phaseIndex);
      this.assignCoverTarget(bot);
    }

    // C1: boost red bot speed on bridge for charging feel
    if (zone === 'bridge') {
      for (const bot of this.bots) {
        if (!bot.alive || bot.faction !== 'red') continue;
        // C1: speed range 3.2–4.0 m/s, capped at 5 m/s effective on bridge
        bot.speed = 3.2 + Math.random() * 0.8;
      }
    }

    this.refreshRaycastTargets();
  }

  setKmtModifiers(accuracy: number, fireRate: number): void {
    this.kmtAccuracy = accuracy;
    this.kmtFireRate = fireRate;
  }

  retreatKmt(): void {
    this.bots.forEach((bot) => {
      if (bot.alive && bot.faction === 'kmt') {
        bot.state = 'retreat';
      }
    });
  }

  hitBot(botId: string, damage: number, source: 'player' | 'bot'): boolean {
    const bot = this.bots.find((candidate) => candidate.id === botId);
    if (!bot || !bot.alive) return false;
    const downed = bot.takeDamage(damage);
    if (downed) {
      this.onBotDowned(bot, source === 'player');
    }
    this.refreshRaycastTargets();
    return true;
  }

  getRaycastTargets(): THREE.Object3D[] {
    return this.raycastTargets;
  }

  repulseFrontRedBots(count: number): number {
    const front = this.bots
      .filter((bot) => bot.alive && bot.faction === 'red')
      .sort((a, b) => a.group.position.z - b.group.position.z)
      .slice(0, Math.max(0, count));

    for (const bot of front) {
      if (bot.takeDamage(1000)) {
        this.onBotDowned(bot, false);
      }
    }
    this.refreshRaycastTargets();
    return front.length;
  }

  /** C2: pull back the frontline bots to show the assault pushing back */
  pushBackFrontline(count: number): void {
    const aliveRed = this.bots
      .filter((bot) => bot.alive && bot.faction === 'red')
      .sort((a, b) => b.group.position.z - a.group.position.z)
      .slice(0, Math.max(0, count));

    for (const bot of aliveRed) {
      const pullBack = 4 + Math.random() * 6;
      bot.targetZ = bot.group.position.z + pullBack;
      bot.state = 'advance'; // will advance back toward new target
    }
  }

  getBots(): readonly Bot[] {
    return this.bots;
  }

  debugTriggerSelfFall(): Bot | null {
    this.selfFallTimer = 0;
    return this.maybeSelfFall(0.1);
  }

  update(dt: number, world: BotWorld): void {
    this.refreshRaycastTargets();

    for (const bot of this.bots) {
      if (!bot.alive) {
        bot.tickDeath(dt);
        continue;
      }
      if (!bot.group.visible) continue;

      const previousX = bot.group.position.x;
      const previousZ = bot.group.position.z;
      bot.updateMovement(dt);
      this.avoidPlayer(bot, world.playerPosition);
      if (isBlockedAt(this.colliders, bot.group.position.x, bot.group.position.z, 1.0, 0.4)) {
        // B3: obstacle dodge — 50% crouch-hide, 50% stand-avoid
        bot.group.position.x = previousX;
        bot.group.position.z = previousZ;
        if (bot.postureTimer <= 0 && bot.alive) {
          if (Math.random() < 0.5) {
            // Crouch behind cover for 0.8–1.5 seconds
            bot.setPosture('crouch');
            bot.postureTimer = 0.8 + Math.random() * 0.7;
          } else {
            // Stand and step around
            bot.dodgeDir = Math.random() > 0.5 ? 1 : -1;
            bot.dodgeTimer = 0.4 + Math.random() * 0.3;
          }
        }
      }
      bot.retargetTimer -= dt;
      if (bot.retargetTimer <= 0 || !this.isTargetValid(bot)) {
        bot.target = this.chooseTarget(bot, world);
        bot.retargetTimer = 0.8 + Math.random() * 1.2;
      }

      if (bot.target) {
        if (bot.burstRemaining > 0) {
          bot.burstTimer -= dt;
          if (bot.burstTimer <= 0) {
            this.fireAtTarget(bot, world);
            bot.burstRemaining -= 1;
            bot.burstTimer = 0.14 + Math.random() * 0.05;
            if (bot.burstRemaining <= 0) {
              const base =
                bot.faction === 'kmt' ? 1.6 / Math.max(0.3, this.kmtFireRate) : 1.7;
              bot.fireTimer = base * (0.75 + Math.random() * 0.5);
            }
          }
        } else {
          bot.fireTimer -= dt;
          if (bot.fireTimer <= 0) {
            bot.burstRemaining = 3 + Math.floor(Math.random() * 3);
            bot.burstTimer = 0;
          }
        }
      }
    }

    this.applyBridgePostureDistribution(dt);
    this.maybeSelfFall(dt);
  }

  /** B4: bridge mixed pace — 2/3 running, 1/3 crawling on bridge */
  private applyBridgePostureDistribution(_dt: number): void {
    if (this.zone !== 'bridge') return;
    const redBots = this.bots.filter((bot) => bot.alive && bot.faction === 'red' && bot.group.visible);
    const runningCount = Math.floor(redBots.length * (2 / 3));
    let assigned = 0;
    for (const bot of redBots) {
      if (bot.postureTimer > 0) continue; // respect B3 dodge
      if (assigned < runningCount) {
        bot.setPosture('stand');
      } else {
        bot.setPosture('prone');
      }
      assigned += 1;
    }
  }

  private maybeSelfFall(dt: number): Bot | null {
    this.selfFallTimer -= dt;
    if (this.selfFallTimer > 0) return null;
    this.selfFallTimer = 9 + Math.random() * 10;
    if (this.phaseIndex < 1 || this.zone !== 'bridge') return null;

    const candidates = this.bots.filter(
      (bot) =>
        bot.alive &&
        bot.faction === 'red' &&
        !bot.isKey &&
        bot.group.position.z > -30 &&
        bot.group.position.z < 30 &&
        Math.abs(bot.group.position.x) < 1.4,
    );
    if (candidates.length === 0) return null;

    const bot = candidates[Math.floor(Math.random() * candidates.length)];
    bot.fallOffBridge(Math.random() > 0.5 ? 1 : -1);
    this.onBotDowned(bot, false);
    this.refreshRaycastTargets();
    return bot;
  }

  dispose(): void {
    for (const bot of this.bots) {
      this.scene.remove(bot.group);
      bot.dispose();
    }
    this.bots.length = 0;
    this.raycastTargets.length = 0;
    this.assets.dispose();
  }

  private avoidPlayer(bot: Bot, playerPosition: THREE.Vector3): void {
    if (bot.faction !== 'red') return;
    const dx = bot.group.position.x - playerPosition.x;
    const dz = bot.group.position.z - playerPosition.z;
    if (Math.hypot(dx, dz) >= 1.55) return;

    const parity = Number(bot.id.split('_')[1] ?? 1) % 2 === 0 ? 1 : -1;
    const side = Math.abs(dx) > 0.08 ? Math.sign(dx) : parity;
    const maxX = this.zone === 'bridge' ? 1.95 : this.zone === 'jungle' ? 27 : 24;
    bot.group.position.x = THREE.MathUtils.clamp(
      playerPosition.x + side * 1.7,
      -maxX,
      maxX,
    );
  }

  private fireAtTarget(bot: Bot, world: BotWorld): void {
    if (!bot.target) return;
    const accuracy = bot.faction === 'kmt' ? this.kmtAccuracy : 0.2;
    const hit = Math.random() < accuracy;
    const origin = bot.group.position.clone();
    origin.y += 1.2;
    let targetPoint = origin.clone().add(new THREE.Vector3(0, 0, -24));
    let targetBot: Bot | null = null;

    if (bot.target.kind === 'player') {
      targetPoint = world.playerPosition.clone();
      targetPoint.y += 1.4;
    } else if (bot.target.botId) {
      targetBot = this.bots.find((candidate) => candidate.id === bot.target?.botId) ?? null;
      if (targetBot) {
        targetPoint = targetBot.group.position.clone();
        targetPoint.y += 1.2;
      }
    }

    if (!world.hasLineOfSight(origin, targetPoint)) {
      return;
    }

    if (bot.target.kind === 'player') {
      if (hit && world.playerAlive) {
        world.damagePlayer(SHOT_DAMAGE);
      }
    } else if (targetBot && targetBot.alive && hit) {
      this.hitBot(targetBot.id, SHOT_DAMAGE, 'bot');
    }

    world.spawnTracer(origin, targetPoint);
    world.spawnMuzzleFlash(origin);
    world.playBotShot(bot.faction, bot.group.position);
  }

  private chooseTarget(bot: Bot, world: BotWorld): BotTarget | null {
    if (bot.faction === 'red') {
      const candidate = this.nearestBot(bot, 'kmt');
      return candidate ? { kind: 'bot', botId: candidate.id } : null;
    }

    if (world.playerAlive && !world.playerDowned && Math.random() < 0.22) {
      const distance = bot.group.position.distanceTo(world.playerPosition);
      if (distance < 55) {
        return { kind: 'player' };
      }
    }

    const candidate = this.nearestBot(bot, 'red');
    return candidate ? { kind: 'bot', botId: candidate.id } : null;
  }

  private nearestBot(bot: Bot, faction: Faction): Bot | null {
    let nearest: Bot | null = null;
    let nearestDistance = Infinity;
    for (const candidate of this.bots) {
      if (!candidate.alive || candidate.faction !== faction || candidate === bot) continue;
      const distance = candidate.group.position.distanceTo(bot.group.position);
      if (distance < nearestDistance) {
        nearest = candidate;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  private isTargetValid(bot: Bot): boolean {
    if (!bot.target) return false;
    if (bot.target.kind === 'player') return true;
    const target = this.bots.find((candidate) => candidate.id === bot.target?.botId);
    return Boolean(target && target.alive);
  }

  private formationPosition(faction: Faction, index: number): THREE.Vector3 {
    const rearZ = faction === 'red'
      ? this.zone === 'jungle' ? 82 : this.zone === 'bridge' ? 28.8 : -40
      : this.zone === 'jungle' ? 28 : this.zone === 'bridge' ? -39.5 : -106;
    const columns =
      this.zone === 'bridge' ? [-1.2, -0.4, 0.4, 1.2] : [-4.5, -1.5, 1.5, 4.5];
    const row = Math.floor(index / 4);
    const column = index % 4;
    return new THREE.Vector3(columns[column], 8, rearZ - row * 1.1);
  }

  private makeSpawnPosition(faction: Faction): THREE.Vector3 {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const candidate = this.randomSpawnPosition(faction);
      const clear =
        !isBlockedAt(this.colliders, candidate.x, candidate.z, 1.0, 0.4) &&
        this.bots.every(
          (bot) =>
            !bot.alive ||
            !bot.group.visible ||
            bot.group.position.distanceTo(candidate) > 2.2,
        );
      if (clear) return candidate;
    }
    return this.randomSpawnPosition(faction);
  }

  private randomSpawnPosition(faction: Faction): THREE.Vector3 {
    if (this.zone === 'jungle') {
      if (faction === 'red') {
        return new THREE.Vector3((Math.random() - 0.5) * 48, 8, 68 + Math.random() * 18);
      }
      return new THREE.Vector3((Math.random() - 0.5) * 52, 8, 36 + Math.random() * 28);
    }

    if (this.zone === 'street') {
      if (faction === 'red') {
        return new THREE.Vector3((Math.random() - 0.5) * 42, 8, -40 - Math.random() * 20);
      }
      return new THREE.Vector3((Math.random() - 0.5) * 46, 8, -60 - Math.random() * 28);
    }

    if (faction === 'red') {
      const lane = (Math.random() - 0.5) * 1.7;
      return new THREE.Vector3(lane, 8, 27.5 + Math.random() * 2.0);
    }
    // KMT bunker defenders: distribute across the 6 roof positions.
    const roofBots = this.bots.filter(
      (bot) => bot.alive && bot.faction === 'kmt' && bot.zone === 'bridge' && bot.baseY > 10,
    );
    if (roofBots.length < BUNKER_ROOF_DEFENDER_COUNT) {
      const occupiedPositions = new Set(
        roofBots.map((bot) => Math.round(bot.group.position.x * 10)),
      );
      for (const point of BUNKER_ROOF_DEFENDER_POINTS) {
        if (!occupiedPositions.has(Math.round(point.x * 10))) {
          return new THREE.Vector3(point.x, point.y, point.z);
        }
      }
    }
    return new THREE.Vector3((Math.random() - 0.5) * 8, 8, -33 - Math.random() * 4);
  }

  private refreshRaycastTargets(): void {
    this.raycastTargets.length = 0;
    for (const bot of this.bots) {
      if (!bot.alive || !bot.group.visible) continue;
      this.raycastTargets.push(...bot.hitMeshes);
    }
  }

  private createCoverPoints(zone: BattleZone): GroundPoint[] {
    const points: GroundPoint[] = [];
    for (const collider of this.colliders) {
      const centerZ = (collider.minZ + collider.maxZ) / 2;
      const inZone =
        zone === 'jungle'
          ? centerZ >= 30
          : zone === 'street'
            ? centerZ <= -39
            : centerZ > -39 && centerZ < 30;
      if (!inZone) continue;
      points.push(...coverPointsAround(collider, 1.1));
    }
    return points;
  }

  private assignCoverTarget(bot: Bot): void {
    if (bot.zone === 'bridge') return;
    const candidates = this.coverPoints[bot.zone].filter((point) => {
      if (bot.zone === 'jungle') {
        return bot.faction === 'red' ? point.z >= 38 && point.z <= 68 : point.z >= 34 && point.z <= 62;
      }
      return bot.faction === 'red'
        ? point.z <= -55 && point.z >= -92
        : point.z <= -70;
    });
    const occupied = this.bots
      .filter((candidate) => candidate !== bot && candidate.alive && candidate.zone === bot.zone)
      .map((candidate) => ({ x: candidate.laneX, z: candidate.targetZ }));
    const numericId = Number(bot.id.split('_')[1] ?? 0);
    const point = chooseSeparatedPoint(
      candidates,
      occupied,
      3.6,
      numericId * 7 + this.phaseIndex * 11,
    );
    if (!point) return;
    bot.laneX = point.x;
    bot.targetZ = point.z;
    bot.state = 'advance';
  }
}
