import { Controller } from '../core/Controller.js';
import { Action } from '../core/step.js';

const LEFT_KEYS = ['LEFT', 'A'];
const RIGHT_KEYS = ['RIGHT', 'D'];
const JUMP_KEYS = ['UP', 'W', 'SPACE'];

/**
 * Billentyűzetes `Controller` (SPEC.md 8.1: A/←, D/→, W/↑/Space). A Phaser
 * keyboard pluginra épül, ezért csak a `ui`/`render` rétegben élhet — a
 * `core/Controller.js` maga Phaser-mentes marad.
 */
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

  /**
   * Ugrás csak talajon lévő állapotban élvez elsőbbséget (a JUMP action
   * levegőben úgyis hatástalan a step()-ben) — így az irányváltó gombok
   * végig hatnak repülés közben is, nem csak elrugaszkodáskor.
   * @param {import('../core/RunState.js').RunState} state
   * @returns {number} - {@link Action}
   */
  getAction(state) {
    const jumpHeld = this._isAnyDown(JUMP_KEYS);
    if (jumpHeld && state.grounded) return Action.JUMP;

    const leftHeld = this._isAnyDown(LEFT_KEYS);
    const rightHeld = this._isAnyDown(RIGHT_KEYS);
    if (leftHeld && !rightHeld) return Action.LEFT;
    if (rightHeld && !leftHeld) return Action.RIGHT;
    return Action.NONE;
  }
}
