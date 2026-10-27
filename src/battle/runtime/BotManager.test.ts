import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { Bot, BotManager, type BotWorld } from './BotManager';
import { createSoldierAssets } from '../three/SoldierView';
import { colliderFromCenter } from '../core/collision';

function createWorld(): BotWorld {
  return {
    playerPosition: new THREE.Vector3(0, 9.65, 40),
    playerAlive: false,
    playerDowned: true,
    damagePlayer: vi.fn(),
    playBotShot: vi.fn(),
    spawnTracer: vi.fn(),
    spawnMuzzleFlash: vi.fn(),
    hasLineOfSight: () => true,
  };
}

describe('Bot falling', () => {
  it('drops a bot off the bridge when it is downed on the deck', () => {
    const assets = createSoldierAssets();
    const bot = new Bot('bot_test', assets, 'red', false, new THREE.Vector3(0, 8, 0));
    bot.zone = 'bridge';

    expect(bot.takeDamage(100)).toBe(true);
    expect(bot.alive).toBe(false);
    expect(bot.state).toBe('falling');

    const startY = bot.group.position.y;
    for (let i = 0; i < 20; i += 1) {
      bot.tickDeath(0.1);
    }
    expect(bot.group.position.y).toBeLessThan(startY);
    expect(bot.group.visible).toBe(false);

    bot.dispose();
    assets.dispose();
  });

  it('keeps Nationalist bots behind the far-bank bridgehead, not on the bridge', () => {
    const scene = new THREE.Scene();
    const manager = new BotManager({ scene, onBotDowned: vi.fn() });
    manager.spawn('kmt', 4, false);
    manager.setBattleZone('bridge');
    manager.setPhase(1);

    const world = createWorld();
    for (let i = 0; i < 40; i += 1) {
      manager.update(0.1, world);
    }

    const kmtBots = manager.getBots().filter((bot) => bot.faction === 'kmt');
    expect(kmtBots).toHaveLength(4);
    for (const bot of kmtBots) {
      expect(bot.group.position.z).toBeLessThan(-30);
    }

    manager.dispose();
  });

  it('can trigger a red bot to fall on its own and notifies the director', () => {
    const scene = new THREE.Scene();
    const onBotDowned = vi.fn();
    const manager = new BotManager({ scene, onBotDowned });
    manager.spawn('red', 1, false);
    manager.setBattleZone('bridge');
    manager.setPhase(1);
    manager.getBots()[0].group.position.set(0, 8, 20);

    const falling = manager.debugTriggerSelfFall();
    expect(falling).not.toBeNull();
    expect(falling?.state).toBe('falling');
    expect(onBotDowned).toHaveBeenCalledWith(falling, false);

    const startY = falling!.group.position.y;
    const world = createWorld();
    manager.update(0.1, world);
    expect(falling!.group.position.y).toBeLessThan(startY);

    manager.dispose();
  });

  it('keeps bunker-roof troops at their elevated base height', () => {
    const assets = createSoldierAssets();
    const bot = new Bot(
      'bot_roof',
      assets,
      'kmt',
      false,
      new THREE.Vector3(0, 12.25, -34),
    );
    bot.zone = 'bridge';
    bot.setPhase(2);
    bot.updateMovement(0.1);
    expect(bot.group.position.y).toBeCloseTo(12.25, 2);

    bot.dispose();
    assets.dispose();
  });

  it('stations six defenders across the bunker roof', () => {
    const scene = new THREE.Scene();
    const manager = new BotManager({ scene, onBotDowned: vi.fn() });
    manager.spawn('kmt', 12, false);
    manager.setBattleZone('bridge');

    const roofBots = manager.getBots().filter(
      (bot) => bot.alive && bot.faction === 'kmt' && bot.baseY > 10,
    );
    expect(roofBots).toHaveLength(6);
    expect(new Set(roofBots.map((bot) => Math.round(bot.group.position.x))).size).toBe(6);
    manager.dispose();
  });

  it('stops the walk cycle when a Red bot is pinned against cover', () => {
    const scene = new THREE.Scene();
    const manager = new BotManager({
      scene,
      colliders: [colliderFromCenter(0, 10, 40, 40, 3)],
      onBotDowned: vi.fn(),
    });
    manager.spawnSquad('red', 1);
    manager.setBattleZone('bridge');
    manager.setPhase(1);

    const bot = manager.getBots()[0];
    bot.group.position.set(0, 8, 10);
    bot.laneX = 0;
    bot.targetZ = 30;
    bot.state = 'advance';

    const world = createWorld();
    for (let i = 0; i < 60; i += 1) {
      manager.update(0.1, world);
    }

    // Position is reverted, so the bot stands still instead of walking in place.
    expect(bot.group.position.z).toBeCloseTo(10, 5);
    expect(bot.blockedTimer).toBeGreaterThan(0);
    expect(Math.abs(bot.hitMeshes[1].rotation.x)).toBeLessThan(0.05);
    expect(Math.abs(bot.hitMeshes[2].rotation.x)).toBeLessThan(0.05);
    manager.dispose();
  });

  it('cuts down the leading Red bots to show a repulse', () => {
    const scene = new THREE.Scene();
    const onBotDowned = vi.fn();
    const manager = new BotManager({ scene, onBotDowned });
    manager.spawnSquad('red', 4);
    const front = manager
      .getBots()
      .filter((bot) => bot.alive)
      .sort((a, b) => a.group.position.z - b.group.position.z);

    const count = manager.repulseFrontRedBots(2);

    expect(count).toBe(2);
    expect(front[0].alive).toBe(false);
    expect(front[1].alive).toBe(false);
    expect(onBotDowned).toHaveBeenCalledTimes(2);
    manager.dispose();
  });

  it('spawns Red reinforcements in a rear formation', () => {
    const scene = new THREE.Scene();
    const manager = new BotManager({ scene, onBotDowned: vi.fn() });
    const spawned = manager.spawnSquad('red', 8);
    expect(spawned).toBe(8);

    const bots = manager.getBots();
    const rows = new Set(bots.map((bot) => Math.round(bot.group.position.z * 10) / 10));
    expect(rows.size).toBe(2);
    for (const bot of bots) {
      expect(bot.group.position.z).toBeGreaterThan(70);
    }
    manager.dispose();
  });

  it('spawns two KMT teams together at the rear edge of the active zone', () => {
    const scene = new THREE.Scene();
    const manager = new BotManager({ scene, onBotDowned: vi.fn() });
    manager.setBattleZone('street');
    const spawned = manager.spawnSquad('kmt', 8);

    expect(spawned).toBe(8);
    const bots = manager.getBots();
    expect(new Set(bots.map((bot) => Math.round(bot.group.position.z * 10) / 10)).size).toBe(2);
    expect(bots.every((bot) => bot.group.position.z < -104)).toBe(true);
    manager.dispose();
  });

  it('repositions living bots when the battle zone changes', () => {
    const scene = new THREE.Scene();
    const manager = new BotManager({ scene, onBotDowned: vi.fn() });
    manager.spawn('red', 1, false);
    manager.spawn('kmt', 1, false);
    manager.setPhase(2);
    manager.setBattleZone('street');

    const red = manager.getBots().find((bot) => bot.faction === 'red');
    const kmt = manager.getBots().find((bot) => bot.faction === 'kmt');
    expect(red?.group.position.z).toBeLessThan(-30);
    expect(kmt?.group.position.z).toBeLessThan(-40);

    manager.dispose();
  });

  it('makes a bot dodge sideways after taking non-lethal damage', () => {
    const assets = createSoldierAssets();
    const bot = new Bot('bot_dodge', assets, 'red', false, new THREE.Vector3(0, 8, 0));
    bot.zone = 'bridge';

    expect(bot.takeDamage(25)).toBe(false);
    expect(bot.dodgeTimer).toBeGreaterThan(0);
    expect(Math.abs(bot.dodgeDir)).toBe(1);

    bot.dispose();
    assets.dispose();
  });

  it('spreads jungle soldiers across separate cover positions', () => {
    const scene = new THREE.Scene();
    const colliders = Array.from({ length: 12 }, (_, index) =>
      colliderFromCenter(-24 + (index % 6) * 9, 38 + Math.floor(index / 6) * 16, 2, 2, 3),
    );
    const manager = new BotManager({ scene, colliders, onBotDowned: vi.fn() });
    manager.spawn('red', 10, false);

    const targets = manager.getBots().map((bot) => ({ x: bot.laneX, z: bot.targetZ }));
    expect(Math.max(...targets.map((point) => point.x)) - Math.min(...targets.map((point) => point.x)))
      .toBeGreaterThan(18);
    for (let i = 0; i < targets.length; i += 1) {
      for (let j = i + 1; j < targets.length; j += 1) {
        expect(Math.hypot(targets[i].x - targets[j].x, targets[i].z - targets[j].z))
          .toBeGreaterThanOrEqual(3.6);
      }
    }
    manager.dispose();
  });

  it('holds Red troops around the player before releasing them into the jungle', () => {
    const scene = new THREE.Scene();
    const manager = new BotManager({ scene, onBotDowned: vi.fn() });
    manager.spawn('red', 10, false);
    manager.stageRedFormation(98);

    expect(manager.getBots().every((bot) => bot.state === 'hold')).toBe(true);
    expect(manager.getBots().every((bot) => bot.group.position.z >= 98)).toBe(true);
    manager.releaseStagingFormation();
    expect(manager.getBots().some((bot) => bot.targetZ < 70)).toBe(true);
    manager.dispose();
  });
});
