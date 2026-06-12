import { defineConfig } from '@playwright/test';

/**
 * Two projects share one dev server (TEST_STRATEGY §3/§4):
 *  - e2e:    behavior + perf probes (tests/e2e)
 *  - visual: screenshot regression vs committed baselines (tests/visual)
 *
 * Rendering pinned for screenshot stability (TEST_STRATEGY §4): 1280×720,
 * deviceScaleFactor 1, and the prototype capture pipeline's proven GPU flags
 * (prototype/tools/capture.mjs): ANGLE d3d11 + swiftshader fallback, no vsync.
 */
const sharedUse = {
  channel: 'msedge',
  headless: true,
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  baseURL: 'http://localhost:5173',
  launchOptions: {
    args: [
      '--use-angle=d3d11',
      '--enable-unsafe-swiftshader',
      '--disable-gpu-vsync',
      '--hide-scrollbars',
    ],
  },
} as const;

export default defineConfig({
  timeout: 30_000,
  // L3 gate: pixel diff < 0.5% vs baseline (TEST_STRATEGY §1/§4). Never raise.
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.005 } },
  // Committed baselines live in tests/visual/__baselines__/ (flat, name = shot id).
  snapshotPathTemplate: '{testDir}/__baselines__/{arg}{ext}',
  projects: [
    { name: 'e2e', testDir: 'tests/e2e', use: sharedUse },
    { name: 'visual', testDir: 'tests/visual', use: sharedUse },
  ],
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
