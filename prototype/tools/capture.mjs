import puppeteer from 'puppeteer-core';
import { mkdirSync, existsSync } from 'fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'http://localhost:5181/prototype/trailer.html';
const OUT = new globalThis.URL('./frames/', import.meta.url).pathname.replace(/^\//, '');
const FPS = 24, DUR = 30, N = FPS * DUR;

mkdirSync('frames', { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: [
    '--window-size=1380,860',
    '--use-angle=d3d11',
    '--enable-unsafe-swiftshader',
    '--disable-gpu-vsync',
    '--hide-scrollbars',
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
page.on('console', m => { if (m.type() === 'error') console.error('[page]', m.text()); });
page.on('pageerror', e => console.error('[pageerror]', e.message));

console.log('loading', URL);
await page.goto(URL, { waitUntil: 'networkidle0', timeout: 180000 });
await page.waitForFunction('window.READY === true', { timeout: 180000 });
console.log('page ready, rendering', N, 'frames');

const t0 = Date.now();
for (let i = 0; i < N; i++) {
  await page.evaluate(i => window.renderFrame(i), i);
  await page.screenshot({ path: `frames/f${String(i).padStart(4, '0')}.png` });
  if (i % 48 === 0 || i === N - 1) {
    const el = (Date.now() - t0) / 1000;
    console.log(`frame ${i}/${N}  ${el.toFixed(0)}s elapsed  (${(el / (i + 1)).toFixed(2)}s/frame)`);
  }
}
await browser.close();
console.log('done in', ((Date.now() - t0) / 1000).toFixed(0), 's');
