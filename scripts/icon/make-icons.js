// Regenerates app icons + splash from the game's own 3D horse. Needs Playwright + Chromium, and `npx http-server . -p 8132` running at repo root.
const { chromium } = require('playwright'); const fs = require('fs'); const BASE = 'http://localhost:8132/scripts/icon/';
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let p = await b.newPage({ viewport: { width: 1024, height: 1024 } }); await p.goto(BASE + 'horse.html'); await p.waitForFunction(() => window.DONE, null, { timeout: 90000 });
  fs.writeFileSync('scripts/icon/horse.png', await p.locator('canvas').screenshot({ omitBackground: true })); await p.close();
  const comp = async (mode, w, h, out) => { const pg = await b.newPage({ viewport: { width: w, height: h } }); await pg.goto(`${BASE}compose.html?mode=${mode}&w=${w}&h=${h}&src=horse.png`); await pg.waitForFunction(() => window.DONE); await pg.locator('canvas').screenshot({ path: out, omitBackground: mode === 'fg' }); await pg.close(); };
  fs.mkdirSync('assets', { recursive: true });
  await comp('icon', 1024, 1024, 'assets/icon-only.png'); await comp('fg', 1024, 1024, 'assets/icon-foreground.png'); await comp('bg', 1024, 1024, 'assets/icon-background.png');
  await comp('splash', 2732, 2732, 'assets/splash.png'); await comp('splash', 2732, 2732, 'assets/splash-dark.png');
  await comp('icon', 512, 512, 'www/icon-512.png'); await comp('icon', 192, 192, 'www/icon-192.png'); await b.close();
})();
