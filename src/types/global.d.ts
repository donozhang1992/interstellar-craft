export {};

declare global {
  interface Window {
    /** Set after boot completes; Playwright waits on this. */
    READY?: boolean;
    /**
     * Set by Playwright BEFORE load (addInitScript): the rAF loop must not
     * advance the simulation — __game.stepFrames is the only clock (TECH_SPEC §3).
     */
    __TEST__?: boolean;
    /** Dev/test-only debug handle (TECH_SPEC §3). Grows as systems land. */
    __game?: import('../game/hooks').GameHooks;
  }
}
