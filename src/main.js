// 巨石营救 · 主程序
// 玩法：拆掉矿坑木架上的彩色螺丝，同色三颗自动消除；木板成片坠落，平台带着矿工上升。
// 所有画面元素都是独立 canvas 精灵，并同时驱动屏幕、AE 时间轴与 3D 导出。
import {
  GROUPS, DEFS, loadSettings, saveSettings, exportJSON, migrate, APP_ID, STORE_KEY,
} from './settings.js';
import {
  referenceLevel, makeLevel, imageLevel, initState, pick, solvePlan, hintNode,
} from './level.js';
import {
  DW, DH, LAYOUT, buildAssets, handAsset, drawItems, makeSprite, boardGeom, trayGeom, heroGeom,
} from './render.js';
import { Sfx } from './audio.js';
import { createAERecorder } from './ae/recorder.js';
import { export3DAnimation } from './export3d/export3d.js';
import { buildPanel } from './ui.js';
import {
  applyPlayableMode, exportH5PlayableFromPage, bindEditorDevicePreview,
  applyH5DevicePresetToSettings, markH5DeviceCustomIfSizeEdited,
} from './h5/index.js';
import { DEFAULT_HAND } from './default_hand.js';

const $ = id => document.getElementById(id);
const canvas = $('stage');
const ctx = canvas.getContext('2d');
const playable = !!window.__PLAYABLE__;

// ---------- 状态 ----------
let S = loadSettings();
if (playable && window.__PLAYABLE__.settings) S = { ...S, ...window.__PLAYABLE__.settings };
applyH5DevicePresetToSettings(S);

let L = null, A = {}, st = null, handImgEl = null, hand = null;
let phase = 'play'; // play | win | fail
let endShown = false;
let items = [];
let lastNow = performance.now();
let timerRunning = false;
let lastTick = -1;
let startedAt = 0;
let endShownAt = 0;
let buildBusy = Promise.resolve();
let buildToken = 0;
let ui = null;
let gameSerial = 0;

let trayNodes = []; // [{i,color}]，与 st.tray 同步
const screwCur = new Map(); // i -> {x,y,scale}
const flights = new Map();  // i -> {t0,dur,fromX,fromY,toX,toY,spin,landed}
const pendingVanish = new Map(); // i -> {at,dur}
const vanishing = new Map(); // i -> {t0,dur,x,y}
const plankAnims = new Map(); // pIdx -> {t0,dur,x,y,rot,drift}
const fx = []; // 粒子
let fxSerial = 0;
const matchFx = [];
const bonusFx = [];
let hintCache = -1, hintCalcAt = 0, lastActionAt = 0;
const seq = { winAt: 0, failAt: 0, endAt: 0, done: false };
let autoState = null, autoToken = 0;

const handState = { x: 600, y: 1480, down: false, press: 0, visible: false, tapAt: 0 };
const pointer = { x: 360, y: 900, inside: false };

const sfx = new Sfx();
const recorder = createAERecorder({ env: () => ({ S, L, A, items, canvas }), sfx });
let lastAERec = null;
let aeActive = false, aeKind = null; // manual | auto | video

const rec = { active: false, mr: null, chunks: [], stream: null, startAt: 0, stopAt: 0, mime: '', ext: 'webm' };

// ---------- 通用工具 ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const rand = (a, b) => a + Math.random() * (b - a);
const nowMs = () => performance.now();
const sleep = ms => new Promise(r => setTimeout(r, Math.max(0, ms)));

function stamp() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
function status(msg) { const el = $('status'); if (el) el.textContent = msg; }
let toastTimer = 0;
function toast(msg) {
  const el = $('toast'); if (!el) return;
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2300);
}
function loadImg(src) {
  return new Promise((res, rej) => {
    if (!src) { rej(new Error('empty')); return; }
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('图片加载失败'));
    im.src = src;
  });
}
let saveTimer = 0;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveSettings(S), 240);
}

// ---------- 关卡 ----------
async function chooseLevel() {
  if (S.level === 'random') {
    return makeLevel({ cols: S.cols, rows: S.rows, colorCount: S.colorCount, seed: S.seed });
  }
  if (S.level === 'image') {
    if (!S.shapeImg) return referenceLevel(S.colorCount);
    const im = await loadImg(S.shapeImg);
    const mw = Math.max(90, S.cols * 48), mh = Math.max(90, S.rows * 48);
    const c = document.createElement('canvas'); c.width = mw; c.height = mh;
    const g = c.getContext('2d');
    g.clearRect(0, 0, mw, mh);
    const sc = Math.min(mw / im.width, mh / im.height);
    const w = im.width * sc, h = im.height * sc;
    g.drawImage(im, (mw - w) / 2, (mh - h) / 2, w, h);
    return imageLevel(g.getImageData(0, 0, mw, mh), {
      colorCount: S.colorCount, seed: S.shapeSeed, cols: S.cols, rows: S.rows,
      threshold: S.shapeThreshold, cover: S.shapeCover,
    });
  }
  return referenceLevel(S.colorCount);
}

async function rebuildAll() {
  const token = ++buildToken;
  stopAuto();
  status('正在构建关卡与美术…');
  try {
    const L2 = await chooseLevel();
    if (token !== buildToken) return;
    L = L2;
    A = buildAssets(S, L);
    await rebuildHand();
    if (token !== buildToken) return;
    resetGame();
    status(`关卡就绪：${L.cols}×${L.rows} · ${L.total} 颗螺丝 · ${L.triples} 组三消`);
  } catch (e) {
    console.error(e);
    if (token !== buildToken) return;
    L = referenceLevel(S.colorCount);
    A = buildAssets(S, L);
    await rebuildHand();
    resetGame();
    status('图形关卡失败，已回退参考关卡：' + e.message);
  }
}

async function rebuildAssetsOnly() {
  stopAuto();
  A = buildAssets(S, L);
  await rebuildHand();
  status('美术参数已更新');
}

async function rebuildHand() {
  handImgEl = null; hand = null;
  if (A) delete A.hand;
  if (!S.handImage || playable) { if (ui) ui.setPreview(null, S); return; }
  try {
    handImgEl = await loadImg(S.handImage);
    hand = handAsset(handImgEl, S);
    // 手指既是独立精灵，也是 AE/3D 导出的固定图层素材
    if (hand) A.hand = hand;
    if (ui) ui.setPreview(handImgEl, S);
  } catch (e) {
    handImgEl = null; hand = null;
    if (A) delete A.hand;
    status('手指图片加载失败：' + e.message);
  }
}

function resetGame() {
  stopAuto();
  gameSerial++;
  st = initState(L, { timeLimit: S.timeLimit, traySlots: S.traySlots });
  trayNodes = [];
  screwCur.clear(); flights.clear(); pendingVanish.clear(); vanishing.clear(); plankAnims.clear();
  fx.length = 0; matchFx.length = 0; bonusFx.length = 0;
  phase = 'play'; endShown = false; seq.winAt = 0; seq.failAt = 0; seq.endAt = 0; seq.done = false;
  endShownAt = 0; timerRunning = false; startedAt = 0; lastTick = -1;
  lastActionAt = nowMs(); hintCache = -1;
  autosHideHand();
  if (rec.active) rec.stopAt = 0;
  refreshAutoButton();
  status('就绪');
}

