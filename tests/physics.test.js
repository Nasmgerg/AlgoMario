import { describe, it, expect } from 'vitest';
import { Level, CellType } from '../src/world/Level.js';
import { step, Action } from '../src/core/step.js';
import { createInitialRunState, RunStatus } from '../src/core/RunState.js';
import { PHYSICS } from '../src/config/physics.js';

const HEIGHT = 16;
const LENGTH = 30;
const GROUND_TOP = HEIGHT - 2;
const SURFACE_ROW = GROUND_TOP - 1;

/** @param {{length?: number, extraWalls?: {row: number, col: number, type: number}[]}} [opts] */
function makeFlatLevel({ length = LENGTH, extraWalls = [] } = {}) {
  const cells = new Uint8Array(HEIGHT * length);
  for (let col = 0; col < length; col += 1) {
    for (let row = GROUND_TOP; row < HEIGHT; row += 1) {
      cells[row * length + col] = CellType.WALL;
    }
  }
  for (const wall of extraWalls) {
    cells[wall.row * length + wall.col] = wall.type;
  }
  return new Level({
    height: HEIGHT,
    length,
    cells,
    coins: [],
    surprises: [],
    startPosition: { row: SURFACE_ROW, col: 2 },
    goalColumn: length - 3,
    maxTicks: 10000,
    seed: 1,
  });
}

describe('step() fizika', () => {
  it('ugrás: felemelkedik, majd visszaesik a talajra kb. 4-6 cellás magasságig', () => {
    const level = makeFlatLevel();
    let state = createInitialRunState(level);
    state = step(state, Action.JUMP, level);
    let minRow = state.row;
    for (let i = 0; i < 60; i += 1) {
      state = step(state, Action.NONE, level);
      if (state.row < minRow) minRow = state.row;
      if (state.grounded) break;
    }
    const jumpHeight = SURFACE_ROW - minRow;
    expect(jumpHeight).toBeGreaterThan(3);
    expect(jumpHeight).toBeLessThan(7);
    expect(state.grounded).toBe(true);
    expect(state.row).toBeCloseTo(SURFACE_ROW, 5);
  });

  it('szabadesésnél nem lépi túl a MAX_FALL_SPEED-et, és hosszú esésnél el is éri azt', () => {
    const tallHeight = 300;
    const length = 10;
    const cells = new Uint8Array(tallHeight * length);
    const level = new Level({
      height: tallHeight,
      length,
      cells,
      coins: [],
      surprises: [],
      startPosition: { row: 0, col: 2 },
      goalColumn: length - 3,
      maxTicks: 10000,
      seed: 1,
    });
    let state = createInitialRunState(level);
    let reachedMaxFallSpeed = false;
    for (let i = 0; i < 80 && state.status === RunStatus.RUNNING; i += 1) {
      state = step(state, Action.NONE, level);
      expect(state.vRow).toBeLessThanOrEqual(PHYSICS.MAX_FALL_SPEED + 1e-9);
      if (Math.abs(state.vRow - PHYSICS.MAX_FALL_SPEED) < 1e-9) reachedMaxFallSpeed = true;
    }
    expect(reachedMaxFallSpeed).toBe(true);
  });

  it('vízszintes ütközés: pontosan a cellahatáron áll meg', () => {
    const wallCol = 6;
    const level = makeFlatLevel({ extraWalls: [{ row: SURFACE_ROW, col: wallCol, type: CellType.WALL }] });
    let state = createInitialRunState(level);
    for (let i = 0; i < 50 && state.status === RunStatus.RUNNING; i += 1) {
      state = step(state, Action.RIGHT, level);
    }
    expect(state.col).toBeCloseTo(wallCol - 1, 5);
    expect(state.vCol).toBe(0);
  });

  it('súrlódás: talajon állva NONE hatására lelassul nulláig, nem fordul irányt', () => {
    const level = makeFlatLevel({ length: 40 });
    let state = createInitialRunState(level);
    for (let i = 0; i < 5; i += 1) state = step(state, Action.RIGHT, level);
    expect(state.vCol).toBeCloseTo(PHYSICS.MAX_RUN_SPEED, 5);

    let prevSpeed = state.vCol;
    let stoppedAtZero = false;
    for (let i = 0; i < 10; i += 1) {
      state = step(state, Action.NONE, level);
      expect(state.vCol).toBeLessThanOrEqual(prevSpeed + 1e-9);
      expect(state.vCol).toBeGreaterThanOrEqual(0);
      prevSpeed = state.vCol;
      if (state.vCol === 0) stoppedAtZero = true;
    }
    expect(stoppedAtZero).toBe(true);
  });

  it('a step() tiszta függvény: nem mutálja a bemeneti állapotot', () => {
    const level = makeFlatLevel();
    const state = createInitialRunState(level);
    const snapshot = JSON.parse(JSON.stringify({ ...state, collectedCoins: [], poppedSurprises: [] }));
    step(state, Action.RIGHT, level);
    expect({ ...state, collectedCoins: [], poppedSurprises: [] }).toEqual(snapshot);
  });

  it('lezárt futásállapoton (pl. FELL) a step() no-op', () => {
    const level = makeFlatLevel();
    const fellState = { ...createInitialRunState(level), status: RunStatus.FELL };
    const next = step(fellState, Action.RIGHT, level);
    expect(next).toBe(fellState);
  });
});
