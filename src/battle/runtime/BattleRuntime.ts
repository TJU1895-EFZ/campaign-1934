import * as THREE from 'three';
import type { BattleSummary } from '../../app/AppState';
import type { Settings } from '../../utils/storage';
import { NARRATION } from '../../content/narration';
import { PHASES } from '../../content/phases';
import { BattleDirector } from '../core/BattleDirector';
import { BattleStats } from '../core/BattleStats';
import {
  artilleryDamageAt,
  isInArtilleryBlast,
  nextArtilleryInterval,
} from '../core/artillery';
import { STAGING_DURATION_SECONDS } from '../core/cinematics';
import { frontlineEscalation, isOutOfFrontline } from '../core/frontline';
import { MACHINE_GUN_DAMAGE, advanceAutomaticFire } from '../core/machineGun';
import { PLAYER_MAX_HP, SHOT_DAMAGE } from '../core/constants';
import type { BattleSnapshot, BattleZone, Faction } from '../core/types';
import { createBattleScene, type BattleScene } from '../three/SceneFactory';
import { AudioManager } from './AudioManager';
import { BotManager, type Bot, type BotWorld } from './BotManager';
import { HUD } from './HUD';
import { NarrationPlayer } from './NarrationPlayer';
import { PlayerController } from './PlayerController';
import { TracerSystem } from './TracerSystem';
import { WeaponSystem } from './WeaponSystem';

export interface BattleRuntimeOptions {
  settings: Settings;
  onVictory: (summary: BattleSummary) => void;
  onExit: () => void;
  onRestart: () => void;
  onError: (message: string) => void;
  onSettingsChange: (settings: Settings) => void;
}

export class BattleRuntime {
  private readonly host: HTMLElement;
  private readonly options: BattleRuntimeOptions;
  private readonly battleScene: BattleScene;
  private readonly tracers: TracerSystem;
  private readonly player: PlayerController;
  private readonly weapon: WeaponSystem;
  private readonly bots: BotManager;
  private readonly hud: HUD;
  private readonly audio: AudioManager;
  private readonly narration: NarrationPlayer;
  private readonly director: BattleDirector;
  private readonly stats = new BattleStats();
  private readonly world: BotWorld;
  private settings: Settings;
  private readonly debugEnabled: boolean;

  private paused = false;
  private ended = false;
  private disposed = false;
  private rafId = 0;
  private lastTime = 0;
  private fps = 0;
  private fpsAccumulator = 0;
  private fpsFrames = 0;
  private machineGunTimer: number | null = null;
  private machineGunFireTimer = 0;
  private machineGunShotIndex = 0;
  private currentZone: BattleZone | null = null;
  private artilleryTimer = nextArtilleryInterval(Math.random());
  private frontlineTimer = 0;
  private frontlineReinforced = false;
  private frontlineStrikeLaunched = false;
  private battleStarted = false;
  private stagingEndsAt = performance.now() + STAGING_DURATION_SECONDS * 1000;
  private pendingNarration: string | null = null;
  private readonly maxPixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  private pixelRatio = this.maxPixelRatio;
  private lowFpsWindows = 0;
  private highFpsWindows = 0;
  private victoryTimer: number | null = null;

  // D2: bunker→street transition cutscene state
  private d2TransitionActive = false;
  private d2TransitionEndsAt = 0;
  private d2ChargeBots: Bot[] = [];
  private d2VocalPlayed = false;

