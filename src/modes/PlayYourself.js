import { step } from '../core/step.js';
import { createInitialRunState, RunStatus } from '../core/RunState.js';

/** Play Yourself mód (SPEC.md 8.1); renderer-független, a fizikát a `core/step.js` adja tickenként. */
export class PlayYourself {
  /**
   * @param {import('../world/Level.js').Level} level
   * @param {import('../core/Controller.js').Controller} controller
   */
  constructor(level, controller) {
    this.level = level;
    this.controller = controller;
    this.state = createInitialRunState(level);
  }

  /** Mario visszaáll a start pozícióra, a pálya (seed) változatlan marad. */
  restart() {
    this.state = createInitialRunState(this.level);
  }

  /**
   * Pontosan egy fixed-timestep szimulációs lépés.
   * @returns {import('../core/RunState.js').RunState}
   */
  tick() {
    if (this.state.status !== RunStatus.RUNNING) return this.state;
    const action = this.controller.getAction(this.state, this.level);
    this.state = step(this.state, action, this.level);
    return this.state;
  }
}