function autosHideHand() {
  handState.x = 600; handState.y = 1480; handState.down = false;
}

// ---------- 场景 ----------
const spr = (arr, id, asset, x, y, z, opt) => {
  if (!A[asset]) return null;
  const s = makeSprite(A, id, asset, x, y, z, opt);
  arr.push(s); return s;
};
const nodePos = (i) => {
  const n = L.nodeMap.get(i); if (!n) return null;
  return boardGeom(L).node(n.c, n.r);
};
function slotPos(idx) {
  const T = trayGeom(S);
  const k = Math.max(0, Math.min(T.slots.length - 1, idx));
  return { x: T.x + T.slots[k], y: T.y + 3 };
}

function ropeSeg(arr, id, x1, y1, x2, y2, z, sy = 1) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 2) return;
  spr(arr, id, 'rope', x1, y1, z, { sx: len / 280, sy, rot: Math.atan2(y2 - y1, x2 - x1) });
}

function handVisibleNow() {
  if (!hand || !S.handShow) return false;
  if (endShown) return !!S.endCardHand;
  if (autoState) return true;
  return !!S.manualHand && pointer.inside;
}

function resolveHandPoint(now) {
  if (endShown && S.endCardHand) {
    const t = clamp((now - endShownAt) / 900, 0, 1), e = easeOutCubic(t);
    if (!handState.endFrom) handState.endFrom = { x: 600, y: 1040, t: endShownAt };
    return {
      x: lerp(handState.endFrom.x, 388, e),
      y: lerp(handState.endFrom.y, 806, e),
      down: t > .85 && (Math.sin((now - endShownAt) / 170) > .15),
    };
  }
  if (autoState) return { x: handState.x, y: handState.y, down: handState.down };
  return { x: pointer.x, y: pointer.y, down: pointer.inside && handState.down };
}

function addHand(arr, now) {
  if (!handVisibleNow()) return;
  const p = resolveHandPoint(now);
  const base = (S.handSize * DW) / hand.w;
  const sc = base * (1 - S.pressDepth * (p.down ? 1 : 0));
  spr(arr, 'hand', 'hand', p.x, p.y, 300, {
    sx: sc * (S.handFlip ? -1 : 1), sy: sc, rot: S.handRotation * Math.PI / 180,
  });
  if (S.tapRipple && handState.tapAt && now - handState.tapAt < 420) {
    const t = (now - handState.tapAt) / 420;
    spr(arr, 'hand_ripple', 'hint_ring', p.x, p.y, 299, { sx: .4 + t * .8, sy: .4 + t * .8, op: 1 - t });
  }
}

function screwVisual(i, now) {
  const removed = st.removed.has(i);
  const node = L.nodeMap.get(i);
  if (!node) return null;
  let base = screwCur.get(i);
  if (!base) { const p = nodePos(i); base = { x: p.x, y: p.y, scale: 0.92 }; screwCur.set(i, base); }
  // 飞向托盘
  const fly = flights.get(i);
  let target = null;
  if (fly) {
    const t = clamp((now - fly.t0) / fly.dur, 0, 1), e = easeInOutCubic(t);
    const cx = lerp(fly.fromX, fly.toX, e), cy = lerp(fly.fromY, fly.toY, e) - Math.sin(Math.PI * e) * 105;
    base.x = cx; base.y = cy;
    base.rot = fly.spin * e;
    if (t >= 1) {
      base.x = fly.toX; base.y = fly.toY; base.rot = 0;
      flights.delete(i);
      sfx.play('land', S);
      if (pendingVanish.has(i)) { const q = pendingVanish.get(i); pendingVanish.delete(i); vanishScrew(i, q.dur, now, base.x, base.y); }
    }
    return { x: base.x, y: base.y, scale: 0.92, rot: base.rot || 0, op: 1 };
  }
  const v = vanishing.get(i);
  if (v) {
    const t = clamp((now - v.t0) / v.dur, 0, 1);
    if (t >= 1) { vanishing.delete(i); screwCur.delete(i); return null; }
    return { x: v.x, y: v.y - t * 24, scale: 0.92 * (1 + .45 * t), rot: t * .5, op: 1 - t };
  }
  if (removed) return null;
  target = nodePos(i);
  const idx = trayNodes.findIndex(q => q.i === i);
  if (idx >= 0) {
    const sp = slotPos(idx);
    target = sp; base.scale = 0.86;
  } else {
    base.scale = 0.92 * S.screwSize;
  }
  base.x = lerp(base.x, target.x, .28);
  base.y = lerp(base.y, target.y, .28);
  base.rot = 0;
  return { x: base.x, y: base.y, scale: base.scale, rot: 0, op: 1 };
}

function vanishScrew(i, dur, now, x, y) {
  let px = x, py = y;
  const f = flights.get(i);
  if (f) { px = f.toX; py = f.toY; flights.delete(i); }
  vanishing.set(i, { t0: now, dur: dur || S.tripleDur, x: px, y: py });
}

function addFx(asset, x, y, z, t0, dur, opt = {}) {
  fx.push({
    id: 'fx_' + (++fxSerial), asset, x, y, z: z || 54, t0, dur,
    sx: opt.sx || 1, sy: opt.sy || 1, rot: opt.rot || 0, vr: opt.vr || 0,
    vx: opt.vx || 0, vy: opt.vy || 0, gravity: opt.gravity || 0,
    s0: opt.s0 == null ? 1 : opt.s0, s1: opt.s1 == null ? 0 : opt.s1,
    op0: opt.op0 == null ? 1 : opt.op0, op1: opt.op1 == null ? 0 : opt.op1,
  });
}
function burst(kind, x, y, n, now) {
  for (let k = 0; k < n; k++) {
    if (kind === 'spark') {
      addFx(k % 3 ? 'spark' : 'spark_white', x + rand(-18, 18), y + rand(-18, 18), 56, now, rand(320, 620), {
        vx: rand(-180, 180), vy: rand(-260, -40), gravity: 520, s0: rand(.7, 1.3), s1: 0, op0: 1,
      });
    } else if (kind === 'chip') {
      addFx(k % 2 ? 'chip0' : 'chip1', x + rand(-24, 24), y + rand(-16, 16), 53, now, rand(420, 820), {
        vx: rand(-130, 130), vy: rand(-230, -60), gravity: 760, s0: rand(.6, 1.1), s1: .3, op0: 1, op1: 0,
      });
    } else {
      addFx('dust', x + rand(-26, 26), y + rand(-18, 18), 52, now, rand(420, 760), {
        vx: rand(-40, 40), vy: rand(-60, 10), s0: rand(.8, 1.5), s1: rand(1.8, 2.8), op0: .7, op1: 0,
      });
    }
  }
}

function addScrewItems(arr, now) {
  for (const n of L.nodes) {
    const v = screwVisual(n.i, now);
    if (!v) continue;
    spr(arr, 'screw_' + n.i, 'screw_' + n.color, v.x, v.y, 50, { sx: v.scale, sy: v.scale, rot: v.rot, op: v.op });
  }
}