  constructor(host: HTMLElement, options: BattleRuntimeOptions) {
    this.host = host;
    this.options = options;
    this.settings = { ...options.settings };
    this.debugEnabled =
      import.meta.env.DEV && new URLSearchParams(window.location.search).get('debug') === '1';

    this.battleScene = createBattleScene(host);
    this.battleScene.setPixelRatio(this.pixelRatio);
    this.tracers = new TracerSystem(this.battleScene.scene);
    this.audio = new AudioManager(this.settings);
    this.narration = new NarrationPlayer(this.settings, {
      onLineStart: (text) => this.hud.setSubtitle(text),
      onLineEnd: () => this.hud.hideSubtitle(),
    });

    this.hud = new HUD(host, {
      settings: this.settings,
      onResume: () => this.resume(),
      onRestart: () => this.restart(),
      onExit: () => this.exit(),
      onSettingsChange: (settings) => this.updateSettings(settings),
      onDebugSkip: () => this.director.debugSkipPhase(),
      onDebugVictory: () => this.forceVictory(),
    });
    this.hud.setDebugEnabled(this.debugEnabled);

    this.bots = new BotManager({
      scene: this.battleScene.scene,
      colliders: this.battleScene.colliders,
      onBotDowned: (bot, killedByPlayer) => this.handleBotDowned(bot, killedByPlayer),
    });

    this.player = new PlayerController(
      this.battleScene.camera,
      this.battleScene.renderer.domElement,
      this.battleScene.bounds,
      this.battleScene.colliders,
      this.battleScene.redSpawn,
      {
        onTriggerDown: () => this.weapon.setTrigger(true),
        onTriggerUp: () => this.weapon.setTrigger(false),
        onReload: () => this.weapon.reload(),
        onDamage: () => {
          this.hud.showDamage();
          this.audio.playDamage();
        },
        onDown: (reason) => this.handlePlayerDown(reason),
        onRespawn: () => this.handlePlayerRespawn(),
        onPauseRequest: () => this.pause(),
        onLockChange: (locked) => this.hud.setLocked(locked),
        onFootstep: () => this.audio.playFootstep(),
      },
    );

    this.weapon = new WeaponSystem(
      this.battleScene.camera,
      () => this.bots.getRaycastTargets(),
      () => this.battleScene.bulletBlockers,
      this.tracers,
      {
        onShot: () => {
          this.stats.recordShot();
          this.audio.playRifle();
        },
        onHit: (botId) => {
          this.stats.recordHit();
          this.bots.hitBot(botId, SHOT_DAMAGE, 'player');
          this.hud.showHitMarker();
          this.audio.playRicochet();
        },
        onAmmoChange: () => undefined,
      },
    );

    this.world = {
      playerPosition: new THREE.Vector3(),
      playerAlive: true,
      playerDowned: false,
      damagePlayer: (amount) => this.player.takeDamage(amount),
      playBotShot: (_faction: Faction, position: THREE.Vector3) => {
        if (Math.random() < 0.22) {
          const dx = position.x - this.player.position.x;
          this.audio.playDistantShot(THREE.MathUtils.clamp(dx / 8, -1, 1));
        }
      },
      spawnTracer: (from: THREE.Vector3, to: THREE.Vector3) => {
        this.tracers.spawn(from, to);
      },
      spawnMuzzleFlash: (position: THREE.Vector3) => {
        this.tracers.spawnMuzzleFlash(position);
      },
      hasLineOfSight: (from: THREE.Vector3, to: THREE.Vector3) => {
        const direction = to.clone().sub(from);
        const distance = direction.length();
        if (distance < 0.01) return true;
        const raycaster = new THREE.Raycaster(
          from,
          direction.normalize(),
          0.05,
          Math.max(0.05, distance - 0.35),
        );
        return (
          raycaster.intersectObjects(this.battleScene.bulletBlockers, false).length === 0
        );
      },
    };

    this.director = new BattleDirector(PHASES, {
      spawn: (faction, count, key) => this.bots.spawn(faction, count, key),
      spawnSquad: (faction, count) => this.bots.spawnSquad(faction, count),
      onPhase: (phase, index) => this.handlePhase(phase.name, phase.narrationId, index),
      onModifiers: (accuracy, fireRate) => this.bots.setKmtModifiers(accuracy, fireRate),
      onRetreatKmt: () => this.bots.retreatKmt(),
      onVictory: () => this.handleVictory(),
    });

    this.player.setEnabled(false);
    this.weapon.setEnabled(false);
    this.hud.showStaging(STAGING_DURATION_SECONDS);
    this.resize();
    window.addEventListener('resize', this.handleResize);
    this.host.addEventListener('pointerdown', this.handleFirstPointer, { once: true });
    this.host.addEventListener('click', this.handleFirstPointer, { once: true });

    if (this.debugEnabled) {
      (window as unknown as { __battleDebug?: unknown }).__battleDebug = {
        scene: this.battleScene.scene,
        camera: this.battleScene.camera,
        renderer: this.battleScene.renderer,
        player: this.player,
        weapon: this.weapon,
        bots: this.bots,
        director: this.director,
        machineGunDestroyed: () => this.battleScene.isMachineGunDestroyed(),
        battleStarted: () => this.battleStarted,
        convoyActive: () => this.battleScene.isConvoyActive(),
        activeArtilleryShells: () => this.battleScene.getActiveArtilleryShellCount(),
      };
    }
  }

