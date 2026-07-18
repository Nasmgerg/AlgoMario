/**
 * Controller absztrakció (SPEC.md 9.3. szakasz). `HumanController`,
 * `AIController`, `ReplayController` mind ezt implementálja, hogy a Play
 * Yourself, a Watch AI/Race és a replay ugyanazon a kódúton fusson.
 * @interface
 */
export class Controller {
  /**
   * @param {import('./RunState.js').RunState} state
   * @param {import('../world/Level.js').Level} level
   * @returns {number} - {@link import('./step.js').Action}
   */
  // eslint-disable-next-line no-unused-vars
  getAction(state, level) {
    throw new Error('Controller.getAction: nincs implementálva');
  }
}