function addPlankItems(arr, now) {
  const B = boardGeom(L);
  for (let p = 0; p < L.planks.length; p++) {
    const q = L.planks[p];
    const a = L.nodeMap.get(q.a), b = L.nodeMap.get(q.b);
    if (!a || !b) continue;
    const pa = B.node(a.c, a.r), pb = B.node(b.c, b.r);
    const x = (pa.x + pb.x) / 2, y = (pa.y + pb.y) / 2;
    const asset = (q.dir === 'h' ? 'plank_h' : 'plank_v') + (p % 2);
    const anim = plankAnims.get(p);
    if (anim) {
      const t = clamp((now - anim.t0) / anim.dur, 0, 1);
      if (t >= 1) { plankAnims.delete(p); continue; }
      spr(arr, 'plank_' + p, asset, anim.x + anim.drift * t, anim.y + 560 * t * t, 34, {
        rot: anim.rot + t * 1.2, op: 1 - t * .85,
      });
      continue;
    }
    if (st.planksDown.has(p)) continue;
    spr(arr, 'plank_' + p, asset, x, y, 33, { rot: (p % 5 - 2) * .0015 });
  }
}

function addTimer(arr, now) {
  const frac = clamp(st.timeLeft / Math.max(1, S.timeLimit), 0, 1);
  const color = frac > .5 ? 'g' : frac > .2 ? 'y' : 'r';
  const urgent = frac <= .2 && phase === 'play';
  const pulse = urgent ? 1 + Math.sin(now / 120) * .035 : 1;
  spr(arr, 'timer_ring', 'timer_ring_' + color, LAYOUT.timer.x, LAYOUT.timer.y, 82, { sx: pulse, sy: pulse });
  const ang = -Math.PI / 2 + (1 - frac) * Math.PI * 2;
  spr(arr, 'timer_marker', 'timer_marker', LAYOUT.timer.x + Math.cos(ang) * 44, LAYOUT.timer.y + Math.sin(ang) * 44, 83, {
    sx: urgent ? 1.2 : 1, sy: urgent ? 1.2 : 1,
  });
  const text = String(Math.max(0, Math.ceil(st.timeLeft)));
  const w = text.length * 30;
  for (let k = 0; k < text.length; k++) {
    spr(arr, 'timer_digit_' + k, 'digit_' + text[k], LAYOUT.timer.x - w / 2 + 17 + k * 30, LAYOUT.timer.y + 4, 84, { sx: .82, sy: .82 });
  }
}

function addHud(arr, now) {
  if (A.caption) spr(arr, 'caption', 'caption', 322, S.captionY, 86);
  if (A.disclaimer && !endShown) {
    const a = A.disclaimer;
    spr(arr, 'disclaimer', 'disclaimer', 360, DH - S.discY - a.h / 2, 90);
  }
  if (!endShown && phase === 'play') {
    if (S.hintShow && !autoState && now - lastActionAt > S.hintDelay) {
      if (now - hintCalcAt > 700) { hintCalcAt = now; hintCache = hintNode(L, st); }
      if (hintCache >= 0) {
        const p = nodePos(hintCache);
        if (p) {
          const t = (now % 1100) / 1100;
          spr(arr, 'hint', 'hint_ring', p.x, p.y, 49, { sx: .9 + Math.sin(t * Math.PI * 2) * .08, sy: .9 + Math.sin(t * Math.PI * 2) * .08, op: .85 });
        }
      }
    }
  }
}

function addFxItems(arr, now) {
  for (const f of fx) {
    const t = (now - f.t0) / f.dur;
    if (t < 0 || t > 1) continue;
    const x = f.x + f.vx * (now - f.t0) / 1000;
    const y = f.y + f.vy * (now - f.t0) / 1000 + .5 * f.gravity * Math.pow((now - f.t0) / 1000, 2);
    const sc = lerp(f.s0, f.s1, t);
    spr(arr, f.id, f.asset, x, y, f.z, { sx: sc, sy: sc, rot: f.rot + f.vr * t, op: lerp(f.op0, f.op1, t) });
  }
  for (const m of matchFx) {
    const t = (now - m.t0) / m.dur; if (t < 0 || t > 1) continue;
    spr(arr, m.id, 'match_ring', m.x, m.y, 53, { sx: .55 + t * .9, sy: .55 + t * .9, op: 1 - t });
  }
  for (const b of bonusFx) {
    const t = (now - b.t0) / b.dur; if (t < 0 || t > 1) continue;
    spr(arr, b.id, 'plus_time', b.x, b.y - t * 46, 55, { sx: 1 - t * .12, sy: 1 - t * .12, op: t < .2 ? t * 5 : 1 - (t - .2) / .8 });
  }
}

function addParticles(arr, now) { addFxItems(arr, now); }

