import { Controller } from '../core/Controller.js';
import { Action } from '../core/step.js';

const LEFT_KEYS = ['LEFT', 'A'];
const RIGHT_KEYS = ['RIGHT', 'D'];
const JUMP_KEYS = ['UP', 'W', 'SPACE'];

/** Igaz, ha a fókusz űrlapmezőn van (pl. a seed-mezőbe gépel a felhasználó) — ilyenkor a játékbillentyűk (mozgás, R restart) nem érvényesek, mert a leütés az űrlapnak szól.
 * @returns {boolean}
 */
export function isTypingIntoForm() {
  const el = document.activeElement;
  return (
    el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement
  );
}

/** Billentyűzetes `Controller` (SPEC.md 8.1: A/←, D/→, W/↑/Space); a Phaser keyboard pluginra épül, ezért csak itt élhet, a core/ marad Phaser-mentes. */
export class HumanController extends Controller {
  /** @param {Phaser.Input.Keyboard.KeyboardPlugin} keyboard */
  constructor(keyboard) {
    super();
    this.keys = keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE');
  }

  /** @param {string[]} names */
  _isAnyDown(names) {
    return names.some((name) => this.keys[name]?.isDown);
  }

  /** Ugrás csak talajon élvez elsőbbséget (levegőben a JUMP úgyis hatástalan), így az irányváltás repülés közben is működik.
   * @param {import('../core/RunState.js').RunState} state
   * @returns {number} - {@link Action}
   */
  getAction(state) {
    if (isTypingIntoForm()) return Action.NONE;
    const jumpHeld = this._isAnyDown(JUMP_KEYS);
    if (jumpHeld && state.grounded) return Action.JUMP;

    const leftHeld = this._isAnyDown(LEFT_KEYS);
    const rightHeld = this._isAnyDown(RIGHT_KEYS);
    if (leftHeld && !rightHeld) return Action.LEFT;
    if (rightHeld && !leftHeld) return Action.RIGHT;
    return Action.NONE;
  }
}
