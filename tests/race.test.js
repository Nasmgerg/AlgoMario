import { describe, it, expect } from 'vitest';
import { generateLevel } from '../src/world/LevelGenerator.js';
import { Action } from '../src/core/step.js';
import { RunStatus } from '../src/core/RunState.js';
import { RaceAI, RaceSubmode, Racer } from '../src/modes/RaceAI.js';
import { buildJumpGraph } from '../src/ai/JumpGraph.js';
import { astar, dijkstra, greedy } from '../src/ai/algorithms.js';
import { PrecomputedAIController, RealtimeAIController } from '../src/modes/AIController.js';

/**
 * Race Against AI (SPEC.md 8.3). A tesztek a determinisztikus
 * `expansionsPerTick` budgetet használják — az ms-alapú mérés gépfüggő,
 * és flaky tesztet adna.
 */

const LEVEL = generateLevel({ seed: 5, length: 120, difficulty: 2 });

/** A versenyt lefuttatja a végéig; a játékos alapból tétlen. */
function runRace(race, playerAction = Action.NONE, maxTicks = 20000) {
  let guard = 0;
  while (!race.finished && guard < maxTicks) {
    race.tick(playerAction);
    guard += 1;
  }
  return race;
}

describe('AI-vezérlők (SPEC.md 8.3, 9.3)', () => {
  it('precomputed: teljes tervet készít, és a Controller interfészen adja ki', () => {
    const graph = buildJumpGraph(LEVEL);
    const controller = new PrecomputedAIController(graph, astar);
    expect(controller.found).toBe(true);
    expect(controller.stream.length).toBeGreaterThan(0);
    // Az akciófolyam hossza = az élköltségek összege.
    expect(controller.stream.length).toBe(controller.edges.reduce((s, e) => s + e.cost, 0));
    // Kimerülés után NONE-t ad (nem dob, nem ragad be).
    controller.cursor = controller.stream.length;
    expect(controller.getAction()).toBe(Action.NONE);
  });

  it('realtime: szűk budget mellett ÁLL, amíg gondolkodik; bő budgettel nem', () => {
    const graph = buildJumpGraph(LEVEL);
    const tight = new RealtimeAIController(graph, dijkstra, { expansionsPerTick: 3 });
    const loose = new RealtimeAIController(graph, dijkstra, { expansionsPerTick: 5000 });

    for (let tick = 0; tick < 200; tick += 1) {
      tight.getAction();
      loose.getAction();
    }
    expect(tight.stallTicks).toBeGreaterThan(0);
    expect(loose.stallTicks).toBe(0);
  });
});

describe('RaceAI (SPEC.md 8.3)', () => {
  it('precomputed: az AI célba ér, és legyőzi a tétlen játékost', () => {
    const race = runRace(new RaceAI(LEVEL, { submode: RaceSubmode.PRECOMPUTED, algorithm: 'astar' }));
    const result = race.result;
    expect(result.ai.reachedGoal).toBe(true);
    expect(result.player.reachedGoal).toBe(false);
    expect(result.winner).toBe(Racer.AI);
    expect(result.ai.timeSeconds).toBeGreaterThan(0);
    expect(result.ai.score).toBeGreaterThan(0);
  });

  it('a két futó ugyanazon a pályán, de FÜGGETLEN állapottal fut', () => {
    const race = new RaceAI(LEVEL, { submode: RaceSubmode.PRECOMPUTED, algorithm: 'astar' });
    for (let i = 0; i < 60; i += 1) race.tick(Action.LEFT); // a játékos balra megy
    expect(race.aiState.col).toBeGreaterThan(race.playerState.col);
    expect(race.playerState).not.toBe(race.aiState);
    expect(race.level).toBe(LEVEL);
  });

  it('handicap: az AI pontosan a megadott tickkel később ér célba', () => {
    const base = runRace(new RaceAI(LEVEL, { submode: RaceSubmode.PRECOMPUTED, algorithm: 'astar' }));
    const handicapped = runRace(
      new RaceAI(LEVEL, { submode: RaceSubmode.PRECOMPUTED, algorithm: 'astar', handicapTicks: 120 }),
    );
    expect(handicapped.result.ai.ticks - base.result.ai.ticks).toBe(120);
  });

  it('realtime: a szűk tick-budget mérhetően lassítja az AI-t (a döntéshozatal ára)', () => {
    const fast = runRace(
      new RaceAI(LEVEL, { submode: RaceSubmode.REALTIME, algorithm: 'astar', expansionsPerTick: 5000 }),
    );
    const slow = runRace(
      new RaceAI(LEVEL, { submode: RaceSubmode.REALTIME, algorithm: 'astar', expansionsPerTick: 3 }),
    );
    expect(fast.result.ai.reachedGoal).toBe(true);
    expect(slow.result.ai.reachedGoal).toBe(true);
    expect(slow.stats.aiStallTicks).toBeGreaterThan(0);
    expect(fast.stats.aiStallTicks).toBe(0);
    expect(slow.result.ai.ticks).toBeGreaterThan(fast.result.ai.ticks);
  });

  it('realtime: azonos szűk budgetnél a kevesebbet kiterjesztő algoritmus kevesebbet áll', () => {
    const withDijkstra = runRace(
      new RaceAI(LEVEL, { submode: RaceSubmode.REALTIME, algorithm: 'dijkstra', expansionsPerTick: 5 }),
    );
    const withGreedy = runRace(
      new RaceAI(LEVEL, { submode: RaceSubmode.REALTIME, algorithm: 'greedy', expansionsPerTick: 5 }),
    );
    expect(withGreedy.stats.aiNodesExpanded).toBeLessThan(withDijkstra.stats.aiNodesExpanded);
    expect(withGreedy.stats.aiStallTicks).toBeLessThan(withDijkstra.stats.aiStallTicks);
  });

  it('realtime: csomópontonként újratervez (SPEC 8.3 "újratervez")', () => {
    const race = runRace(
      new RaceAI(LEVEL, { submode: RaceSubmode.REALTIME, algorithm: 'greedy', expansionsPerTick: 5000 }),
    );
    expect(race.stats.aiReplans).toBeGreaterThan(1);
    expect(greedy.name).toBe('Greedy Best-First'); // a kulcs tényleg a Greedy-t építi
  });

  it('eredmény: ha egyik sem ér célba, a messzebb jutó nyer', () => {
    // Rövid futás: senki nem ér célba, de az AI messzebb jut a tétlen játékosnál.
    const race = new RaceAI(LEVEL, { submode: RaceSubmode.PRECOMPUTED, algorithm: 'astar' });
    for (let i = 0; i < 120; i += 1) race.tick(Action.NONE);
    const result = race.result;
    expect(result.player.reachedGoal).toBe(false);
    expect(result.ai.reachedGoal).toBe(false);
    expect(result.winner).toBe(Racer.AI);
    expect(result.reason).toContain('messzebb');
  });

  it('a lezárt futó állapota nem változik tovább (step no-op)', () => {
    const race = runRace(new RaceAI(LEVEL, { submode: RaceSubmode.PRECOMPUTED, algorithm: 'astar' }));
    expect(race.finished).toBe(true);
    const aiBefore = race.aiState;
    const playerBefore = race.playerState;
    race.tick(Action.RIGHT);
    expect(race.aiState).toBe(aiBefore);
    expect(race.playerState).toBe(playerBefore);
    expect([RunStatus.GOAL, RunStatus.FELL, RunStatus.TIMEOUT]).toContain(race.aiState.status);
  });
});