function sceneGameplay(now) {
  const arr = [];
  spr(arr, 'background', 'background', 360, 640, 0);
  if (A.acid) spr(arr, 'acid', 'acid', 122, 1278, 2, { sy: .62 });
  for (let i = 0; i < 5; i++) {
    const period = 4300 + i * 760, t = ((now + i * 1400) % period) / period;
    const x = 30 + ((i * 53) % 180) + Math.sin(now / 900 + i) * 7;
    const y = 1250 - t * 345;
    if (y > 900) spr(arr, 'bubble_' + i, 'bubble', x, y, 3, { op: .25 + .5 * (1 - t), sx: .7 + t * .6, sy: .7 + t * .6 });
  }
  spr(arr, 'board', 'board', LAYOUT.board.left + LAYOUT.board.w / 2, LAYOUT.board.top + LAYOUT.board.h / 2, 30);

  const progress = L.triples ? st.cleared / L.triples : 0;
  const winExtra = phase === 'win' ? easeOutCubic(clamp((now - seq.winAt) / Math.max(1, S.winDur), 0, 1)) * 64 : 0;
  const lift = S.platformLift * progress + winExtra;
  const hg = heroGeom(lift);
  const shake = phase === 'fail' ? Math.sin(now / 26) * 5 * (1 - clamp((now - seq.failAt) / 700, 0, 1)) : 0;

  // 悬石、绞盘、配重
  let slabY = LAYOUT.slab.y + Math.sin(now / 900) * 3;
  let slabRot = Math.sin(now / 1200) * .014;
  if (phase === 'fail') { const t = easeOutCubic(clamp((now - seq.failAt) / Math.max(1, S.failDur), 0, 1)); slabY += t * 160; slabRot += t * .08; }
  if (phase === 'win') { const t = easeInOutCubic(clamp((now - seq.winAt) / Math.max(1, S.winDur), 0, 1)); slabY -= t * 64; slabRot -= t * .045; }
  if (A.slab) spr(arr, 'slab', 'slab', LAYOUT.slab.x + shake * .3, slabY, 22, { rot: slabRot });
  if (A.pulley) spr(arr, 'pulley', 'pulley', LAYOUT.pulley.x, LAYOUT.pulley.y, 24, { rot: Math.sin(now / 1400) * .025 });
  const weightY = LAYOUT.weight.y + progress * 74 + Math.sin(now / 1100) * 3;
  if (A.weight) spr(arr, 'weight', 'weight', LAYOUT.weight.x, weightY, 23, { rot: Math.sin(now / 1300) * .03 });
  ropeSeg(arr, 'rope_weight', LAYOUT.pulley.x - 10, LAYOUT.pulley.y + 20, LAYOUT.weight.x, weightY - 82, 23, .9);
  ropeSeg(arr, 'rope_hand', hg.handR.x + 4, hg.handR.y - 4, LAYOUT.pulley.x + 26, LAYOUT.pulley.y + 8, 25, 1);
  ropeSeg(arr, 'rope_grip', hg.handL.x + 8, hg.handL.y + 2, hg.handR.x - 2, hg.handR.y - 8, 25.5, .72);

  // 平台与矿工
  const platformY = LAYOUT.platform.y - lift;
  if (A.platform) spr(arr, 'platform', 'platform', LAYOUT.platform.x, platformY, 26);
  if (S.showMiner) {
    spr(arr, 'hero_shadow', 'hero_shadow', hg.x + 2, hg.foot + 3, 37, { sx: .74, sy: .7 });
    const scared = phase === 'play';
    const win = phase === 'win';
    const fail = phase === 'fail';
    const bob = scared ? Math.sin(now / 520) * 1.4 : win ? Math.sin(now / 240) * 2.2 : 0;
    const legRot = scared ? Math.sin(now / 320) * .045 : fail ? .24 : WinLeg(now);
    spr(arr, 'hero_leg_l', 'hero_leg_l', hg.legL.x, hg.legL.y, 38, { rot: -legRot, sx: .92, sy: .92 });
    spr(arr, 'hero_leg_r', 'hero_leg_r', hg.legR.x, hg.legR.y, 39, { rot: legRot * 1.15, sx: .92, sy: .92 });
    spr(arr, 'hero_body', 'hero_body', hg.body.x, hg.body.y + bob, 40, { rot: fail ? .16 : Math.sin(now / 700) * .012, sx: .94, sy: .94 });
    // 两手都握住绳子：前臂略低、后臂略高，形成向后使劲的姿势
    const armBase = scared ? -0.48 : win ? 1.02 : -0.2;
    spr(arr, 'hero_arm_l', 'hero_arm_l', hg.shoulderL.x, hg.shoulderL.y + bob, 41, { rot: armBase - .12 + Math.sin(now / 480) * .025, sx: .93, sy: .93 });
    spr(arr, 'hero_arm_r', 'hero_arm_r', hg.shoulderR.x, hg.shoulderR.y + bob, 42, { rot: (win ? 1.18 : armBase + .08) + Math.sin(now / 520 + 1) * .03, sx: .93, sy: .93 });
    const headAsset = win ? 'hero_head_happy' : fail ? 'hero_head_dizzy' : 'hero_head';
    spr(arr, 'hero_head', headAsset, hg.headPos.x + shake * .16, hg.headPos.y + bob * .7, 43, { rot: (fail ? .22 : Math.sin(now / 760) * .026) + shake * .001, sx: .95, sy: .95 });
  }

  // 托盘底座 + 托盘
  if (A.tray_mount) spr(arr, 'tray_mount', 'tray_mount', 520, 522, 45.5);
  if (A.tray) {
    const shakeX = matchFx.length ? Math.sin(now / 22) * 3 * Math.max(0, 1 - (now - matchFx[matchFx.length - 1].t0) / 380) : 0;
    spr(arr, 'tray', 'tray', LAYOUT.tray.x + shakeX, LAYOUT.tray.y, 46);
  }

  addPlankItems(arr, now);
  addScrewItems(arr, now);

  if (phase === 'win') {
    const t = clamp((now - seq.winAt) / Math.max(1, S.winDur), 0, 1);
    if (A.win_rays) spr(arr, 'win_rays', 'win_rays', 360, 660, 47, { sx: .7 + t * .35, sy: .7 + t * .35, op: t * .8, rot: now / 5000 });
    if (A.escape_glow) spr(arr, 'escape_glow', 'escape_glow', LAYOUT.hero.x, hg.headPos.y + 20, 48, { sx: 1 + t * .7, sy: 1 + t * .7, op: .45 + t * .4 });
  }

  addHud(arr, now);
  addParticles(arr, now);
  addTimer(arr, now);

  if (phase === 'fail') {
    const t = clamp((now - seq.failAt) / 700, 0, 1);
    if (A.flash_fail && t < 1) spr(arr, 'flash_fail', 'flash_fail', 360, 640, 250, { op: (1 - t) * .9 });
  }
  if (phase === 'win') {
    const t = clamp((now - seq.winAt) / 600, 0, 1);
    if (A.flash_win && t < 1) spr(arr, 'flash_win', 'flash_win', 360, 640, 250, { op: (1 - t) * .8 });
  }
  addHand(arr, now);
  return arr;
}
function WinLeg(now) { return Math.sin(now / 240) * .13; }

function sceneEnd(now) {
  const arr = [];
  spr(arr, 'background', 'background', 360, 640, 0);
  const fail = !!st.lost;
  spr(arr, 'end_card', fail ? 'end_card_fail' : 'end_card_win', 360, 640, 200);
  const since = now - endShownAt;
  const glow = 1 + Math.sin(since / 900) * .06;
  spr(arr, 'end_glow', 'end_glow', 360, 640, 201, { sx: .82 * glow, sy: .82 * glow, op: .65 });
  const hop = Math.abs(Math.sin(since / 620)) * 9;
  spr(arr, 'end_hero', 'end_hero', 360, 690 - hop, 202, { sx: 1.05, sy: 1.05, rot: Math.sin(since / 900) * .012 });
  const pulse = 1 + Math.sin(since / 280) * .028;
  spr(arr, 'end_cta', 'end_cta', 360, 802, 203, { sx: pulse, sy: pulse });
  addHand(arr, now);
  return arr;
}

function buildScene(now) {
  if (endShown && S.endCard !== false) return sceneEnd(now);
  return sceneGameplay(now);
}