  start(): void {
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    if (this.victoryTimer !== null) window.clearTimeout(this.victoryTimer);
    this.victoryTimer = null;
    if (this.machineGunTimer !== null) window.clearTimeout(this.machineGunTimer);
    this.machineGunTimer = null;
    window.removeEventListener('resize', this.handleResize);
    this.host.removeEventListener('pointerdown', this.handleFirstPointer);
    this.host.removeEventListener('click', this.handleFirstPointer);
    this.narration.dispose();
    this.hud.dispose();
    this.weapon.dispose();
    this.player.dispose();
    this.bots.dispose();
    this.tracers.dispose();
    this.audio.dispose();
    this.battleScene.dispose();
  }

  private loop = (now: number): void => {
    if (this.disposed) return;
    const dt = Math.min(0.05, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;

    if (!this.paused && !this.ended) {
      if (!this.battleStarted) {
        const remaining = Math.max(0, (this.stagingEndsAt - performance.now()) / 1000);
        this.hud.updateStaging(remaining);
        this.battleScene.update(dt);
        this.tracers.update(dt);
        this.updateFps(dt);
        if (remaining <= 0) {
          this.beginBattle();
        }
      } else if (this.d2TransitionActive) {
        // D2: run transition cutscene instead of normal phase logic
        this.updateD2Transition(dt);
        this.battleScene.update(dt);
        this.tracers.update(dt);
        this.updateFps(dt);
      } else {
        this.director.update(dt);
        this.player.update(dt);
        this.world.playerPosition.copy(this.player.position);
        this.world.playerAlive = this.player.isAlive;
        this.world.playerDowned = this.player.isDowned;
        this.bots.update(dt, this.world);
        this.updateMachineGuns(dt);
        this.weapon.update(dt);
        this.battleScene.update(dt);
        this.tracers.update(dt);
        this.updateArtillery(dt);
        this.updateFrontline(dt);
        this.updateFps(dt);
      }
    } else if (!this.paused && this.ended) {
      // Continue environmental animation for the five-second closing shot.
      this.battleScene.update(dt);
      this.tracers.update(dt);
    }

    this.battleScene.renderer.render(this.battleScene.scene, this.battleScene.camera);
    this.updateHud();
    this.rafId = requestAnimationFrame(this.loop);
  };

  private updateHud(): void {
    const director = this.director.snapshot;
    const weapon = this.weapon.state;
    const snapshot: BattleSnapshot = {
      phaseName: director.phaseName,
      objective: director.objective,
      playerHp: this.player.hp,
      playerMaxHp: PLAYER_MAX_HP,
      ammoMag: weapon.mag,
      ammoReserve: weapon.reserve,
      reloading: weapon.reloading,
      paused: this.paused,
      downed: this.player.isDowned,
      downSecondsLeft: this.player.downSecondsLeft,
    };
    this.hud.update(snapshot);

    if (this.debugEnabled) {
      this.hud.updateDebug({
        phase: `${director.phaseIndex + 1}/4 ${director.phaseName}`,
        fps: `${this.fps} @${this.pixelRatio.toFixed(2)}`,
        drawCalls: this.battleScene.renderer.info.render.calls,
        accuracy: director.accuracy,
        fireRate: director.fireRate,
      });
    }
  }

  private handlePhase(phaseName: string, narrationId: string, index: number): void {
    // D2: intercept phase 3→4 transition to insert charge cutscene
    if (index === 3 && this.battleStarted && !this.d2TransitionActive) {
      this.startD2Transition(narrationId);
      return;
    }

    const phaseConfig = PHASES[index];
    if (phaseConfig && this.currentZone !== phaseConfig.zone) {
      this.currentZone = phaseConfig.zone;
      this.bots.setBattleZone(phaseConfig.zone);
      const spawnZ =
        phaseConfig.zone === 'jungle' ? 73 : phaseConfig.zone === 'bridge' ? 26 : -38;
      const actualSpawnZ = !this.battleStarted && index === 0 ? 96 : spawnZ;
      this.player.setSpawnPoint(0, actualSpawnZ);
      this.player.teleportTo(0, actualSpawnZ);
    }
    this.bots.setPhase(index);
    if (!this.battleStarted && index === 0) {
      this.bots.stageRedFormation(98);
    }
    if (index === 2) {
      // C2: First assault failed — show squad-level collapse + pushback.
      // Kill front bots in groups of 3–4, then pull the line back.
      this.bots.repulseFrontRedBots(5);
      // Pull back visible bots to show the line retreating
      this.bots.pushBackFrontline(8);
    }
    const text = NARRATION[narrationId];
    if (text) {
      if (this.battleStarted) {
        this.narration.speak(text);
      } else {
        this.pendingNarration = text;
      }
    }
    this.audio.playUi();
    if (this.battleStarted) {
      this.hud.setSubtitle(text ?? phaseName);
    } else {
      this.hud.setSubtitle('部队集结，等待号角。');
    }

    if (index < 2) {
      this.battleScene.setMachineGunFiring(true);
    } else if (index === 2) {
      this.battleScene.setMachineGunFiring(true);
      if (this.machineGunTimer === null) {
        this.machineGunTimer = window.setTimeout(() => {
          this.machineGunTimer = null;
          this.battleScene.destroyMachineGun();
          this.audio.playExplosion();
          this.bots.setKmtModifiers(0.14, 0.7);
          this.hud.setSubtitle('红军突击队员用手榴弹炸毁了碉堡机枪，突击队趁势冲上桥头。');
        }, 2200);
      }
    } else {
      this.battleScene.setMachineGunFiring(false);
    }
  }

  /** D2: bunker→street charge transition — 2–4 red bots charge into street, main force follows */
  private startD2Transition(narrationId: string): void {
    this.d2TransitionActive = true;
    this.d2TransitionEndsAt = performance.now() + 8000; // 8 seconds mid-range of 6–10s
    this.d2VocalPlayed = false;

    // Disable desync penalty during cutscene
    this.player.setEnabled(false);
    this.weapon.setEnabled(false);

    // Pick 2–4 charge bots from front-line red bots
    const aliveRed = this.bots.getBots().filter(
      (bot) => bot.alive && bot.faction === 'red' && bot.group.visible,
    );
    const chargeCount = 2 + Math.floor(Math.random() * 3); // 2–4
    aliveRed.sort((a, b) => b.group.position.z - a.group.position.z);
    this.d2ChargeBots = aliveRed.slice(0, chargeCount);

    // Move charge bots to bridge edge and set them charging into street
    for (const bot of this.d2ChargeBots) {
      bot.group.position.set(
        (Math.random() - 0.5) * 1.5,
        8,
        28 + Math.random() * 2,
      );
      bot.targetZ = -50 - Math.random() * 10;
      bot.speed = 4.5; // sprint speed
      bot.state = 'advance';
    }

    // Pull back remaining red bots to staging position
    for (const bot of aliveRed) {
      if (this.d2ChargeBots.includes(bot)) continue;
      bot.group.position.z = Math.min(bot.group.position.z, 20);
      bot.targetZ = bot.group.position.z + 5;
      bot.state = 'advance';
    }

    this.hud.setSubtitle('突击队员冲出碉堡火力网，向街巷纵深突进！');
    this.pendingNarration = NARRATION[narrationId] ?? null;
  }

  private updateD2Transition(dt: number): void {
    if (!this.d2TransitionActive) return;

    const now = performance.now();
    if (now >= this.d2TransitionEndsAt) {
      // End cutscene: proceed to phase 4 normally
      this.d2TransitionActive = false;
      this.d2ChargeBots = [];
      this.d2VocalPlayed = false;

      // Advance to phase 4
      const nextIndex = this.director.phaseIndex + 1;
      if (nextIndex < PHASES.length) {
        this.handlePhase(
          PHASES[nextIndex].name,
          PHASES[nextIndex].narrationId,
          nextIndex,
        );
      }
      return;
    }

    // Update charge bots movement during cutscene
    for (const bot of this.d2ChargeBots) {
      if (!bot.alive) continue;
      const dz = bot.targetZ - bot.group.position.z;
      if (Math.abs(dz) > 0.35) {
        bot.group.position.z += Math.sign(dz) * Math.min(Math.abs(dz), bot.speed * dt);
      }
      // Animate them moving
      bot.setMoving(true);
    }

    // Play vocal cue at start of transition
    if (!this.d2VocalPlayed && now - this.d2TransitionEndsAt + 8000 < 1500) {
      this.d2VocalPlayed = true;
      this.audio.playHorn();
    }
  }

  private handleBotDowned(bot: Bot, killedByPlayer: boolean): void {
    this.director.notifyDowned(bot.faction, bot.isKey);
    if (killedByPlayer) {
      this.stats.recordKill();
    }
  }

  private handlePlayerDown(reason: 'shot' | 'fall'): void {
    this.stats.recordDeath();
    this.director.notifyPlayerDowned();
    this.hud.showDown(this.player.downSecondsLeft, reason);
    if (reason === 'fall') {
      this.audio.playFall();
    } else {
      this.audio.playExplosion();
    }
  }

  private handlePlayerRespawn(): void {
    this.weapon.refill();
    this.director.spawnRedSquad(8);
    this.hud.hideDown();
  }

  private handleVictory(): void {
    if (this.ended) return;
    this.ended = true;
    this.player.setEnabled(false);
    this.weapon.setEnabled(false);
    this.battleScene.startEnemyConvoy();
    this.hud.setSubtitle('红军夺桥成功。敌军残部乘车沿公路撤退。');
    this.audio.playVictory();
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    this.stats.finish();
    const summary: BattleSummary = {
      ...this.stats.toData(),
      accuracy: this.stats.accuracy,
    };
    this.victoryTimer = window.setTimeout(() => {
      this.victoryTimer = null;
      this.options.onVictory(summary);
    }, 5000);
  }

  private forceVictory(): void {
    if (!this.debugEnabled) return;
    this.handleVictory();
  }

  private pause(): void {
    if (this.paused || this.ended || this.disposed) return;
    this.paused = true;
    this.player.setPaused(true);
    this.hud.setPaused(true);
    this.narration.pause();
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  private resume(): void {
    if (!this.paused || this.ended || this.disposed) return;
    this.paused = false;
    this.hud.setPaused(false);
    this.player.setPaused(false);
    this.narration.resume();
    this.audio.unlock();
    this.player.lock();
  }

  private restart(): void {
    this.options.onRestart();
  }

  private exit(): void {
    this.narration.cancel(false);
    this.options.onExit();
  }

  private updateSettings(settings: Settings): void {
    this.settings = { ...settings };
    this.audio.setSettings(this.settings);
    this.narration.setSettings(this.settings);
    this.options.onSettingsChange({ ...this.settings });
  }

  private handleResize = (): void => {
    this.resize();
  };

  private handleFirstPointer = (): void => {
    this.audio.unlock();
  };

  private resize(): void {
    this.battleScene.resize(
      Math.max(1, this.host.clientWidth),
      Math.max(1, this.host.clientHeight),
    );
  }

  private beginBattle(): void {
    this.battleStarted = true;
    this.hud.hideStaging();
    this.player.setEnabled(true);
    this.weapon.setEnabled(true);
    this.audio.unlock();
    this.audio.playHorn();
    this.bots.releaseStagingFormation();
    const text = this.pendingNarration;
    this.pendingNarration = null;
    if (text) {
      this.narration.speak(text);
      this.hud.setSubtitle(text);
    }
    this.host
      .closest('.battle-screen')
      ?.setAttribute('data-battle-started', 'true');
  }

  private updateFrontline(dt: number): void {
    if (!this.currentZone || this.ended) return;
    if (this.player.isDowned) {
      this.frontlineTimer = 0;
      this.frontlineReinforced = false;
      this.frontlineStrikeLaunched = false;
      return;
    }

    const redBots = this.bots.getBots().filter((bot) => bot.alive && bot.faction === 'red');
    let nearestRedDistance = Number.POSITIVE_INFINITY;
    for (const bot of redBots) {
      nearestRedDistance = Math.min(
        nearestRedDistance,
        bot.group.position.distanceTo(this.player.position),
      );
    }

    const outOfLine = isOutOfFrontline(
      this.currentZone,
      this.player.position.z,
      nearestRedDistance,
    );
    if (!outOfLine) {
      this.frontlineTimer = 0;
      this.frontlineReinforced = false;
      this.frontlineStrikeLaunched = false;
      return;
    }

    this.frontlineTimer += dt;
    const escalation = frontlineEscalation(this.frontlineTimer);
    if (escalation !== 'none' && !this.frontlineReinforced) {
      this.frontlineReinforced = true;
      this.director.spawnKmtInterceptionTeam();
    }
    if (escalation === 'strike' && !this.frontlineStrikeLaunched) {
      this.frontlineStrikeLaunched = true;
      const target = this.player.position.clone();
      target.y = 8;
      this.battleScene.launchArtilleryStrike(target, () => {
        if (this.disposed || this.ended) return;
        this.audio.playExplosion();
        this.player.takeDamage(100);
      });
    }
  }

  private updateArtillery(dt: number): void {
    if (this.ended) return;
    this.artilleryTimer -= dt;
    if (this.artilleryTimer > 0) return;
    this.artilleryTimer = nextArtilleryInterval(Math.random());

    const redBots = this.bots.getBots().filter((bot) => bot.alive && bot.faction === 'red');
    const target =
      redBots.length > 0
        ? redBots[Math.floor(Math.random() * redBots.length)].group.position.clone()
        : this.player.position.clone();
    target.x += (Math.random() - 0.5) * 4;
    target.z += (Math.random() - 0.5) * 4;
    target.y = 8;
    this.battleScene.launchArtilleryStrike(target, () => this.resolveArtilleryImpact(target));
  }

  private resolveArtilleryImpact(target: THREE.Vector3): void {
    if (this.disposed || this.ended) return;
    this.audio.playExplosion();
    for (const bot of this.bots.getBots()) {
      if (!bot.alive) continue;
      const distance = bot.group.position.distanceTo(target);
      if (isInArtilleryBlast(distance)) {
        this.bots.hitBot(bot.id, 100, 'bot');
      }
    }

    const playerDistance = this.player.position.distanceTo(target);
    const damage = artilleryDamageAt(playerDistance);
    if (damage > 0) {
      this.player.takeDamage(damage);
    }
  }

  private updateMachineGuns(dt: number): void {
    if (
      this.currentZone !== 'bridge' ||
      this.battleScene.isMachineGunDestroyed() ||
      this.director.phaseIndex > 2
    ) {
      this.machineGunFireTimer = 0;
      return;
    }

    const step = advanceAutomaticFire(this.machineGunFireTimer, dt);
    this.machineGunFireTimer = step.timer;
    const muzzles = this.battleScene.getMachineGunMuzzlePositions();
    if (muzzles.length === 0) return;

    for (let shot = 0; shot < step.shots; shot += 1) {
      const origin = muzzles[this.machineGunShotIndex % muzzles.length];
      this.machineGunShotIndex += 1;
      const redTargets = this.bots.getBots().filter(
        (bot) =>
          bot.alive &&
          bot.faction === 'red' &&
          bot.group.position.z > -30 &&
          bot.group.position.z < 31,
      );
      const playerOnBridge =
        this.player.isAlive &&
        this.player.position.z > -30 &&
        this.player.position.z < 31;
      const targetsPlayer = playerOnBridge && (redTargets.length === 0 || Math.random() < 0.24);
      const targetBot = targetsPlayer || redTargets.length === 0
        ? null
        : redTargets[Math.floor(Math.random() * redTargets.length)];
      if (!targetsPlayer && !targetBot) continue;

      const target = targetsPlayer
        ? this.player.position.clone().add(new THREE.Vector3(0, -0.2, 0))
        : targetBot!.group.position.clone().add(new THREE.Vector3(0, 1.2, 0));
      if (!this.world.hasLineOfSight(origin, target)) continue;
      const hit = Math.random() < 0.22;
      const tracerEnd = target.clone();
      if (!hit) {
        tracerEnd.x += (Math.random() - 0.5) * 3.5;
        tracerEnd.y += (Math.random() - 0.5) * 2.2;
      }
      this.tracers.spawn(origin, tracerEnd, 0.09);
      this.tracers.spawnMuzzleFlash(origin);
      if (this.machineGunShotIndex % 4 === 0) {
        this.audio.playDistantShot(THREE.MathUtils.clamp(origin.x / 8, -1, 1));
      }
      if (!hit) continue;
      if (targetsPlayer) {
        this.player.takeDamage(MACHINE_GUN_DAMAGE);
      } else if (targetBot) {
        this.bots.hitBot(targetBot.id, MACHINE_GUN_DAMAGE, 'bot');
      }
    }
  }

  private updateFps(dt: number): void {
    this.fpsAccumulator += dt;
    this.fpsFrames += 1;
    if (this.fpsAccumulator < 2) return;

    const measured = this.fpsFrames / this.fpsAccumulator;
    this.fps = Math.round(measured);
    this.fpsAccumulator = 0;
    this.fpsFrames = 0;

    if (measured < 36 && this.pixelRatio > 0.6) {
      this.lowFpsWindows += 1;
      this.highFpsWindows = 0;
    } else if (measured > 55) {
      this.highFpsWindows += 1;
      this.lowFpsWindows = 0;
    } else {
      this.lowFpsWindows = 0;
      this.highFpsWindows = 0;
    }

    if (this.lowFpsWindows >= 1) {
      this.setPixelRatio(Math.max(0.6, this.pixelRatio - 0.2));
      this.lowFpsWindows = 0;
    } else if (this.highFpsWindows >= 3) {
      this.setPixelRatio(Math.min(this.maxPixelRatio, this.pixelRatio + 0.1));
      this.highFpsWindows = 0;
    }
  }

  private setPixelRatio(ratio: number): void {
    this.pixelRatio = Math.max(0.6, Math.min(this.maxPixelRatio, ratio));
    this.battleScene.setPixelRatio(this.pixelRatio);
  }
}
