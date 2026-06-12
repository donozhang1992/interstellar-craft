export {};

declare global {
  interface Window {
    /** Set after boot completes; Playwright waits on this. */
    READY?: boolean;
    /** Dev/test-only debug handle (TECH_SPEC §3). Grows as systems land. */
    __game?: {
      READY: boolean;
    };
  }
}