// ---------- 游戏动作 ----------
function syncTrayAfterPick(result, nodeId, now) {
  trayNodes.push({ i: nodeId, color: result.color });
  const T = trayGeom(S);
  const slot = Math.max(0, Math.min(T.slots.length - 1, result.slot));
  const to = slotPos(slot);
  const from = nodePos(nodeId);
  const cur = screwCur.get(nodeId);
  flights.set(nodeId, {
    t0: now, dur: S.takeoffDur, fromX: cur ? cur.x : from.x, fromY: cur ? cur.y : from.y,
    toX: to.x, toY: to.y, spin: 4.4,
  });
  if (result.matched) {
    const ids = [];
    for (let k = trayNodes.length - 1; k >= 0 && ids.length < 3; k--) {
      if (trayNodes[k].color === result.color) ids.push(trayNodes[k].i);
    }
    trayNodes = trayNodes.filter(q => !ids.includes(q.i));
    const T2 = trayGeom(S);
    const toSlot = slotPos(Math.min(result.slot, T2.slots.length - 1));
    for (const id of ids) {
      if (id === nodeId) {
        const remain = Math.max(80, S.takeoffDur * .9);
        pendingVanish.set(id, { at: now + remain, dur: S.tripleDur * .55 });
      } else {
        const f = flights.get(id);
        const p = f ? { x: f.toX, y: f.toY } : toSlot;
        vanishScrew(id, S.tripleDur * .55, now, p.x, p.y);
      }
      if (flights.has(id) && id !== nodeId) flights.delete(id);
    }
    matchFx.push({ id: 'match_' + (++fxSerial), t0: now + S.takeoffDur * .5, dur: S.tripleDur, x: LAYOUT.tray.x, y: LAYOUT.tray.y });
    bonusFx.push({ id: 'bonus_' + (++fxSerial), t0: now + S.takeoffDur * .55, dur: 900, x: LAYOUT.timer.x - 10, y: LAYOUT.timer.y + 76 });
    setTimeout(() => { if (phase === 'play' || phase === 'win') sfx.play('match', S); }, S.takeoffDur * .45);
    for (let k = 0; k < 10; k++) addFx(k % 2 ? 'spark' : 'spark_white', LAYOUT.tray.x + rand(-60, 60), LAYOUT.tray.y + rand(-18, 18), 54, now + S.takeoffDur * .5, rand(380, 700), { vx: rand(-210, 210), vy: rand(-230, -20), gravity: 460, s0: rand(.5, 1.1), s1: 0 });
  }
  if (result.released && result.released.length) {
    for (const p of result.released) {
      const q = L.planks[p], a = L.nodeMap.get(q.a), b = L.nodeMap.get(q.b);
      if (!a || !b) continue;
      const pa = nodePos(q.a), pb = nodePos(q.b);
      plankAnims.set(p, {
        t0: now + 60, dur: S.plankFallDur, x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2,
        rot: 0, drift: rand(-80, 80),
      });
      burst('chip', (pa.x + pb.x) / 2, (pa.y + pb.y) / 2, 4, now + 60);
      burst('dust', (pa.x + pb.x) / 2, (pa.y + pb.y) / 2, 2, now + 60);
    }
    sfx.play('plank', S);
  }
}

function doPick(i) {
  if (!st || phase !== 'play') return { ok: false, reason: 'phase' };
  const now = nowMs();
  const r = pick(L, st, i, { failOnJam: S.failOnJam, matchBonus: S.matchBonus, timeLimit: S.timeLimit });
  if (!r.ok) return r;
  lastActionAt = now;
  hintCache = -1;
  handState.tapAt = now;
  sfx.play('pick', S);
  burst('spark', nodePos(i).x, nodePos(i).y, 3, now);
  if (S.rockFall) burst('chip', nodePos(i).x, nodePos(i).y, 2, now);
  syncTrayAfterPick(r, i, now);
  if (r.lost) failGame('托盘被异色螺丝塞满了');
  else if (r.won) winGame();
  return r;
}

function winGame() {
  if (phase !== 'play') return;
  phase = 'win';
  seq.winAt = nowMs();
  seq.endAt = seq.winAt + S.winDur + S.endDelay;
  sfx.play('win', S);
  for (let k = 0; k < 26; k++) addFx(k % 2 ? 'spark' : 'spark_white', LAYOUT.hero.x + rand(-120, 120), 420 + rand(-160, 100), 56, seq.winAt + k * 12, rand(600, 1200), {
    vx: rand(-260, 260), vy: rand(-320, -60), gravity: 380, s0: rand(.6, 1.4), s1: 0,
  });
  scheduleAutoStop();
}

function failGame(reason) {
  if (phase !== 'play') return;
  phase = 'fail';
  seq.failAt = nowMs();
  seq.endAt = seq.failAt + S.failDur + S.endDelay;
  sfx.play('fail', S);
  for (let k = 0; k < 18; k++) addFx('dust', LAYOUT.slab.x + rand(-180, 180), 300 + rand(-60, 120), 54, seq.failAt + k * 20, rand(500, 1200), {
    vx: rand(-100, 100), vy: rand(-40, 80), s0: rand(.8, 1.6), s1: rand(2, 3.2), op0: .8,
  });
  status('失败：' + reason);
  scheduleAutoStop();
}

function scheduleAutoStop() {
  if (!rec.active) return;
  if (!autoState) return;
  if (!S.autoStop) return;
  const at = (phase === 'win' ? seq.winAt + S.winDur : seq.failAt + S.failDur) + S.endDelay + S.tailSec * 1000;
  rec.stopAt = Math.max(rec.stopAt || 0, at);
}

function showEndCard() {
  if (endShown) return;
  endShown = true;
  endShownAt = nowMs();
  seq.done = true;
  handState.endFrom = null;
  if (S.endCard === false) {
    status('本局结束（结束页已关闭）');
  }
}

// ---------- 自动通关 ----------
function refreshAutoButton() {
  const b = $('btnAuto'); if (!b) return;
  b.textContent = autoState ? '■ 停止' : '▶ 自动通关';
  b.classList.toggle('on', !!autoState);
}

function stopAuto() {
  if (autoState) {
    autoState.cancel = true;
    autoState = null;
    if (handState.tween) { const t = handState.tween; handState.tween = null; try { t.resolve(false); } catch (e) {} }
    handState.down = false;
    refreshAutoButton();
  }
}

function autoMoveTo(x, y, token) {
  return new Promise(resolve => {
    const fromX = handState.x, fromY = handState.y;
    const dist = Math.hypot(x - fromX, y - fromY);
    const base = clamp(dist * 1.25, S.moveMin, S.moveMax);
    handState.tween = {
      fromX, fromY, toX: x, toY: y, start: nowMs(), dur: Math.max(50, base / Math.max(.1, S.autoSpeed)),
      token, resolve,
    };
  });
}

