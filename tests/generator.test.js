import { describe, it, expect } from 'vitest';
import { generateLevel } from '../src/world/LevelGenerator.js';
import { validateLevel } from '../src/world/LevelValidator.js';

describe('LevelGenerator determinizmus és járhatóság (SPEC.md 11. szakasz)', () => {
  it('ugyanaz a seed ugyanazt a pályát adja', () => {
    const a = generateLevel({ seed: 12345, length: 120, difficulty: 2 });
    const b = generateLevel({ seed: 12345, length: 120, difficulty: 2 });
    expect(Array.from(a.cells)).toEqual(Array.from(b.cells));
    expect(a.coins).toEqual(b.coins);
    expect(a.surprises).toEqual(b.surprises);
    expect(a.startPosition).toEqual(b.startPosition);
    expect(a.goalColumn).toBe(b.goalColumn);
  });

  it('különböző seed jellemzően különböző pályát ad', () => {
    const a = generateLevel({ seed: 1, length: 120 });
    const b = generateLevel({ seed: 2, length: 120 });
    expect(Array.from(a.cells)).not.toEqual(Array.from(b.cells));
  });

  it('minden generált pálya járható (start → cél BFS a jump-graphon)', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const level = generateLevel({ seed, length: 120, difficulty: seed % 5 });
      const validation = validateLevel(level);
      expect(validation.walkable, `seed ${seed} nem járható`).toBe(true);
    }
  });

  it('minden pályán maradó érme elérhető', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const level = generateLevel({ seed, length: 200, difficulty: 3, coinDensity: 0.9 });
      const validation = validateLevel(level);
      for (const coin of level.coins) {
        expect(validation.reachable.has(coin.col), `seed ${seed}: érme (${coin.row},${coin.col}) nem elérhető`).toBe(
          true,
        );
      }
    }
  });

  it('érvénytelen seed esetén explicit hibát dob (nem hallgat, nem fallbackel csendben)', () => {
    expect(() => generateLevel({ seed: NaN })).toThrow();
    expect(() => generateLevel(/** @type {any} */ ({ seed: 'abc' }))).toThrow();
    expect(() => generateLevel({ seed: undefined })).toThrow();
  });

  it('túl rövid pályahosszra explicit hibát dob', () => {
    expect(() => generateLevel({ seed: 1, length: 10 })).toThrow();
  });

  it('maxTicks = length × 40 (SPEC.md D2)', () => {
    const level = generateLevel({ seed: 42, length: 250 });
    expect(level.maxTicks).toBe(250 * 40);
  });

  it('az első 10 és utolsó 5 oszlop mindig flat (biztonságos start/cél)', () => {
    const level = generateLevel({ seed: 7, length: 120, difficulty: 4 });
    for (let col = 0; col < 10; col += 1) {
      expect(level.surfaceRowAt(col)).not.toBeNull();
    }
    for (let col = level.length - 5; col < level.length; col += 1) {
      expect(level.surfaceRowAt(col)).not.toBeNull();
    }
  });

  it('a hossz-presetekkel (short/normal/long) is működik', () => {
    for (const length of [120, 250, 500]) {
      const level = generateLevel({ seed: 3, length, difficulty: 2 });
      expect(level.length).toBe(length);
      expect(validateLevel(level).walkable).toBe(true);
    }
  });
});
