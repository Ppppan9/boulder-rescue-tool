// 测试公用工具：静态服务器、Playwright 启动、下载解包、断言、自动通关。
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ART = path.join(ROOT, 'test', 'artifacts');
export const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const BLENDER = process.env.BLENDER || '/Applications/Blender.app/Contents/MacOS/Blender';

export const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
  '.glb': 'model/gltf-binary', '.fbx': 'application/octet-stream',
  '.zip': 'application/zip', '.md': 'text/markdown; charset=utf-8',
};

export function log(msg) { process.stdout.write(msg + '\n'); }
export const stage = (name) => log('\n▶ ' + name);

let passed = 0;
const failures = [];
export function check(cond, msg, detail) {
  if (cond) { passed++; return true; }
  failures.push(msg + (detail !== undefined ? '  [' + detail + ']' : ''));
  log('  ✗ ' + msg + (detail !== undefined ? '  [' + detail + ']' : ''));
  return false;
}
export function eq(actual, expected, msg) {
  return check(Object.is(actual, expected), msg, 'expected=' + JSON.stringify(expected) + ' actual=' + JSON.stringify(actual));
}
export function near(actual, expected, tol, msg) {
  return check(Math.abs(actual - expected) <= tol, msg, actual + ' vs ' + expected + ' ±' + tol);
}
export function summary(title) {
  log('\n' + (failures.length ? '✗ ' : '✓ ') + title + '：' + passed + ' 项通过，' + failures.length + ' 项失败');
  if (failures.length) {
    log(failures.map(f => '  - ' + f).join('\n'));
    process.exitCode = 1;
  }
  return failures.length === 0;
}

export async function ensureArt(kind) {
  const dir = path.join(ART, kind);
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

export async function serve(root) {
  const server = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url, 'http://localhost');
      if (u.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
      let rel = decodeURIComponent(u.pathname);
      if (rel.endsWith('/')) rel += 'index.html';
      const file = path.normalize(path.join(root, rel));
      if (!file.startsWith(root)) { res.writeHead(403); res.end('forbidden'); return; }
      const st = await fsp.stat(file).catch(() => null);
      if (!st || !st.isFile()) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, {
        'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
      });
      fs.createReadStream(file).pipe(res);
    } catch (e) {
      res.writeHead(500); res.end(String(e && e.message));
    }
  });
  await new Promise((res, rej) => { server.once('error', rej); server.listen(0, '127.0.0.1', res); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, server, close: () => new Promise(r => server.close(r)) };
}

export async function launch() {
  if (!fs.existsSync(CHROME)) throw new Error('找不到 Chrome：' + CHROME);
  return chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--disable-features=CalculateNativeWinOcclusion',
      '--mute-audio',
    ],
  });
}

export async function newPage(browser, { width = 1280, height = 900 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return { context, page, errors };
}

export async function waitGame(page, timeout = 30000) {
  await page.waitForFunction(() => window.__game && window.__game.level && window.__game.state, null, { timeout });
  await page.waitForFunction(() => {
    const s = document.getElementById('status');
    return s && /关卡就绪|就绪/.test(s.textContent || '');
  }, null, { timeout: Math.max(5000, timeout) }).catch(() => {});
}

export const FAST_AUTO = {
  level: 'reference',
  autoSpeed: 6,
  autoStartDelay: 0,
  moveMin: 50,
  moveMax: 50,
  delayMin: 0,
  delayMax: 0,
  thinkChance: 0,
  winDur: 400,
  failDur: 300,
  endDelay: 50,
  hintShow: false,
  handShow: true,
  manualHand: true,
  hideCursor: true,
  endCard: true,
  endCardHand: true,
  sfxMute: true,
};

/** Apply fast auto settings and wait for rebuild. */
export async function applyFast(page, extra = {}) {
  await page.evaluate(async (patch) => { await window.__game.apply(patch); }, { ...FAST_AUTO, ...extra });
  await page.waitForTimeout(250);
}

/** Start auto-solve and wait until the end card is shown and recording stops. */
export async function autoToEnd(page, { timeout = 90000, extra = {}, snapEvery = 6 } = {}) {
  await applyFast(page, extra);
  await page.evaluate((n) => { window.__game.setAE(n); window.__game.startAuto(); }, snapEvery);
  await page.waitForFunction(() => {
    const g = window.__game;
    return g && g.state && (g.state.won || g.state.lost) && !g.autoRunning;
  }, null, { timeout });
  await page.waitForFunction(() => window.__game.phase === 'end' || window.__game.phase === 'win' || window.__game.phase === 'fail', null, { timeout: 15000 });
  const st = await page.evaluate(() => {
    const g = window.__game;
    return {
      won: g.state.won, lost: g.state.lost, removed: g.state.removed.size,
      picked: g.state.picked, cleared: g.state.cleared,
      phase: g.phase, auto: g.autoRunning, hand: g.handDebug(),
      recFrames: g.lastAERec ? g.lastAERec.frames : 0,
      recSfx: g.lastAERec ? g.lastAERec.sfx.length : 0,
    };
  });
  return st;
}

export async function nextDownload(page, action, outDir, timeout = 120000) {
  const dlP = page.waitForEvent('download', { timeout });
  await action();
  const dl = await dlP;
  await fsp.mkdir(outDir, { recursive: true });
  const dest = path.join(outDir, dl.suggestedFilename());
  await dl.saveAs(dest);
  return dest;
}

/** Extract a zip with the system unzip command. */
export async function unzip(zipPath, dest) {
  await fsp.rm(dest, { recursive: true, force: true });
  await fsp.mkdir(dest, { recursive: true });
  execFileSync('unzip', ['-q', '-o', zipPath, '-d', dest], { stdio: 'pipe' });
  return dest;
}

export async function readJson(file) { return JSON.parse(await fsp.readFile(file, 'utf8')); }

export async function writeJson(file, obj) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, JSON.stringify(obj, null, 2));
}

export function tmpDir(prefix = 'boulder-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Parse a PNG data URL and write it to disk. */
export async function saveDataUrl(url, file) {
  const b64 = String(url).replace(/^data:image\/png;base64,/, '');
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, Buffer.from(b64, 'base64'));
}

/** Non-black / non-uniform pixel stats of a canvas or PNG via a page. */
export async function imageStats(page, dataUrl) {
  return page.evaluate(async (src) => {
    const im = new Image();
    await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = src; });
    const c = document.createElement('canvas'); c.width = 180; c.height = 320;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(im, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let sum = 0, dark = 0, lite = 0, alpha = 0;
    const colors = new Set();
    for (let i = 0; i < d.length; i += 4) {
      const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
      sum += l;
      if (l < 12) dark++;
      if (l > 30) lite++;
      if (d[i + 3] > 8) alpha++;
      if (i % 64 === 0) colors.add((d[i] >> 3) + ',' + (d[i + 1] >> 3) + ',' + (d[i + 2] >> 3));
    }
    const n = d.length / 4;
    return { mean: sum / n, darkRatio: dark / n, litRatio: lite / n, alphaRatio: alpha / n, colors: colors.size };
  }, dataUrl);
}

export function closeServer(serverCtx) { return serverCtx ? serverCtx.close() : Promise.resolve(); }