async function startAuto() {
  if (autoState) return;
  if (endShown || phase !== 'play') resetGame();
  if (!L) return;
  const token = ++autoToken;
  autoState = { cancel: false, token };
  refreshAutoButton();
  handState.x = 590; handState.y = 1460; handState.down = false;
  if (!recorder.rec) startAE('auto');
  if (S.autoRec && !rec.active) startVideo(true);
  await sleep(S.autoStartDelay / Math.max(.1, S.autoSpeed));
  if (!autoState || token !== autoToken || autoState.cancel) return;
  try {
    while (autoState && token === autoToken && !autoState.cancel && !st.won && !st.lost) {
      const plan = solvePlan(L, st);
      if (!plan || !plan.length) { status('求解器没有给出下一步'); break; }
      const idx = plan[0], p = nodePos(idx);
      if (!p) break;
      const ok = await autoMoveTo(p.x, p.y, token);
      if (!ok || !autoState || autoState.cancel) break;
      handState.down = true;
      await sleep(92 / Math.max(.1, S.autoSpeed));
      if (!autoState || autoState.cancel) break;
      const r = doPick(idx);
      await sleep(120 / Math.max(.1, S.autoSpeed));
      handState.down = false;
      if (!r.ok) { status('自动通关被中断：' + r.reason); break; }
      const delay = rand(S.delayMin, S.delayMax) / Math.max(.1, S.autoSpeed);
      await sleep(delay);
      if (S.thinkChance > 0 && Math.random() < S.thinkChance) await sleep(rand(180, S.thinkMax) / Math.max(.1, S.autoSpeed));
    }
    // 等结束页出现，把结束页也记进 AE/3D
    const deadline = nowMs() + S.winDur + S.failDur + S.endDelay + 2500;
    while (autoState && !autoState.cancel && (phase === 'win' || phase === 'fail') && !seq.done && nowMs() < deadline) await sleep(80);
    if (seq.done || S.endCard === false) {
      while (autoState && !autoState.cancel && !endShown && nowMs() < deadline) await sleep(80);
      await sleep(650 / Math.max(.1, S.autoSpeed));
    }
  } finally {
    if (token === autoToken) {
      const wasAuto = autoState && autoState.aeFromAuto;
      autoState = null;
      handState.down = false;
      refreshAutoButton();
      if (!rec.active && recorder.rec && aeKind === 'auto') {
        lastAERec = recorder.stop(); aeKind = null; aeActive = false; refreshAEButton();
      }
      if (st && (st.won || st.lost)) status(st.won ? '通关完成 · 可导出 AE / 3D' : '挑战失败 · 可重新开始');
      void wasAuto;
    }
  }
}

// ---------- 手指 / 输入 ----------
function canvasPos(ev) {
  const r = canvas.getBoundingClientRect();
  return { x: (ev.clientX - r.left) * DW / Math.max(1, r.width), y: (ev.clientY - r.top) * DH / Math.max(1, r.height) };
}
function nodeAt(x, y) {
  let best = -1, bd = 46 * 46;
  for (const n of L.nodes) {
    if (st.removed.has(n.i)) continue;
    const p = nodePos(n.i);
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bd) { bd = d; best = n.i; }
  }
  return best;
}
function inCta(x, y) { return x > 100 && x < 620 && y > 735 && y < 870; }

canvas.addEventListener('pointerenter', ev => {
  pointer.inside = true;
  const p = canvasPos(ev); pointer.x = p.x; pointer.y = p.y;
});
canvas.addEventListener('pointermove', ev => {
  const p = canvasPos(ev); pointer.x = p.x; pointer.y = p.y; pointer.inside = true;
  if (!autoState && !endShown && S.manualHand) handState.down = handState.down;
});
canvas.addEventListener('pointerleave', () => { pointer.inside = false; handState.down = false; });
canvas.addEventListener('pointerdown', ev => {
  sfx.resume();
  const p = canvasPos(ev); pointer.x = p.x; pointer.y = p.y; pointer.inside = true;
  if (autoState) return;
  if (endShown) {
    handState.down = true;
    if (!playable && inCta(p.x, p.y)) resetGame();
    return;
  }
  if (phase !== 'play') return;
  handState.down = true;
  const i = nodeAt(p.x, p.y);
  if (i >= 0) doPick(i);
  else handState.down = false;
});
canvas.addEventListener('pointerup', () => { handState.down = false; });
canvas.addEventListener('pointercancel', () => { handState.down = false; });

// ---------- 录制 ----------
function refreshRecButton() {
  const b = $('btnRec'); if (!b) return;
  b.textContent = rec.active ? '■ 停止录制' : '⏺ 开始录制';
  b.classList.toggle('on', rec.active);
}
function mimeCandidates() {
  const prefer = S.recFormat;
  const mp4 = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=h264', 'video/mp4'];
  const webm = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return prefer === 'webm' ? webm : prefer === 'mp4' ? mp4 : [...mp4, ...webm];
}
function startVideo(auto) {
  if (rec.active) return;
  try {
    sfx.resume();
    const stream = canvas.captureStream(S.recFps);
    rec.stream = stream;
    const a = sfx.ensure();
    if (a && sfx.recDest) for (const t of sfx.recDest.stream.getAudioTracks()) stream.addTrack(t);
    let mime = '';
    for (const m of mimeCandidates()) { if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) { mime = m; break; } }
    const opt = { videoBitsPerSecond: Math.round(S.recBitrate * 1e6) };
    if (mime) opt.mimeType = mime;
    const mr = new MediaRecorder(stream, opt);
    rec.mr = mr; rec.chunks = []; rec.mime = mr.mimeType || mime || 'video/webm';
    rec.ext = rec.mime.includes('mp4') ? 'mp4' : 'webm';
    mr.ondataavailable = e => { if (e.data && e.data.size) rec.chunks.push(e.data); };
    mr.onstop = async () => {
      const type = rec.mime || 'video/webm';
      const blob = new Blob(rec.chunks, { type });
      const name = `boulder_rescue_${rec.ext === 'mp4' ? 'rec' : 'rec'}_${stamp()}.${rec.ext}`;
      if (blob.size) download(blob, name);
      rec.active = false; refreshRecButton();
      $('recInfo').textContent = `已保存 ${name} · ${(blob.size / 1048576).toFixed(2)} MB`;
      addRecLink(name, blob);
      const exportNow = S.aeWithRec && recorder.rec && (aeKind === 'video' || aeKind === 'auto');
      if (exportNow) {
        lastAERec = recorder.stop(); aeActive = false; aeKind = null; refreshAEButton();
        try { await exportRecord(lastAERec, true); } catch (e) { status('AE 导出失败：' + e.message); }
      }
      if (rec.stream) { try { rec.stream.getTracks().forEach(t => t.stop()); } catch (e) {} rec.stream = null; }
    };
    if (S.aeWithRec && !recorder.rec) startAE('video');
    rec.stopAt = 0;
    mr.start(1000);
    rec.active = true; rec.startAt = nowMs();
    refreshRecButton();
    $('recInfo').textContent = '录制中…';
    if (!auto) status('开始录制（' + rec.ext.toUpperCase() + '）');
  } catch (e) {
    console.error(e);
    status('无法开始录制：' + e.message);
    toast('录制不可用：' + e.message);
  }
}
function stopVideo() {
  if (!rec.active || !rec.mr) return;
  rec.stopAt = 0;
  try { rec.mr.stop(); } catch (e) { console.warn(e); }
  refreshRecButton();
}
function addRecLink(name, blob) {
  const box = $('recList'); if (!box) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.textContent = '⬇ ' + name;
  box.prepend(a);
  while (box.children.length > 4) box.lastChild.remove();
}

// ---------- AE ----------
function refreshAEButton() {
  if (ui) ui.setButtonText('_aeToggle', aeActive ? '■ 停止记录' : '● 开始记录', aeActive);
}
function startAE(kind) {
  if (!recorder.rec) recorder.start();
  aeActive = true;
  aeKind = kind || 'manual';
  refreshAEButton();
  if (kind !== 'auto' && kind !== 'video') status('AE 时间轴记录中…');
}
function stopAEKeep() {
  if (!recorder.rec) return null;
  lastAERec = recorder.stop();
  aeActive = false; aeKind = null;
  refreshAEButton();
  return lastAERec;
}
async function exportRecord(record, isAuto) {
  const r = record || lastAERec || recorder.rec;
  if (!r) throw new Error('还没有可导出的记录：先自动通关或手动游玩');
  const out = await recorder.exportZip(r);
  download(out.blob, out.name);
  lastAERec = r;
  status(`AE 工程已导出：${out.name} · ${out.stats.layers} 图层 / ${out.stats.keys} 关键帧`);
  if (typeof window !== 'undefined') window.__lastAEExport = out;
  return out;
}
async function toggleAE() {
  if (aeActive) {
    stopAEKeep();
    status('AE 记录已停止 · 点「⬇ 导出 ZIP」下载');
  } else {
    startAE('manual');
  }
}
async function exportAE() {
  try {
    if (recorder.rec) { lastAERec = recorder.stop(); aeActive = false; aeKind = null; refreshAEButton(); }
    await exportRecord(lastAERec, false);
  } catch (e) {
    console.error(e); status('AE 导出失败：' + e.message); toast('AE 导出失败：' + e.message);
  }
}

// ---------- 3D ----------
async function export3D() {
  try {
    let r = recorder.rec;
    if (r) { lastAERec = recorder.stop(); aeActive = false; aeKind = null; refreshAEButton(); r = lastAERec; }
    else r = lastAERec;
    if (!r) throw new Error('还没有记录：先自动通关（会自动记录时间轴）或开启 AE 记录后手动游玩');
    status('正在生成 3D 场景（glTF + FBX）…');
    const out = await export3DAnimation({ rec: r, S, recorder, canvas });
    download(out.blob, out.name);
    status(`3D 已导出：${out.name} · ${out.stats.layers} 图层 / ${out.stats.frames} 帧 / FBX ${(out.stats.fbxBytes / 1024).toFixed(0)} KB`);
    if (typeof window !== 'undefined') window.__last3DExport = out;
    toast('3D 导出完成');
  } catch (e) {
    console.error(e); status('3D 导出失败：' + e.message); toast('3D 导出失败：' + e.message);
  }
}

// ---------- H5 ----------
async function exportH5() {
  try {
    await exportH5PlayableFromPage({
      toolId: APP_ID, S, status, toast,
      stripDataUrls: [DEFAULT_HAND],
    });
  } catch (e) {
    console.error(e); status('H5 导出失败：' + e.message); toast('H5 导出失败：' + e.message);
  }
}

// ---------- 设置面板 ----------
const LEVEL_KEYS = new Set(['level', 'seed', 'cols', 'rows', 'colorCount', 'traySlots', 'shapeImg', 'shapeThreshold', 'shapeCover', 'shapeSeed']);
const ART_KEYS = new Set(['brickColor', 'brickDark', 'rockColor', 'rockLight', 'acidColor', 'woodColor', 'woodDark', 'trayColor', 'metalColor', 'glowColor', 'bgGrain', 'vignette', 'screwSize', 'plankW', 'platformLift', 'showMiner', 'rockFall', 'captionShow', 'captionText', 'captionY', 'discShow', 'discText', 'discY', 'discSize', 'endTitle', 'endSub', 'ctaText']);
const HAND_KEYS = new Set(['handImage', 'handSize', 'handAnchorX', 'handAnchorY', 'handRotation', 'handFlip', 'pressDepth']);

let artDebounce = 0;
function onChange(key, value, type) {
  if (key === 'h5Device') {
    applyH5DevicePresetToSettings(S);
    if (ui) ui.sync();
    try { window.__h5EditorDeviceFit && window.__h5EditorDeviceFit(); } catch (e) {}
  }
  if (key === 'h5DeviceW' || key === 'h5DeviceH') {
    markH5DeviceCustomIfSizeEdited(S);
    if (ui) ui.sync();
    try { window.__h5EditorDeviceFit && window.__h5EditorDeviceFit(); } catch (e) {}
  }
  if (key === 'timeLimit' && st && !st.started) st.timeLeft = S.timeLimit;
  if (key === 'shapeImg') S.level = 'image';
  scheduleSave();
  if (LEVEL_KEYS.has(key)) {
    ui.sync();
    buildBusy = buildBusy.then(rebuildAll);
  } else if (ART_KEYS.has(key)) {
    clearTimeout(artDebounce);
    artDebounce = setTimeout(() => { buildBusy = buildBusy.then(rebuildAssetsOnly); }, 180);
  } else if (HAND_KEYS.has(key)) {
    clearTimeout(artDebounce);
    artDebounce = setTimeout(() => { buildBusy = buildBusy.then(async () => { await rebuildHand(); }); }, 120);
  }
}
function onButton(key) {
  if (key === '_aeToggle') toggleAE();
  else if (key === '_aeExport') exportAE();
  else if (key === '_export3d') export3D();
  else if (key === '_exportH5') exportH5();
}
function onFile(key, data) {
  if (key === 'shapeImg') {
    S.level = 'image'; scheduleSave(); ui.sync();
    buildBusy = buildBusy.then(rebuildAll);
  }
}

function applySettingsObject(patch) {
  Object.assign(S, patch);
  applyH5DevicePresetToSettings(S);
  if (ui) ui.sync();
  saveSettings(S);
  buildBusy = buildBusy.then(rebuildAll);
  return buildBusy;
}

function bindTopButtons() {
  $('btnAuto').addEventListener('click', () => { if (autoState) stopAuto(); else startAuto(); });
  $('btnRec').addEventListener('click', () => { if (rec.active) stopVideo(); else startVideo(false); });
  $('btnNew').addEventListener('click', () => { resetGame(); });
  $('btnSeed').addEventListener('click', () => {
    S.seed = Math.floor(Math.random() * 9999) + 1;
    if (S.level === 'reference') S.level = 'random';
    if (S.level === 'image') S.shapeSeed = Math.floor(Math.random() * 9999) + 1;
    scheduleSave(); ui.sync();
    buildBusy = buildBusy.then(rebuildAll);
    toast('换一局：种子 ' + S.seed);
  });
  $('btnShape').addEventListener('click', () => $('shapeFile').click());
  $('shapeFile').addEventListener('change', async () => {
    const f = $('shapeFile').files && $('shapeFile').files[0]; if (!f) return;
    const fr = new FileReader();
    fr.onload = () => { S.shapeImg = String(fr.result); S.level = 'image'; scheduleSave(); ui.sync(); buildBusy = buildBusy.then(rebuildAll); toast('透明图形关卡已生成'); };
    fr.readAsDataURL(f);
  });
  $('btnShot').addEventListener('click', () => {
    canvas.toBlob(b => { if (b) { download(b, `boulder_rescue_${stamp()}.png`); toast('截图已保存'); } }, 'image/png');
  });
  $('btnExport').addEventListener('click', () => {
    const blob = new Blob([exportJSON(S)], { type: 'application/json' });
    download(blob, `boulder-rescue-settings_${stamp()}.json`);
  });
  $('btnImport').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', async () => {
    const f = $('importFile').files && $('importFile').files[0]; if (!f) return;
    try {
      const txt = await f.text();
      const o = JSON.parse(txt);
      const next = migrate(o);
      S = next;
      applyH5DevicePresetToSettings(S);
      saveSettings(S);
      if (ui) ui.sync();
      buildBusy = buildBusy.then(rebuildAll);
      toast('设置已导入');
    } catch (e) { status('导入失败：' + e.message); toast('导入失败'); }
    $('importFile').value = '';
  });
  $('btnReset').addEventListener('click', () => {
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
    S = { ...DEFS };
    applyH5DevicePresetToSettings(S);
    if (ui) ui.sync();
    saveSettings(S);
    buildBusy = buildBusy.then(rebuildAll);
    toast('已恢复默认设置');
  });
}

// ---------- 帧循环 ----------
let lastCursor = '';
function update(now) {
  const dt = Math.min(60, now - lastNow); lastNow = now;
  if (st && phase === 'play' && st.started && !st.won && !st.lost) {
    if (!timerRunning) timerRunning = true;
    st.timeLeft = Math.max(0, st.timeLeft - dt / 1000);
    const sec = Math.ceil(st.timeLeft);
    if (st.timeLeft <= 10 && st.timeLeft > 0 && sec !== lastTick) { lastTick = sec; sfx.play('tick', S); }
    if (st.timeLeft <= 0) failGame('时间耗尽，矿工没能逃出来');
  }

  if (handState.tween) {
    const t = handState.tween;
    const u = clamp((now - t.start) / t.dur, 0, 1), e = easeInOutCubic(u);
    handState.x = lerp(t.fromX, t.toX, e);
    handState.y = lerp(t.fromY, t.toY, e) - Math.sin(Math.PI * e) * Math.min(90, Math.hypot(t.toX - t.fromX, t.toY - t.fromY) * .12);
    if (u >= 1) { handState.x = t.toX; handState.y = t.toY; handState.tween = null; try { t.resolve(true); } catch (e) {} }
  }

  // 计划中的消失
  if (pendingVanish.size) {
    for (const [id, q] of [...pendingVanish]) {
      if (now >= q.at) {
        pendingVanish.delete(id);
        const cur = screwCur.get(id);
        vanishScrew(id, q.dur, now, cur ? cur.x : 0, cur ? cur.y : 0);
      }
    }
  }
  // 粒子过期清理
  for (let i = fx.length - 1; i >= 0; i--) if (now - fx[i].t0 > fx[i].dur) fx.splice(i, 1);
  for (let i = matchFx.length - 1; i >= 0; i--) if (now - matchFx[i].t0 > matchFx[i].dur) matchFx.splice(i, 1);
  for (let i = bonusFx.length - 1; i >= 0; i--) if (now - bonusFx[i].t0 > bonusFx[i].dur) bonusFx.splice(i, 1);

  if (phase === 'win' || phase === 'fail') {
    if (!endShown && now >= seq.endAt) showEndCard();
  }
  if (rec.active && rec.stopAt && now >= rec.stopAt) stopVideo();
  if (rec.active) {
    const sec = Math.floor((now - rec.startAt) / 1000);
    const el = $('recInfo');
    if (el && el.dataset.sec !== String(sec)) { el.dataset.sec = String(sec); el.textContent = `录制中… ${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; }
  }

  // 光标：手指出现时隐藏鼠标，面板保持正常
  const show = handVisibleNow();
  handState.press += ((show && resolveHandPoint(now).down ? 1 : 0) - handState.press) * .35;
  const cur = show && S.hideCursor ? 'none' : 'pointer';
  if (cur !== lastCursor) { canvas.style.cursor = cur; lastCursor = cur; }

  // 结束页时把手指图像作为遮罩提示；不改变面板鼠标
  if (endShown && S.endCardHand && hand && S.handShow) {
    handState.visible = true;
  } else if (!autoState && !(S.manualHand && pointer.inside)) {
    handState.visible = false;
  }
}

function render(now) {
  items = buildScene(now);
  items.sort((a, b) => a.z - b.z);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, DW, DH);
  drawItems(ctx, items, 1);
}

let rafId = 0;
function loop() {
  rafId = requestAnimationFrame(loop);
  const now = performance.now();
  update(now);
  render(now);
  if (recorder.rec) recorder.sample(performance.now());
}
function stopLoop() { if (rafId) cancelAnimationFrame(rafId); rafId = 0; }
window.addEventListener('pagehide', () => { clearTimeout(saveTimer); saveSettings(S); });
document.addEventListener('visibilitychange', () => { if (document.hidden) saveSettings(S); });

// ---------- 启动 ----------
function makePanel() {
  ui = buildPanel({
    panelBody: $('panelBody'), groups: GROUPS, S,
    onChange, onButton, onFile,
  });
  ui.sync();
  refreshAutoButton(); refreshRecButton(); refreshAEButton();
}
async function boot() {
  makePanel();
  bindTopButtons();
  bindEditorDevicePreview(() => S);
  await rebuildAll();
  status('就绪 · 拆光螺丝救出矿工');
  refreshAutoButton(); refreshRecButton(); refreshAEButton();
  if (ui && handImgEl) ui.setPreview(handImgEl, S);
  // H5 试玩壳：合并烘焙设置、自动适配舞台、可选自动演示
  applyPlayableMode({
    applySettings: (p) => { S = { ...S, ...p }; if (ui) ui.sync(); buildBusy = buildBusy.then(rebuildAll); },
    autoPlay: () => { startAuto(); },
    state: () => (st ? `${st.removed.size}/${st.picked}/${st.cleared}/${phase}/${endShown ? 1 : 0}` : ''),
    isEnded: () => !!(st && (st.won || st.lost)) || endShown,
  });
  loop();
}

// 测试 / 诊断钩子
window.__game = {
  get settings() { return S; },
  get level() { return L; },
  get state() { return st; },
  get items() { return items; },
  get assets() { return A; },
  get phase() { return endShown ? 'end' : phase; },
  get autoRunning() { return !!autoState; },
  get handVisible() { return handVisibleNow(); },
  handDebug: () => ({ hand: !!hand, hw: hand && hand.w, hh: hand && hand.h, show: S.handShow, manual: S.manualHand, auto: !!autoState, inside: pointer.inside, hs: { ...handState }, phase, endShown }),
  apply: applySettingsObject,
  reset: () => resetGame(),
  startAuto: () => startAuto(),
  stopAuto: () => stopAuto(),
  pick: (i) => doPick(i),
  rebuild: () => { buildBusy = buildBusy.then(rebuildAll); return buildBusy; },
  stateSig: () => (st ? `${st.removed.size}/${st.picked}/${st.cleared}/${phase}/${endShown ? 1 : 0}` : ''),
  screenshot: () => canvas.toDataURL('image/png'),
  exportAE: () => exportAE(),
  export3D: () => export3D(),
  exportH5: () => exportH5(),
  recorder,
  get lastAERec() { return lastAERec; },
  get lastAEResult() { return window.__lastAEExport || null; },
  setAE(fps) { window.__aeSnapEvery = fps || 0; },
};

boot();
