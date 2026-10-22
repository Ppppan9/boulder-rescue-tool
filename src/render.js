// 巨石营救 · 程序化美术与精灵绘制
// 所有画面元素都绘制成独立 canvas 精灵，由 main.js 组合成 scene 列表：同一份列表既用于屏幕绘制，
// 也用于 AE 时间轴逐元素记录与 3D 导出，保证三者结构一致。
import { COLOR_HEX, COLOR_DARK, COLOR_LIGHT } from './level.js';

let endCatImg = null;
export function setEndCatImage(img) { endCatImg = img; }

export const DW = 720, DH = 1280;
export const TAU = Math.PI * 2;

export const LAYOUT = {
  board: { left: 232, top: 580, w: 488, h: 690, x0: 280, x1: 688, y0: 630, y1: 1170 },
  tray: { x: 520, y: 512, w: 344, h: 108 },
  platform: { x: 475, y: 438, w: 490, h: 100 },
  hero: { x: 530, foot: 392, hip: 332, head: 222, shoulder: 260 },
  pulley: { x: 238, y: 402 },
  weight: { x: 122, y: 758 },
  slab: { x: 400, y: 148 },
  timer: { x: 648, y: 148 },
  acid: { x: 118, top: 728 },
  caption: { x: 318, y: 56 },
};

// 参考视频有两幕：蓝石矿坑（人质壁龛 + 木梁陷阱）与酸池地牢（绳索 + 酸池）。
// 两幕共用同一套 42 颗螺丝规则，只切换舞台布局与背景；随机/图形关可任选一幕。
export const SCENES = {
  quarry: {
    key: 'quarry', label: '蓝石矿坑', noTimer: false, hasAcid: false, hasRope: false, hasNiche: true,
    layout: {
      board: { left: 18, top: 710, w: 684, h: 532, x0: 58, x1: 680, y0: 744, y1: 1212 },
      tray: { x: 520, y: 660, w: 300, h: 88 },
      platform: { x: 566, y: 585, w: 344, h: 64 },
      hero: { x: 566, foot: 590, hip: 518, head: 404, shoulder: 446 },
      pulley: { x: 220, y: 420 },
      weight: { x: 120, y: 780 },
      slab: { x: 434, y: 264 },
      timer: { x: 640, y: 350 },
      acid: { x: 120, top: 0 },
    },
  },
  acid: {
    key: 'acid', label: '酸池地牢', noTimer: true, hasAcid: true, hasRope: true, hasNiche: false,
    layout: {
      board: { left: 230, top: 656, w: 472, h: 586, x0: 272, x1: 668, y0: 692, y1: 1204 },
      tray: { x: 500, y: 598, w: 300, h: 88 },
      platform: { x: 550, y: 544, w: 372, h: 66 },
      hero: { x: 556, foot: 544, hip: 474, head: 362, shoulder: 404 },
      pulley: { x: 208, y: 444 },
      weight: { x: 120, y: 780 },
      slab: { x: 430, y: 180 },
      timer: { x: 640, y: 470 },
      acid: { x: 120, top: 720 },
    },
  },
};

export function sceneKey(S) {
  if (!S) return 'quarry';
  if (S.level === 'reference_acid') return 'acid';
  if (S.level === 'random' || S.level === 'image') return S.sceneStyle === 'acid' ? 'acid' : 'quarry';
  return 'quarry';
}
export function sceneSpec(S) { return SCENES[sceneKey(S)]; }
export function applyScene(S) {
  const sp = sceneSpec(S);
  for (const k of Object.keys(sp.layout)) Object.assign(LAYOUT[k], sp.layout[k]);
  return sp;
}

export function boardGeom(L) {
  const B = { ...LAYOUT.board };
  B.dx = L.cols > 1 ? (B.x1 - B.x0) / (L.cols - 1) : 0;
  B.dy = L.rows > 1 ? (B.y1 - B.y0) / (L.rows - 1) : 0;
  B.node = (c, r) => ({ x: B.x0 + c * B.dx, y: B.y0 + r * B.dy });
  B.nodeR = 31;
  return B;
}
export function trayGeom(S) {
  const k = Math.max(3, Math.min(5, S.traySlots | 0));
  const gap = k <= 3 ? 80 : k === 4 ? 68 : 58;
  const slots = [];
  for (let i = 0; i < k; i++) slots.push((i - (k - 1) / 2) * gap);
  return { ...LAYOUT.tray, slots, gap };
}
export function heroGeom(lift = 0) {
  const h = { ...LAYOUT.hero };
  h.foot -= lift; h.hip -= lift; h.head -= lift; h.shoulder -= lift;
  h.legL = { x: h.x - 18, y: h.hip + 2 };
  h.legR = { x: h.x + 18, y: h.hip + 2 };
  h.body = { x: h.x, y: h.hip + 2 };
  h.headPos = { x: h.x + 2, y: h.head };
  h.shoulderL = { x: h.x - 30, y: h.shoulder + 4 };
  h.shoulderR = { x: h.x + 24, y: h.shoulder + 8 };
  h.handL = { x: h.x - 84, y: h.shoulder + 44 };
  h.handR = { x: h.x - 58, y: h.shoulder + 52 };
  return h;
}

// ---------- 颜色工具 ----------
export function hexRGB(hex) {
  const h = String(hex || '#000000').replace('#', '');
  const s = h.length === 3 ? h.split('').map(c => c + c).join('') : h.padEnd(6, '0');
  const n = parseInt(s.slice(0, 6), 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}
export const rgba = (hex, a = 1) => `rgba(${hexRGB(hex).join(',')},${a})`;
export function mix(hex, to, amt) {
  const A = hexRGB(hex), B = hexRGB(to);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * amt)).join(',')})`;
}
export const light = (hex, amt = 0.25) => mix(hex, '#ffffff', amt);
export const dark = (hex, amt = 0.3) => mix(hex, '#000000', amt);

function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a ^= a << 13; a >>>= 0; a ^= a >>> 17; a ^= a << 5; a >>>= 0; return a / 4294967296; };
}

// ---------- 绘图工具 ----------
export function rr(g, x, y, w, h, r) {
  const q = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + q, y); g.lineTo(x + w - q, y); g.quadraticCurveTo(x + w, y, x + w, y + q);
  g.lineTo(x + w, y + h - q); g.quadraticCurveTo(x + w, y + h, x + w - q, y + h);
  g.lineTo(x + q, y + h); g.quadraticCurveTo(x, y + h, x, y + h - q);
  g.lineTo(x, y + q); g.quadraticCurveTo(x, y, x + q, y); g.closePath();
}
function path(g, fn) { g.beginPath(); fn(g); }
function fillStroke(g, fill, line, lw = 4) {
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (line) { g.strokeStyle = line; g.lineWidth = lw; g.stroke(); }
}
function starPath(g, x, y, r1, r2, n = 4, rot = 0) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + i * Math.PI / n, r = i % 2 ? r2 : r1;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    i ? g.lineTo(px, py) : g.moveTo(px, py);
  }
  g.closePath();
}
function drawSpaced(g, text, x, y, spacing = 2) {
  const chars = [...text];
  const widths = chars.map(c => g.measureText(c).width);
  const total = widths.reduce((s, w) => s + w, 0) + spacing * (chars.length - 1);
  let cx = x - total / 2;
  g.textAlign = 'left';
  chars.forEach((c, i) => { g.fillText(c, cx, y); g.strokeText(c, cx, y); cx += widths[i] + spacing; });
  return total;
}
function drawOutlinedText(g, text, x, y, font, fill, stroke, lw, spacing = 2) {
  g.font = font; g.textAlign = 'left'; g.textBaseline = 'middle';
  const chars = [...text];
  const widths = chars.map(c => g.measureText(c).width);
  const total = widths.reduce((s, w) => s + w, 0) + spacing * (chars.length - 1);
  let cx = x - total / 2;
  g.lineJoin = 'round'; g.lineWidth = lw; g.strokeStyle = stroke;
  for (let i = 0; i < chars.length; i++) {
    g.strokeText(chars[i], cx, y);
    g.fillStyle = fill; g.fillText(chars[i], cx, y);
    cx += widths[i] + spacing;
  }
  return total;
}
function mk(w, h, fn) {
  const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h);
  const g = c.getContext('2d'); g.lineJoin = 'round'; g.lineCap = 'round'; fn(g, c.width, c.height); return c;
}
function add(A, id, c, ax, ay) {
  A[id] = { id, c, w: c.width, h: c.height, ax: ax == null ? c.width / 2 : ax, ay: ay == null ? c.height / 2 : ay };
  return A[id];
}

// ---------- 砖墙 / 石头 ----------
function drawBrickWall(g, x, y, w, h, base, dk, seed = 1, opt = {}) {
  const R = rng(seed), bh = opt.bh || 34, bw = opt.bw || 86, gap = opt.gap || 4;
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = dk; g.fillRect(x, y, w, h);
  const rows = Math.ceil(h / bh) + 1;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * bw * 0.5;
    for (let c = -1; c < Math.ceil(w / bw) + 1; c++) {
      const bx = x + c * bw + off, by = y + r * bh;
      const v = (R() - 0.5) * 0.16;
      const col = mix(base, v > 0 ? '#ffffff' : '#000000', Math.abs(v) + (R() < 0.12 ? 0.08 : 0));
      rr(g, bx + gap / 2, by + gap / 2, bw - gap, bh - gap, 3);
      g.fillStyle = col; g.fill();
      g.strokeStyle = rgba(dark(base, 0.45), 0.5); g.lineWidth = 1.5; g.stroke();
      // 上缘高光
      g.strokeStyle = rgba(light(base, 0.25), 0.18); g.lineWidth = 2;
      g.beginPath(); g.moveTo(bx + 5, by + gap / 2 + 2); g.lineTo(bx + bw - 7, by + gap / 2 + 2); g.stroke();
      // 裂缝 / 污渍
      if (R() < 0.14) {
        g.strokeStyle = rgba(dark(base, 0.55), 0.65); g.lineWidth = 1.4; g.beginPath();
        let px = bx + 10 + R() * (bw - 30), py = by + 6 + R() * (bh - 14);
        g.moveTo(px, py);
        for (let k = 0; k < 3; k++) { px += (R() - 0.5) * 18; py += 4 + R() * 6; g.lineTo(px, py); }
        g.stroke();
      }
      if (R() < 0.1) { g.fillStyle = rgba(dark(base, 0.3), 0.35); g.beginPath(); g.ellipse(bx + bw * (0.3 + R() * 0.4), by + bh * (0.4 + R() * 0.4), 10 + R() * 16, 5 + R() * 8, R(), 0, TAU); g.fill(); }
    }
  }
  g.restore();
}

function drawRock(g, x, y, r, col, seed = 1) {
  const R = rng(seed), n = 8 + (R() * 3 | 0), pts = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU, rad = r * (0.82 + R() * 0.26);
    pts.push([x + Math.cos(a) * rad, y + Math.sin(a) * rad * 0.86]);
  }
  path(g, q => { q.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < n; i++) q.quadraticCurveTo((pts[i - 1][0] + pts[i][0]) / 2, (pts[i - 1][1] + pts[i][1]) / 2, pts[i][0], pts[i][1]); q.closePath(); });
  const grd = g.createLinearGradient(x - r, y - r, x + r, y + r);
  grd.addColorStop(0, light(col, 0.25)); grd.addColorStop(0.55, col); grd.addColorStop(1, dark(col, 0.35));
  fillStroke(g, grd, dark(col, 0.6), Math.max(2, r * 0.07));
  g.save(); g.beginPath(); g.ellipse(x - r * 0.26, y - r * 0.3, r * 0.34, r * 0.22, -0.5, 0, TAU); g.fillStyle = rgba(light(col, 0.65), 0.34); g.fill(); g.restore();
  if (r > 15 && R() < 0.5) {
    g.strokeStyle = rgba(dark(col, 0.55), 0.5); g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(x - r * 0.2, y + r * 0.1); g.lineTo(x + r * 0.1, y + r * 0.3); g.lineTo(x + r * 0.3, y + r * 0.2); g.stroke();
  }
}

function drawBoulderPile(g, S, seed = 7) {
  const R = rng(seed);
  g.save(); g.beginPath(); g.rect(0, 360, 330, 560); g.clip();
  // 暗部
  const grd = g.createLinearGradient(0, 340, 300, 940);
  grd.addColorStop(0, rgba(dark(S.rockColor, 0.55), 0.85)); grd.addColorStop(1, rgba(dark(S.rockColor, 0.7), 0.98));
  g.fillStyle = grd; g.fillRect(0, 340, 340, 620);
  g.fillStyle = rgba(dark(S.rockColor, .5), .9); g.fillRect(0, 360, 300, 560);
  for (let i = 0; i < 220; i++) {
    const t = R();
    const x = -16 + R() * 315;
    const edge = Math.min(1, (300 - x) / 120);
    if (R() > edge * 0.98 + 0.02) continue;
    const y = 378 + R() * 540 + (x < 80 ? 30 : 0);
    const r = 14 + R() * 24;
    const c = R() < 0.32 ? S.rockLight : R() < 0.2 ? dark(S.rockColor, 0.28) : S.rockColor;
    drawRock(g, x, y, r, c, 1000 + i * 17);
  }
  // 边缘散落的碎石
  for (let i = 0; i < 18; i++) {
    const x = 210 + R() * 120, y = 620 + R() * 130, r = 6 + R() * 13;
    drawRock(g, x, y, r, S.rockColor, 7000 + i * 9);
  }
  g.restore();
  // 巨石堆的冷色光
  const glow = g.createRadialGradient(80, 620, 10, 80, 620, 260);
  glow.addColorStop(0, 'rgba(96,210,205,.16)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = glow; g.fillRect(0, 340, 340, 620);
}

function drawWood(g, x, y, w, h, col, dk, seed = 1, vertical = false) {
  const R = rng(seed);
  const grd = vertical ? g.createLinearGradient(x, 0, x + w, 0) : g.createLinearGradient(0, y, 0, y + h);
  grd.addColorStop(0, light(col, 0.28)); grd.addColorStop(0.25, col); grd.addColorStop(0.85, dark(col, 0.12)); grd.addColorStop(1, dk);
  rr(g, x, y, w, h, Math.min(8, w / 2, h / 2));
  fillStroke(g, grd, dark(dk, 0.35), 2.5);
  g.save(); g.beginPath(); rr(g, x + 3, y + 3, w - 6, h - 6, 5); g.clip();
  g.strokeStyle = rgba(dark(dk, 0.5), 0.35); g.lineWidth = 1.2;
  const lines = 3 + (R() * 3 | 0);
  for (let i = 0; i < lines; i++) {
    g.beginPath();
    if (vertical) { const lx = x + 5 + R() * (w - 10); g.moveTo(lx, y); g.bezierCurveTo(lx + (R() - .5) * 8, y + h * .3, lx + (R() - .5) * 8, y + h * .7, lx + (R() - .5) * 5, y + h); }
    else { const ly = y + 5 + R() * (h - 10); g.moveTo(x, ly); g.bezierCurveTo(x + w * .3, ly + (R() - .5) * 7, x + w * .7, ly + (R() - .5) * 7, x + w, ly + (R() - .5) * 4); }
    g.stroke();
  }
  if (R() < 0.75) { const kx = x + w * (0.2 + R() * 0.6), ky = y + h * (0.25 + R() * 0.5); g.beginPath(); g.ellipse(kx, ky, vertical ? 4 : 6, vertical ? 8 : 4, 0, 0, TAU); g.fillStyle = rgba(dark(dk, 0.45), 0.5); g.fill(); }
  g.fillStyle = rgba(light(col, 0.5), 0.18); g.fillRect(x + 4, y + 4, vertical ? w * .18 : w - 8, vertical ? h - 8 : h * .18);
  g.restore();
}

// ---------- 背景 ----------
// 参考视频第一幕：蓝石矿坑。上半屏是被蓝灰色卵石填满的矿坑，右侧挖出一个人质壁龛，
// 木梁从上方斜压下来；下方是 7×6 螺丝木板。第二幕：酸池地牢，砖墙 + 左侧绿酸池 + 石台。
function drawStoneFrame(g, S, R) {
  const base = S.brickColor, dk = S.brickDark;
  // 外圈深色石框
  const frame = g.createLinearGradient(0, 0, 0, DH);
  frame.addColorStop(0, '#423033'); frame.addColorStop(.5, '#251a1e'); frame.addColorStop(1, '#160f13');
  g.fillStyle = frame; g.fillRect(0, 0, DW, DH);
  for (const [x, w] of [[0, 26], [DW - 26, 26]]) {
    const pg = g.createLinearGradient(x, 0, x + w, 0);
    pg.addColorStop(0, '#594144'); pg.addColorStop(.45, '#332326'); pg.addColorStop(1, '#1a1013');
    g.fillStyle = pg; g.fillRect(x, 0, w, DH);
    for (let y = 18; y < DH; y += 54) {
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + 1, y); g.lineTo(x + w - 1, y); g.stroke();
      g.strokeStyle = 'rgba(190,170,170,.12)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x + 3, y + 2); g.lineTo(x + w - 3, y + 2); g.stroke();
    }
  }
  // 顶部压顶 + 蓝灰金属线
  const top = g.createLinearGradient(0, 0, 0, 34);
  top.addColorStop(0, '#6d5658'); top.addColorStop(1, '#2a1d21');
  g.fillStyle = top; g.fillRect(0, 0, DW, 30);
  g.fillStyle = 'rgba(155,184,206,.5)'; g.fillRect(20, 30, DW - 40, 4);
  g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(20, 34, DW - 40, 7);
}

function drawBlueRockField(g, S, R, x0, y0, w, h, count, radius = 22, skip = null) {
  const rockBase = S.rockColor || '#516f9e';
  g.save(); g.beginPath(); g.rect(x0, y0, w, h); g.clip();
  const bg = g.createLinearGradient(x0, y0, x0 + w, y0 + h);
  bg.addColorStop(0, dark(rockBase, .38)); bg.addColorStop(.45, dark(rockBase, .06)); bg.addColorStop(1, dark(rockBase, .46));
  g.fillStyle = bg; g.fillRect(x0, y0, w, h);
  for (let i = 0; i < count; i++) {
    const x = x0 - 20 + R() * (w + 40), y = y0 - 20 + R() * (h + 40);
    if (skip && skip(x, y)) continue;
    const rr2 = radius * (.55 + R() * .85);
    const col = R() < .28 ? S.rockLight : R() < .18 ? dark(rockBase, .34) : rockBase;
    drawRock(g, x, y, rr2, col, 1000 + i * 19);
  }
  g.restore();
}

function buildQuarryBackground(S, seed = 11) {
  return mk(DW, DH, (g) => {
    const R = rng(seed);
    drawStoneFrame(g, S, R);
    // 上半屏蓝石堆
    drawBlueRockField(g, S, R, 20, 40, DW - 40, 660, 900, 24, (x, y) => {
      if (x > 412 && x < 714 && y > 246 && y < 610) return true;   // 人质壁龛
      if (x > 330 && y > 586 && x < 714 && y < 704) return true;   // 托盘石座
      return false;
    });
    // 左侧更深处的碎石
    drawBlueRockField(g, S, R, 20, 660, 350, 80, 130, 16);
    // 人质壁龛：深色砖洞 + 粗石拱框
    const nx = 432, ny = 300, nw = 272, nh = 300, ar = 82;
    g.save();
    g.beginPath(); g.moveTo(nx, ny + nh); g.lineTo(nx, ny + ar);
    g.quadraticCurveTo(nx, ny, nx + ar, ny); g.lineTo(nx + nw - ar, ny);
    g.quadraticCurveTo(nx + nw, ny, nx + nw, ny + ar); g.lineTo(nx + nw, ny + nh); g.closePath();
    const cave = g.createLinearGradient(0, ny, 0, ny + nh);
    cave.addColorStop(0, '#533234'); cave.addColorStop(.5, '#392124'); cave.addColorStop(1, '#241417');
    g.fillStyle = cave; g.fill();
    g.clip(); drawBrickWall(g, nx, ny, nw, nh, S.brickColor, '#1a1012', 77, { bh: 26, bw: 66, gap: 4 });
    g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(nx, ny, nw, nh);
    g.restore();
    g.beginPath(); g.moveTo(nx, ny + nh); g.lineTo(nx, ny + ar);
    g.quadraticCurveTo(nx, ny, nx + ar, ny); g.lineTo(nx + nw - ar, ny);
    g.quadraticCurveTo(nx + nw, ny, nx + nw, ny + ar); g.lineTo(nx + nw, ny + nh);
    g.strokeStyle = '#574045'; g.lineWidth = 24; g.stroke();
    g.strokeStyle = 'rgba(150,135,140,.3)'; g.lineWidth = 4; g.stroke();
    // 拱框石块
    for (let i = 0; i < 12; i++) {
      const a = Math.PI * (1 + i / 12), x = nx + nw / 2 + Math.cos(a) * (nw / 2 + 3), y = ny + ar + Math.sin(a) * ar;
      g.save(); g.translate(x, y); g.rotate(a + Math.PI / 2); g.fillStyle = i % 2 ? '#5c4549' : '#4b373b';
      rr(g, -22, -10, 44, 20, 4); g.fill(); g.strokeStyle = 'rgba(20,12,14,.55)'; g.lineWidth = 2; g.stroke(); g.restore();
    }
    // 壁龛石台
    g.fillStyle = 'rgba(0,0,0,.35)'; rr(g, 410, 595, 322, 32, 9); g.fill();
    const sill = g.createLinearGradient(0, 595, 0, 628);
    sill.addColorStop(0, '#7b6264'); sill.addColorStop(1, '#3b2a2d');
    rr(g, 408, 592, 326, 30, 9); fillStroke(g, sill, '#241719', 3);
    // 托盘石座
    g.fillStyle = '#302124'; rr(g, 355, 588, 348, 114, 18); g.fill();
    g.strokeStyle = '#594246'; g.lineWidth = 5; g.stroke();
    g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 3; rr(g, 362, 596, 334, 98, 14); g.stroke();
    // 木梁陷阱（从左上斜压向壁龛）
    g.save(); g.translate(470, 236); g.rotate(-.17);
    drawWood(g, -228, -28, 462, 56, S.woodColor, S.woodDark, 311);
    for (const x of [-214, 200]) {
      g.fillStyle = '#76615a'; rr(g, x - 14, -24, 28, 48, 4); g.fill(); g.strokeStyle = '#241619'; g.lineWidth = 2; g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(-228, 18, 462, 10);
    g.restore();
    // 边缘暗角与噪点
    const vg = g.createRadialGradient(DW / 2, 440, 160, DW / 2, 600, 760);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${.55 * S.vignette})`);
    g.fillStyle = vg; g.fillRect(0, 0, DW, DH);
    for (let i = 0; i < 2200 * S.bgGrain; i++) {
      g.fillStyle = R() < .5 ? `rgba(255,255,255,${R() * .05})` : `rgba(0,0,0,${R() * .06})`;
      g.fillRect(R() * DW, R() * DH, 1.4, 1.4);
    }
  });
}

function buildAcidBackground(S, seed = 24) {
  return mk(DW, DH, (g) => {
    const R = rng(seed);
    drawStoneFrame(g, S, R);
    const base = S.brickColor, dk = S.brickDark;
    const bg = g.createLinearGradient(0, 0, 0, DH);
    bg.addColorStop(0, '#7d4c49'); bg.addColorStop(.32, '#5c3739'); bg.addColorStop(1, '#2c1b1e');
    g.fillStyle = bg; g.fillRect(20, 34, DW - 40, DH - 34);
    drawBrickWall(g, 20, 34, DW - 40, DH - 34, base, dk, 43, { bh: 33, bw: 84, gap: 5 });
    g.fillStyle = 'rgba(10,6,8,.08)'; g.fillRect(20, 34, DW - 40, DH - 34);
    // 左侧酸池石框
    g.fillStyle = '#2b1a1d'; rr(g, 18, 930, 236, 370, 18); g.fill();
    g.strokeStyle = '#5c4348'; g.lineWidth = 6; g.stroke();
    const acidGlow = g.createLinearGradient(0, 900, 0, 1280);
    acidGlow.addColorStop(0, 'rgba(125,240,55,.18)'); acidGlow.addColorStop(1, 'rgba(80,180,20,.05)');
    g.fillStyle = acidGlow; g.fillRect(30, 950, 212, 310);
    // 左中部蓝色碎石矿堆
    drawBlueRockField(g, S, R, 20, 610, 240, 380, 230, 17, (x, y) => y > 900 && x < 260);
    // 上方石台阴影
    g.fillStyle = 'rgba(0,0,0,.24)'; g.fillRect(20, 34, DW - 40, 120);
    // 石台立面（平台 asset 之上仍保留砖纹）
    g.save(); g.beginPath(); g.rect(170, 500, 530, 160); g.clip(); drawBrickWall(g, 170, 500, 530, 160, dark(base, .12), dk, 71, { bh: 25, bw: 72, gap: 4 }); g.fillStyle = 'rgba(0,0,0,.32)'; g.fillRect(170, 500, 530, 160); g.restore();
    // 绳索滑轮支架
    g.save(); g.translate(208, 410);
    g.strokeStyle = '#3c2c1e'; g.lineWidth = 9; g.beginPath(); g.moveTo(0, 0); g.lineTo(-14, 110); g.stroke();
    g.fillStyle = '#70645d'; rr(g, -26, -8, 52, 16, 4); g.fill(); g.strokeStyle = '#241719'; g.lineWidth = 2; g.stroke();
    g.restore();
    // 几块从上方崩落的蓝石
    for (const [x, y, r] of [[220, 240, 15], [258, 300, 9], [148, 330, 11], [620, 158, 12]]) drawRock(g, x, y, r, S.rockColor, x * 3 + y);
    // 顶部和底部压暗
    const top = g.createLinearGradient(0, 0, 0, 260);
    top.addColorStop(0, 'rgba(10,6,8,.32)'); top.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = top; g.fillRect(0, 30, DW, 230);
    const vg = g.createRadialGradient(DW / 2, 520, 140, DW / 2, 700, 760);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${.26 * S.vignette})`);
    g.fillStyle = vg; g.fillRect(0, 0, DW, DH);
    for (let i = 0; i < 1800 * S.bgGrain; i++) {
      g.fillStyle = R() < .5 ? `rgba(255,255,255,${R() * .04})` : `rgba(0,0,0,${R() * .06})`;
      g.fillRect(R() * DW, R() * DH, 1.4, 1.4);
    }
  });
}

function buildBackground(S, seed = 11) {
  return sceneSpec(S).key === 'acid' ? buildAcidBackground(S, seed) : buildQuarryBackground(S, seed);
}

// ---------- 棋盘底板 ----------
// 参考视频的棋盘不是“黑窟窿”，而是木板格架直接钉在砖墙/蓝石堆上；螺丝拔出后只留小孔。
function buildBoard(S, L, seed = 51) {
  const B = boardGeom(L);
  const sp = sceneSpec(S);
  return mk(B.w, B.h, (g, W, H) => {
    const R = rng(seed);
    const ox = B.left, oy = B.top;
    g.fillStyle = '#1a1114'; g.fillRect(0, 0, W, H);
    // 砖墙底
    drawBrickWall(g, 0, 0, W, H, mix(S.brickColor, '#4b2a2a', .2), S.brickDark, 53, { bh: 29, bw: 66, gap: 4 });
    const shade = g.createLinearGradient(0, 0, 0, H);
    shade.addColorStop(0, 'rgba(0,0,0,.14)'); shade.addColorStop(.35, 'rgba(0,0,0,.03)'); shade.addColorStop(1, 'rgba(0,0,0,.26)');
    g.fillStyle = shade; g.fillRect(0, 0, W, H);
    if (sp.key === 'acid') {
      // 第二幕：棋盘上半部是蓝石堆，底部露出砖墙
      drawBlueRockField(g, S, R, 0, 0, W, H * .62, 290, 15);
      const fade = g.createLinearGradient(0, H * .34, 0, H * .72);
      fade.addColorStop(0, 'rgba(15,10,13,0)'); fade.addColorStop(1, 'rgba(15,10,13,.48)');
      g.fillStyle = fade; g.fillRect(0, H * .34, W, H * .4);
    } else {
      // 第一幕：左侧蓝石堆从矿坑里漫到棋盘上
      g.save(); g.beginPath(); g.moveTo(0, 0); g.lineTo(W * .46, 0); g.quadraticCurveTo(W * .22, H * .46, W * .32, H); g.lineTo(0, H); g.closePath(); g.clip();
      drawBlueRockField(g, S, R, -10, 0, W * .62, H, 380, 15);
      // 蓝石边缘压暗
      const edge = g.createLinearGradient(W * .08, 0, W * .46, 0);
      edge.addColorStop(0, 'rgba(15,10,13,.55)'); edge.addColorStop(.7, 'rgba(15,10,13,.05)'); edge.addColorStop(1, 'rgba(15,10,13,.6)');
      g.fillStyle = edge; g.fillRect(0, 0, W * .62, H); g.restore();
    }
    // 螺丝小孔：螺钉盖住时看不见，拔出后露出小孔
    for (const n of L.nodes) {
      const p = B.node(n.c, n.r), x = p.x - ox, y = p.y - oy;
      g.beginPath(); g.arc(x, y + 1.5, 18, 0, TAU); g.fillStyle = 'rgba(0,0,0,.45)'; g.fill();
      const hole = g.createRadialGradient(x - 4, y - 5, 2, x, y, 18);
      hole.addColorStop(0, '#0c0809'); hole.addColorStop(.62, '#1a0f12'); hole.addColorStop(1, '#3b2626');
      g.beginPath(); g.arc(x, y, 16.5, 0, TAU); g.fillStyle = hole; g.fill();
      g.strokeStyle = 'rgba(12,7,8,.9)'; g.lineWidth = 2; g.stroke();
      g.strokeStyle = 'rgba(214,172,116,.2)'; g.lineWidth = 1.4; g.beginPath(); g.arc(x - 1, y - 1, 14, Math.PI * 1.05, Math.PI * 1.7); g.stroke();
    }
    // 四周压边
    const rim = g.createLinearGradient(0, 0, 0, 20);
    rim.addColorStop(0, 'rgba(0,0,0,.55)'); rim.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rim; g.fillRect(0, 0, W, 24);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, H - 18, W, 18);
    // 细碎噪点
    for (let i = 0; i < 500; i++) {
      g.fillStyle = R() < .5 ? 'rgba(255,255,255,.03)' : 'rgba(0,0,0,.05)';
      g.fillRect(R() * W, R() * H, 1.2, 1.2);
    }
  });
}

// ---------- 木板 ----------
function buildPlank(S, B, dir, variant = 0) {
  const pw = Math.round(S.plankW);
  if (dir === 'h') {
    const L2 = Math.round(B.dx + 28);
    return mk(L2 + 14, pw + 18, (g, W, H) => {
      g.fillStyle = 'rgba(0,0,0,.32)'; rr(g, 7, 11, W - 14, H - 14, 7); g.fill();
      drawWood(g, 7, 7, W - 14, pw, S.woodColor, S.woodDark, 600 + variant * 7, false);
      // 两端深色端面，参考视频的木梁没有金属铆钉
      g.fillStyle = 'rgba(43,24,13,.45)'; rr(g, 8, 8, 6, pw, 3); g.fill(); rr(g, W - 14, 8, 6, pw, 3); g.fill();
    });
  }
  const L2 = Math.round(B.dy + 28);
  return mk(pw + 18, L2 + 14, (g, W, H) => {
    g.fillStyle = 'rgba(0,0,0,.32)'; rr(g, 9, 7, W - 14, H - 14, 7); g.fill();
    drawWood(g, 7, 7, pw, H - 14, S.woodColor, S.woodDark, 620 + variant * 7, true);
    g.fillStyle = 'rgba(43,24,13,.45)'; rr(g, 8, 8, pw, 6, 3); g.fill(); rr(g, 8, H - 14, pw, 6, 3); g.fill();
  });
}

// ---------- 螺丝 ----------
// 参考视频的螺丝是明快的彩色十字凸台，直接压在本板上；没有大黑洞与金属内六角。
function buildScrew(color) {
  const base = COLOR_HEX[color] || '#ff4d4d', dk = COLOR_DARK[color] || '#7a1d1d', lt = COLOR_LIGHT[color] || '#ffb0b0';
  return mk(70, 70, (g, W, H) => {
    const cx = W / 2, cy = H / 2;
    // 极轻的投影，避免黑色大坑
    g.fillStyle = 'rgba(0,0,0,.32)'; g.beginPath(); g.ellipse(cx + 2, cy + 4, 22, 18, 0, 0, TAU); g.fill();
    g.save(); g.translate(cx, cy); g.rotate(-.12);
    const arm = 23, wid = 14;
    const plus = (ox, oy, w, r) => {
      rr(g, -w / 2 + ox, -arm + oy, w, arm * 2, r); g.fill();
      rr(g, -arm + ox, -w / 2 + oy, arm * 2, w, r); g.fill();
    };
    // 深色轮廓
    g.fillStyle = dark(dk, .45); plus(1.4, 2.0, wid + 5, 7);
    // 彩色主体
    const face = g.createLinearGradient(-arm, -arm, arm, arm);
    face.addColorStop(0, light(base, .18)); face.addColorStop(.35, base);
    face.addColorStop(.82, dark(base, .06)); face.addColorStop(1, dark(base, .3));
    g.fillStyle = face; plus(0, 0, wid + 1, 7);
    // 左上高光
    g.save(); g.beginPath(); g.rect(-arm, -arm, arm * 2, arm * 2); g.clip();
    g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(-arm + 7, -wid / 2 + 2); g.lineTo(-wid / 2 + 2, -wid / 2 + 2); g.lineTo(-wid / 2 + 2, -arm + 7); g.stroke();
    g.beginPath(); g.moveTo(-arm + 7, -wid / 2 + 2); g.lineTo(-arm + 7, arm - 5); g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 2; g.stroke();
    g.restore();
    // 中心浅凹点
    g.beginPath(); g.arc(0, 0, 3.5, 0, TAU); g.fillStyle = rgba(light(base, .55), .65); g.fill();
    g.strokeStyle = rgba(dark(dk, .4), .45); g.lineWidth = 1.2; g.stroke();
    g.restore();
    const glow = g.createRadialGradient(cx, cy, 18, cx, cy, 35);
    glow.addColorStop(0, rgba(base, .09)); glow.addColorStop(1, rgba(base, 0));
    g.fillStyle = glow; g.beginPath(); g.arc(cx, cy, 35, 0, TAU); g.fill();
  });
}

// ---------- 托盘底座与托盘 ----------
function buildTrayMount(S) {
  const T = trayGeom(S);
  return mk(T.w + 62, T.h + 52, (g, W, H) => {
    g.fillStyle = 'rgba(0,0,0,.45)'; rr(g, 8, 14, W - 12, H - 18, 22); g.fill();
    // 粗石框
    const frame = g.createLinearGradient(0, 0, 0, H);
    frame.addColorStop(0, '#7b5c5e'); frame.addColorStop(.5, '#4a3336'); frame.addColorStop(1, '#2a1b1e');
    rr(g, 2, 2, W - 4, H - 10, 20); fillStroke(g, frame, '#211416', 4);
    g.save(); rr(g, 7, 7, W - 14, H - 20, 16); g.clip();
    drawBrickWall(g, 0, 0, W, H, '#5b3b3f', '#2b1b1e', 121, { bh: 24, bw: 62, gap: 4 });
    g.fillStyle = 'rgba(10,6,8,.35)'; g.fillRect(0, 0, W, H); g.restore();
    // 内嵌深槽
    rr(g, 20, 18, W - 40, H - 42, 14); g.fillStyle = '#1b1114'; g.fill();
    g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 4; g.stroke();
    g.strokeStyle = 'rgba(190,170,170,.18)'; g.lineWidth = 2; rr(g, 24, 22, W - 48, H - 50, 11); g.stroke();
    // 铆钉
    for (const [x, y] of [[16, 16], [W - 16, 16], [16, H - 18], [W - 16, H - 18]]) {
      g.beginPath(); g.arc(x, y, 5, 0, TAU); g.fillStyle = '#6b5d5a'; g.fill();
      g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 1.5; g.stroke();
      g.beginPath(); g.arc(x - 1, y - 1, 1.8, 0, TAU); g.fillStyle = 'rgba(255,255,255,.4)'; g.fill();
    }
  });
}

function buildTray(S, tint = null) {
  const T = trayGeom(S);
  const col = tint || S.trayColor;
  return mk(T.w, T.h, (g, W, H) => {
    const dk = dark(col, .5);
    g.fillStyle = 'rgba(0,0,0,.44)'; rr(g, 5, 10, W - 8, H - 6, 20); g.fill();
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, light(col, .62)); grd.addColorStop(.24, light(col, .28)); grd.addColorStop(.68, col); grd.addColorStop(1, dark(col, .2));
    rr(g, 3, 3, W - 6, H - 12, 18); fillStroke(g, grd, dark(dk, .35), 4);
    // 发光内框（参考视频托盘会随当前颜色泛光）
    g.save(); g.shadowColor = rgba(light(col, .35), .95); g.shadowBlur = 16;
    rr(g, 13, 13, W - 26, H - 30, 13); g.strokeStyle = rgba(light(col, .55), .95); g.lineWidth = 4; g.stroke(); g.restore();
    rr(g, 18, 17, W - 36, H - 36, 11); g.fillStyle = rgba(dark(col, .28), .92); g.fill();
    // 三个圆槽
    for (const sx of T.slots) {
      const cx = W / 2 + sx, cy = H / 2 - 2;
      const hole = g.createRadialGradient(cx - 5, cy - 5, 2, cx, cy, 27);
      hole.addColorStop(0, '#3a1e2a'); hole.addColorStop(.7, '#1c0e15'); hole.addColorStop(1, '#2c151f');
      g.beginPath(); g.arc(cx, cy, 25, 0, TAU); g.fillStyle = hole; g.fill();
      g.strokeStyle = rgba(light(col, .4), .8); g.lineWidth = 3; g.stroke();
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1.2; g.beginPath(); g.arc(cx, cy, 21, 0, TAU); g.stroke();
    }
    // 顶部高光
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2; g.beginPath(); g.moveTo(22, 9); g.lineTo(W - 22, 9); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.3)'; rr(g, 22, 8, W - 44, 5, 2.5); g.fill();
  });
}

// ---------- 平台 / 巨石 / 绞盘 / 配重 ----------
function buildPlatform(S) {
  const W = LAYOUT.platform.w, H = LAYOUT.platform.h;
  return mk(W, H, (g) => {
    g.fillStyle = 'rgba(0,0,0,.4)'; rr(g, 7, 15, W - 8, H - 12, 16); g.fill();
    // 顶面
    const top = g.createLinearGradient(0, 0, 0, 26);
    top.addColorStop(0, light(S.brickColor, .28)); top.addColorStop(1, dark(S.brickColor, .05));
    rr(g, 2, 2, W - 4, 31, 9); fillStroke(g, top, dark(S.brickDark, .55), 3.5);
    g.strokeStyle = rgba(light(S.brickColor, .3), .4); g.lineWidth = 2; g.beginPath(); g.moveTo(14, 7); g.lineTo(W - 14, 7); g.stroke();
    // 前立面砖
    g.save(); rr(g, 4, 25, W - 8, H - 32, 14); g.clip();
    drawBrickWall(g, 4, 25, W - 8, H - 26, S.brickColor, S.brickDark, 91, { bh: 24, bw: 62, gap: 4 });
    const shade = g.createLinearGradient(0, 25, 0, H);
    shade.addColorStop(0, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,0,0,.5)');
    g.fillStyle = shade; g.fillRect(4, 25, W - 8, H - 26);
    g.restore();
    rr(g, 4, 25, W - 8, H - 32, 14); g.strokeStyle = rgba(dark(S.brickDark, .5), .8); g.lineWidth = 3; g.stroke();
    // 金属包边
    const metal = g.createLinearGradient(0, 0, 0, 12);
    metal.addColorStop(0, light(S.metalColor, .5)); metal.addColorStop(1, dark(S.metalColor, .45));
    rr(g, 0, 28, W, 10, 4); fillStroke(g, metal, 'rgba(0,0,0,.45)', 2);
    for (let x = 20; x < W; x += 62) { g.beginPath(); g.arc(x, 33, 3, 0, TAU); g.fillStyle = 'rgba(20,20,25,.65)'; g.fill(); g.beginPath(); g.arc(x - 1, 32, 1.2, 0, TAU); g.fillStyle = rgba('#fff', .4); g.fill(); }
    // 铆钉与青苔
    for (const [x, y] of [[24, 52], [W - 24, 52], [24, H - 18], [W - 24, H - 18]]) {
      g.beginPath(); g.arc(x, y, 6, 0, TAU); g.fillStyle = dark(S.metalColor, .5); g.fill(); g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 1.5; g.stroke();
    }
    for (let i = 0; i < 7; i++) { g.fillStyle = `rgba(80,120,70,${.12 + i * .02})`; g.beginPath(); g.ellipse(20 + i * 61, 22 + (i % 2) * 24, 18, 5, 0, 0, TAU); g.fill(); }
  });
}

function buildSlab(S) {
  const W = 570, H = 180;
  return mk(W, H, (g) => {
    const R = rng(911);
    // 吊链
    g.strokeStyle = rgba(dark(S.metalColor, .35), .7); g.lineWidth = 5;
    for (const x of [120, 440]) for (let y = 4; y < 44; y += 17) { g.beginPath(); g.ellipse(x, y, 6, 9, 0, 0, TAU); g.stroke(); }
    g.fillStyle = 'rgba(0,0,0,.45)'; rr(g, 20, 58, W - 40, H - 30, 26); g.fill();
    // 石块轮廓
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12, x = 8 + t * (W - 16), y = 38 + Math.sin(t * Math.PI) * -10 + (R() - .5) * 20;
      pts.push([x, y]);
    }
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.lineTo(W - 12, H - 18); g.lineTo(30, H - 10); g.closePath();
    const grd = g.createLinearGradient(0, 30, 0, H);
    grd.addColorStop(0, light(S.brickColor, .3)); grd.addColorStop(.35, S.brickColor); grd.addColorStop(1, dark(S.brickDark, .25));
    fillStroke(g, grd, dark(S.brickDark, .6), 5);
    // 石块裂纹
    g.save(); g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.lineTo(W - 12, H - 18); g.lineTo(30, H - 10); g.closePath(); g.clip();
    for (let i = 0; i < 10; i++) {
      g.strokeStyle = rgba(dark(S.brickDark, .6), .55); g.lineWidth = 1.5 + R() * 2; g.beginPath();
      let x = 30 + R() * (W - 60), y = 20 + R() * (H - 40); g.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += (R() - .5) * 40; y += 8 + R() * 16; g.lineTo(x, y); }
      g.stroke();
    }
    // 铁箍
    for (const x of [104, 458]) {
      rr(g, x - 9, 30, 18, H - 42, 4); const m = g.createLinearGradient(x, 0, x + 18, 0); m.addColorStop(0, light(S.metalColor, .35)); m.addColorStop(1, dark(S.metalColor, .5)); g.fillStyle = m; g.fill(); g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 2; g.stroke();
      for (const y of [54, H - 40]) { g.beginPath(); g.arc(x, y, 4, 0, TAU); g.fillStyle = dark(S.metalColor, .6); g.fill(); }
    }
    // 青苔
    for (let i = 0; i < 12; i++) { g.fillStyle = `rgba(70,110,65,${.08 + R() * .1})`; g.beginPath(); g.ellipse(40 + R() * (W - 80), 60 + R() * (H - 80), 12 + R() * 24, 4 + R() * 7, R(), 0, TAU); g.fill(); }
    g.restore();
  });
}

function buildPulley(S) {
  return mk(94, 94, (g, W, H) => {
    const cx = W / 2, cy = H / 2;
    g.fillStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.arc(cx + 3, cy + 5, 38, 0, TAU); g.fill();
    // 支架
    g.save(); g.translate(cx, cy); g.rotate(-.5);
    rr(g, -7, -44, 14, 88, 5); g.fillStyle = dark(S.metalColor, .45); g.fill(); g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 2; g.stroke();
    g.restore();
    const rim = g.createRadialGradient(cx - 10, cy - 12, 3, cx, cy, 34);
    rim.addColorStop(0, light(S.woodColor, .35)); rim.addColorStop(.6, S.woodColor); rim.addColorStop(1, dark(S.woodDark, .35));
    g.beginPath(); g.arc(cx, cy, 32, 0, TAU); g.fillStyle = rim; g.fill(); g.strokeStyle = dark(S.woodDark, .55); g.lineWidth = 4; g.stroke();
    g.beginPath(); g.arc(cx, cy, 23, 0, TAU); g.fillStyle = dark(S.woodDark, .3); g.fill();
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; g.strokeStyle = rgba(S.woodDark, .65); g.lineWidth = 3; g.beginPath(); g.moveTo(cx + Math.cos(a) * 12, cy + Math.sin(a) * 12); g.lineTo(cx + Math.cos(a) * 30, cy + Math.sin(a) * 30); g.stroke(); }
    g.beginPath(); g.arc(cx, cy, 8, 0, TAU); g.fillStyle = dark(S.metalColor, .55); g.fill(); g.strokeStyle = rgba(light(S.metalColor, .4), .5); g.lineWidth = 2; g.stroke();
    // 螺帽
    g.beginPath(); g.arc(cx, cy, 4, 0, TAU); g.fillStyle = rgba(light(S.metalColor, .6), .8); g.fill();
  });
}

function buildWeight(S) {
  return mk(160, 166, (g, W, H) => {
    // 绳网
    g.strokeStyle = rgba('#d8b46a', .85); g.lineWidth = 4;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(20 + i * 30, 42); g.quadraticCurveTo(10 + i * 35, 105, 44 + i * 18, 150); g.stroke(); }
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(10 + i * 4, 70 + i * 22); g.quadraticCurveTo(80, 84 + i * 22, 150 - i * 4, 70 + i * 22); g.stroke(); }
    // 袋中巨石
    for (const [x, y, r] of [[55, 106, 30], [94, 108, 27], [77, 76, 23]]) drawRock(g, x, y, r, S.rockColor, x * 13 + y);
    // 袋子
    g.strokeStyle = rgba('#c8a45f', .9); g.lineWidth = 4; g.beginPath(); g.moveTo(48, 56); g.lineTo(112, 56); g.stroke();
    // 顶部绳结
    g.fillStyle = '#c8a45f'; g.beginPath(); g.arc(80, 38, 9, 0, TAU); g.fill(); g.strokeStyle = dark(S.woodDark, .4); g.lineWidth = 2; g.stroke();
    g.strokeStyle = rgba('#d8b46a', .9); g.lineWidth = 5; g.beginPath(); g.moveTo(80, 0); g.lineTo(80, 36); g.stroke();
  });
}

function buildAcid(S) {
  return mk(244, 620, (g, W, H) => {
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, 'rgba(180,255,120,.18)'); grd.addColorStop(.12, rgba(light(S.acidColor, .2), .92)); grd.addColorStop(.3, rgba(S.acidColor, .78)); grd.addColorStop(.68, dark(S.acidColor, .45)); grd.addColorStop(1, dark(S.acidColor, .78));
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    // 表面波纹
    const R = rng(81);
    for (let k = 0; k < 5; k++) {
      g.strokeStyle = rgba(light(S.acidColor, .5), .45 - k * .06); g.lineWidth = 3 - k * .4;
      g.beginPath(); g.moveTo(0, 12 + k * 7);
      for (let x = 0; x <= W; x += 16) g.lineTo(x, 12 + k * 7 + Math.sin(x * .06 + k) * 4);
      g.stroke();
    }
    // 气泡
    for (let i = 0; i < 16; i++) {
      const x = 16 + R() * (W - 32), y = 50 + R() * (H - 80), r = 2 + R() * 7;
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = rgba(light(S.acidColor, .6), .16 + R() * .2); g.fill();
      g.strokeStyle = rgba(light(S.acidColor, .8), .2); g.lineWidth = 1; g.stroke();
    }
    // 亮色液面
    g.strokeStyle = 'rgba(230,255,170,.75)'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(0, 10);
    for (let x = 0; x <= W; x += 12) g.lineTo(x, 10 + Math.sin(x * .07) * 4);
    g.stroke();
    // 边缘暗部
    const edge = g.createLinearGradient(0, 0, W, 0);
    edge.addColorStop(0, 'rgba(0,0,0,.5)'); edge.addColorStop(.18, 'rgba(0,0,0,0)');
    edge.addColorStop(.82, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(0,0,0,.5)');
    g.fillStyle = edge; g.fillRect(0, 0, W, H);
    // 反光
    const gl = g.createLinearGradient(0, 0, W, 0);
    gl.addColorStop(0, 'rgba(255,255,255,.18)'); gl.addColorStop(.2, 'rgba(255,255,255,0)'); gl.addColorStop(.7, 'rgba(255,255,255,.05)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gl; g.fillRect(0, 0, W, H);
  });
}

function buildBubble(S) {
  return mk(50, 50, (g, W, H) => {
    const grd = g.createRadialGradient(W * .36, H * .3, 1, W / 2, H / 2, 22);
    grd.addColorStop(0, 'rgba(255,255,255,.65)'); grd.addColorStop(.55, rgba(S.acidColor, .28)); grd.addColorStop(1, rgba(S.acidColor, .02));
    g.beginPath(); g.arc(W / 2, H / 2, 21, 0, TAU); g.fillStyle = grd; g.fill();
    g.strokeStyle = rgba(light(S.acidColor, .6), .35); g.lineWidth = 2; g.stroke();
  });
}

// ---------- 矿工 ----------
function drawFace(g, mode = 'scared') {
  const skin = '#f3c7a3', ink = '#30201b';
  // 头
  g.beginPath(); g.ellipse(0, 0, 35, 36, -.03, 0, TAU); g.fillStyle = skin; g.fill();
  g.strokeStyle = ink; g.lineWidth = 3.4; g.stroke();
  // 耳朵
  g.beginPath(); g.ellipse(-34, 4, 7, 9, 0, 0, TAU); g.fillStyle = skin; g.fill(); g.stroke();
  g.beginPath(); g.arc(-34, 4, 3, 0, TAU); g.fillStyle = '#d79572'; g.fill();
  // 头发
  g.fillStyle = '#e9b955';
  for (const [x, y, r] of [[-26, -27, 12], [-8, -34, 13], [12, -32, 12], [27, -22, 9]]) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  g.strokeStyle = rgba(ink, .8); g.lineWidth = 2; g.stroke();
  // 帽子
  g.save(); g.rotate(-.08);
  const cap = g.createLinearGradient(-10, -52, 10, -20);
  cap.addColorStop(0, '#fffdf4'); cap.addColorStop(.6, '#f6efdf'); cap.addColorStop(1, '#d9d1c0');
  g.beginPath(); g.ellipse(0, -33, 30, 20, 0, Math.PI, TAU); g.quadraticCurveTo(30, -15, 0, -15); g.quadraticCurveTo(-30, -15, -30, -33); g.closePath(); g.fillStyle = cap; g.fill(); g.strokeStyle = ink; g.lineWidth = 3; g.stroke();
  g.beginPath(); g.ellipse(-30, -28, 20, 7, -.25, Math.PI * .92, Math.PI * 1.95); g.fillStyle = '#fffaf0'; g.fill(); g.strokeStyle = ink; g.lineWidth = 2.6; g.stroke();
  g.strokeStyle = 'rgba(50,70,55,.8)'; g.lineWidth = 3; g.beginPath(); g.moveTo(-27, -25); g.quadraticCurveTo(-4, -37, 22, -28); g.stroke();
  g.fillStyle = '#56705a'; g.beginPath(); g.arc(13, -19, 4.5, 0, TAU); g.fill();
  g.restore();
  // 脸
  if (mode === 'happy') {
    g.strokeStyle = ink; g.lineWidth = 3;
    g.beginPath(); g.arc(-14, -2, 7, Math.PI * 1.15, Math.PI * 1.9); g.stroke();
    g.beginPath(); g.arc(13, -1, 7, Math.PI * 1.1, Math.PI * 1.85); g.stroke();
    g.beginPath(); g.arc(0, 10, 12, .15, Math.PI - .15); g.strokeStyle = ink; g.lineWidth = 3; g.stroke();
    g.fillStyle = 'rgba(232,120,100,.45)'; g.beginPath(); g.ellipse(-23, 10, 6, 4, 0, 0, TAU); g.fill(); g.beginPath(); g.ellipse(21, 11, 6, 4, 0, 0, TAU); g.fill();
  } else if (mode === 'dizzy') {
    g.strokeStyle = ink; g.lineWidth = 2.2;
    for (const [x, y] of [[-14, -1], [13, 0]]) {
      g.beginPath();
      for (let t = 0; t < 3.6; t += .18) { const r = 1 + t * 2.1; const px = x + Math.cos(t) * r, py = y + Math.sin(t) * r; t ? g.lineTo(px, py) : g.moveTo(px, py); }
      g.stroke();
    }
    g.beginPath(); g.moveTo(-9, 16); g.quadraticCurveTo(-2, 11, 1, 16); g.quadraticCurveTo(4, 21, 10, 15); g.stroke();
  } else {
    // 惊恐眼睛
    for (const [x, y, r] of [[-14, -3, 11], [13, -2, 10]]) {
      g.beginPath(); g.ellipse(x, y, r, r * 1.07, 0, 0, TAU); g.fillStyle = '#fffdf4'; g.fill(); g.strokeStyle = ink; g.lineWidth = 2.4; g.stroke();
      g.beginPath(); g.arc(x - 2.5, y + 1, 4.7, 0, TAU); g.fillStyle = '#2a1a16'; g.fill();
      g.beginPath(); g.arc(x - 4, y - 1, 1.5, 0, TAU); g.fillStyle = '#fff'; g.fill();
    }
    // 眉毛
    g.strokeStyle = '#7c4a2c'; g.lineWidth = 3; g.beginPath(); g.moveTo(-25, -17); g.lineTo(-7, -20); g.stroke(); g.beginPath(); g.moveTo(3, -20); g.lineTo(21, -16); g.stroke();
    // 嘴
    g.beginPath(); g.ellipse(1, 17, 7, 9, .08, 0, TAU); g.fillStyle = '#64252a'; g.fill(); g.strokeStyle = ink; g.lineWidth = 2.4; g.stroke();
    g.beginPath(); g.ellipse(1, 21, 4, 3.5, 0, 0, TAU); g.fillStyle = '#e0717a'; g.fill();
    // 汗
    g.beginPath(); g.moveTo(31, -9); g.quadraticCurveTo(37, 0, 31, 4); g.quadraticCurveTo(25, 0, 31, -9); g.fillStyle = 'rgba(120,210,235,.8)'; g.fill(); g.strokeStyle = 'rgba(50,120,150,.7)'; g.lineWidth = 1.5; g.stroke();
  }
  // 脖子
  g.fillStyle = '#e8b48e'; g.fillRect(-11, 27, 22, 12); g.strokeStyle = ink; g.lineWidth = 2.5; g.strokeRect(-11, 27, 22, 12);
}
function buildHead(mode) {
  return mk(132, 132, (g) => { g.translate(66, 66); drawFace(g, mode); });
}
function buildBody(rope = true) {
  return mk(138, 154, (g, W, H) => {
    const ink = '#30201b', skin = '#f0c19e';
    g.translate(W / 2, H - 16);
    // 躯干
    g.beginPath(); g.moveTo(-26, -112); g.quadraticCurveTo(-38, -64, -30, -4); g.quadraticCurveTo(0, 10, 31, -4); g.quadraticCurveTo(38, -64, 27, -112); g.quadraticCurveTo(0, -126, -26, -112); g.closePath();
    const grd = g.createLinearGradient(-30, -110, 30, 0);
    grd.addColorStop(0, light(skin, .18)); grd.addColorStop(.6, skin); grd.addColorStop(1, dark(skin, .22));
    g.fillStyle = grd; g.fill(); g.strokeStyle = ink; g.lineWidth = 3.4; g.stroke();
    // 胸/腹线
    g.strokeStyle = 'rgba(150,85,55,.45)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -82); g.lineTo(0, -32); g.stroke();
    g.beginPath(); g.arc(-9, -96, 7, .2, Math.PI - .2); g.stroke(); g.beginPath(); g.arc(12, -95, 6.5, .2, Math.PI - .2); g.stroke();
    // 红短裤
    g.beginPath(); g.moveTo(-31, -24); g.quadraticCurveTo(0, -10, 32, -24); g.lineTo(34, 4); g.quadraticCurveTo(16, 12, 2, 6); g.quadraticCurveTo(-14, 12, -34, 2); g.closePath();
    const sh = g.createLinearGradient(0, -30, 0, 10);
    sh.addColorStop(0, '#f06b72'); sh.addColorStop(1, '#b83444');
    g.fillStyle = sh; g.fill(); g.strokeStyle = ink; g.lineWidth = 3; g.stroke();
    g.strokeStyle = 'rgba(90,20,30,.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -18); g.lineTo(1, 4); g.stroke();
    if (rope) {
      // 腰间绳
      g.strokeStyle = '#c9a458'; g.lineWidth = 6; g.beginPath(); g.moveTo(-32, -38); g.quadraticCurveTo(0, -28, 32, -38); g.stroke();
      g.strokeStyle = 'rgba(90,60,20,.45)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-32, -40); g.quadraticCurveTo(0, -30, 32, -40); g.stroke();
      // 绑在胸口的绳圈
      for (let i = 0; i < 3; i++) {
        g.strokeStyle = i === 1 ? '#d9b665' : '#c9a458'; g.lineWidth = 6 - i * .8;
        g.beginPath(); g.moveTo(-29, -99 + i * 17); g.quadraticCurveTo(0, -91 + i * 17, 29, -102 + i * 17); g.stroke();
        g.strokeStyle = 'rgba(90,60,20,.4)'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(-29, -101 + i * 17); g.quadraticCurveTo(0, -93 + i * 17, 29, -104 + i * 17); g.stroke();
      }
      // 绳结
      g.fillStyle = '#d9b665'; g.beginPath(); g.arc(-4, -52, 7, 0, TAU); g.fill(); g.strokeStyle = '#8b6529'; g.lineWidth = 2; g.stroke();
      g.strokeStyle = '#c9a458'; g.lineWidth = 4; g.beginPath(); g.moveTo(-4, -45); g.quadraticCurveTo(6, -30, 2, -20); g.stroke();
    }
    // 肚脐
    g.beginPath(); g.ellipse(1, -45, 2.2, 3, 0, 0, TAU); g.fillStyle = 'rgba(120,60,40,.6)'; g.fill();
    // 平台阴影接触
    g.beginPath(); g.ellipse(0, 8, 32, 6, 0, 0, TAU); g.fillStyle = 'rgba(0,0,0,.25)'; g.fill();
  });
}
function buildArm(kind = 'front') {
  return mk(118, 56, (g, W, H) => {
    const ink = '#30201b', skin = kind === 'front' ? '#f4c7a3' : '#dda67f';
    g.translate(W - 12, H / 2);
    // 手臂向右为肩，拳头在左
    g.beginPath(); g.moveTo(8, -13); g.quadraticCurveTo(-26, -17, -54, -11); g.quadraticCurveTo(-82, -7, -88, 0); g.quadraticCurveTo(-82, 8, -54, 10); g.quadraticCurveTo(-26, 15, 8, 14); g.closePath();
    const grd = g.createLinearGradient(8, -12, -80, 10);
    grd.addColorStop(0, light(skin, .18)); grd.addColorStop(1, dark(skin, .24));
    g.fillStyle = grd; g.fill(); g.strokeStyle = ink; g.lineWidth = 3.2; g.stroke();
    // 拳头
    g.beginPath(); g.arc(-88, 0, 12, 0, TAU); g.fillStyle = light(skin, .06); g.fill(); g.strokeStyle = ink; g.lineWidth = 3; g.stroke();
    g.strokeStyle = 'rgba(120,60,40,.5)'; g.lineWidth = 1.6; g.beginPath(); g.arc(-91, 0, 7, .2, 2.9); g.stroke();
    // 肘窝
    g.strokeStyle = 'rgba(140,75,50,.35)'; g.lineWidth = 2; g.beginPath(); g.arc(-52, 1, 7, -.6, .8); g.stroke();
    // 上臂阴影
    g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.ellipse(-25, -7, 18, 4, -.1, 0, TAU); g.fill();
  });
}
function buildArmScared(side = 'l') {
  return mk(120, 120, (g, W, H) => {
    const ink = '#30201b', skin = side === 'l' ? '#f0c19e' : '#e7b58f';
    const sh = side === 'l' ? { x: 100, y: 82 } : { x: 20, y: 82 };
    const el = side === 'l' ? { x: 66, y: 102 } : { x: 54, y: 102 };
    const fi = side === 'l' ? { x: 84, y: 24 } : { x: 36, y: 24 };
    const stroke = (a, b, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); };
    // 深色描边
    stroke(sh, el, 30, ink); stroke(el, fi, 27, ink);
    g.beginPath(); g.arc(fi.x, fi.y, 18, 0, TAU); g.fillStyle = ink; g.fill();
    // 皮肤
    stroke(sh, el, 23, skin); stroke(el, fi, 20, skin);
    g.beginPath(); g.arc(fi.x, fi.y, 14, 0, TAU); g.fillStyle = light(skin, .08); g.fill(); g.strokeStyle = ink; g.lineWidth = 2.6; g.stroke();
    // 肘部/手背阴影
    g.strokeStyle = 'rgba(140,80,55,.35)'; g.lineWidth = 3; g.beginPath(); g.arc(el.x, el.y, 9, -.4, 1.2); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.24)'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(sh.x - (side === 'l' ? 5 : -5), sh.y - 2); g.lineTo(el.x - (side === 'l' ? 3 : -3), el.y - 2); g.stroke();
    // 指节
    g.strokeStyle = 'rgba(120,65,45,.45)'; g.lineWidth = 1.8;
    g.beginPath(); g.moveTo(fi.x - 6, fi.y - 4); g.quadraticCurveTo(fi.x, fi.y - 8, fi.x + 6, fi.y - 4); g.stroke();
  });
}

function buildLeg(kind = 'front') {
  return mk(62, 92, (g, W, H) => {
    const ink = '#30201b', skin = kind === 'front' ? '#f0c19e' : '#d9a078';
    g.translate(W / 2, 6);
    // 大腿小腿
    g.beginPath(); g.moveTo(-12, 0); g.quadraticCurveTo(-16, 28, -12, 48); g.quadraticCurveTo(-8, 66, -11, 80); g.lineTo(12, 82); g.quadraticCurveTo(15, 62, 12, 48); g.quadraticCurveTo(15, 26, 12, 0); g.closePath();
    const grd = g.createLinearGradient(-12, 0, 12, 82);
    grd.addColorStop(0, light(skin, .15)); grd.addColorStop(1, dark(skin, .24));
    g.fillStyle = grd; g.fill(); g.strokeStyle = ink; g.lineWidth = 3.2; g.stroke();
    // 膝窝
    g.strokeStyle = 'rgba(140,75,50,.4)'; g.lineWidth = 2; g.beginPath(); g.arc(0, 48, 7, .2, 2.9); g.stroke();
    // 短裤裤脚
    g.beginPath(); g.moveTo(-13, 0); g.quadraticCurveTo(0, 8, 13, 0); g.lineTo(14, 16); g.quadraticCurveTo(0, 22, -14, 16); g.closePath();
    g.fillStyle = '#cf3f4e'; g.fill(); g.strokeStyle = ink; g.lineWidth = 2.5; g.stroke();
    // 鞋
    g.beginPath(); g.moveTo(-12, 78); g.quadraticCurveTo(-22, 84, -18, 89); g.lineTo(20, 89); g.quadraticCurveTo(22, 82, 12, 78); g.closePath();
    g.fillStyle = '#d8d4cb'; g.fill(); g.strokeStyle = ink; g.lineWidth = 2.8; g.stroke();
    g.strokeStyle = 'rgba(90,80,70,.5)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-15, 85); g.lineTo(18, 85); g.stroke();
  });
}
function buildHeadHappy() { return buildHead('happy'); }
function buildHeadDizzy() { return buildHead('dizzy'); }

// 结束页的矿工立绘（独立图层）
function buildEndHero() {
  return mk(330, 400, (g, W, H) => {
    g.save(); g.translate(W / 2, H - 28);
    // 影子
    g.beginPath(); g.ellipse(0, 2, 92, 18, 0, 0, TAU); g.fillStyle = 'rgba(0,0,0,.35)'; g.fill();
    // 腿
    g.save(); g.translate(-24, -150); g.rotate(-.08); const leg = buildLeg('front'); g.drawImage(leg, -31, -6); g.restore();
    g.save(); g.translate(26, -150); g.rotate(.1); const leg2 = buildLeg('back'); g.drawImage(leg2, -31, -6); g.restore();
    // 身体
    g.save(); g.translate(0, -64); const body = buildBody(); g.drawImage(body, -69, -138); g.restore();
    // 举起的双臂
    g.save(); g.translate(-30, -200); g.rotate(-1.25); const arm = buildArm('front'); g.drawImage(arm, -106, -28); g.restore();
    g.save(); g.translate(32, -200); g.rotate(1.35); const arm2 = buildArm('back'); g.drawImage(arm2, -106, -28); g.restore();
    // 头
    g.save(); g.translate(2, -246); g.rotate(.02); const head = buildHead('happy'); g.drawImage(head, -66, -66); g.restore();
    // 金色小镐
    g.save(); g.translate(104, -242); g.rotate(.5);
    g.strokeStyle = '#b58340'; g.lineWidth = 9; g.beginPath(); g.moveTo(-6, 50); g.lineTo(10, -50); g.stroke();
    const m = g.createLinearGradient(-36, -40, 30, -8); m.addColorStop(0, '#ffeaa0'); m.addColorStop(.5, '#f0b73c'); m.addColorStop(1, '#9c661f');
    g.beginPath(); g.moveTo(-38, -36); g.quadraticCurveTo(8, -60, 38, -30); g.quadraticCurveTo(4, -24, -38, -20); g.closePath(); g.fillStyle = m; g.fill(); g.strokeStyle = '#6f4a1b'; g.lineWidth = 3; g.stroke();
    g.restore();
    g.restore();
  });
}

// ---------- HUD ----------
function buildTimerRing(S, phase) {
  const col = phase === 'g' ? '#5ee63f' : phase === 'y' ? '#f4df3a' : '#ff3f3f';
  return mk(96, 96, (g, W, H) => {
    const cx = W / 2, cy = H / 2;
    g.fillStyle = 'rgba(0,0,0,.38)'; g.beginPath(); g.arc(cx + 2, cy + 4, 42, 0, TAU); g.fill();
    // 深色外框
    const rim = g.createLinearGradient(0, 0, 0, H);
    rim.addColorStop(0, '#4a4147'); rim.addColorStop(.5, '#2b2328'); rim.addColorStop(1, '#171114');
    g.beginPath(); g.arc(cx, cy, 43, 0, TAU); g.fillStyle = rim; g.fill();
    g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 3; g.stroke();
    // 彩色表盘
    const face = g.createRadialGradient(cx - 8, cy - 10, 5, cx, cy, 38);
    if (phase === 'r') {
      face.addColorStop(0, '#6d1b1b'); face.addColorStop(.65, '#3d0d0f'); face.addColorStop(1, '#21070a');
    } else {
      face.addColorStop(0, light(col, .25)); face.addColorStop(.62, col); face.addColorStop(1, dark(col, .18));
    }
    g.beginPath(); g.arc(cx, cy, 37, 0, TAU); g.fillStyle = face; g.fill();
    g.strokeStyle = col; g.lineWidth = 4; g.stroke();
    g.beginPath(); g.arc(cx, cy, 32, 0, TAU); g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 2; g.stroke();
    // 顶部高光
    g.beginPath(); g.ellipse(cx - 9, cy - 23, 13, 5, -.4, 0, TAU); g.fillStyle = 'rgba(255,255,255,.26)'; g.fill();
  });
}
function buildTimerMarker(S) {
  return mk(22, 22, (g, W, H) => {
    const grd = g.createRadialGradient(W / 2, H / 2, 1, W / 2, H / 2, 11);
    grd.addColorStop(0, '#fff'); grd.addColorStop(.4, S.glowColor); grd.addColorStop(1, rgba(S.glowColor, 0));
    g.fillStyle = grd; g.beginPath(); g.arc(W / 2, H / 2, 11, 0, TAU); g.fill();
  });
}
function buildDigit(n, S, white = false) {
  return mk(38, 58, (g, W, H) => {
    g.font = '900 50px "Arial Black","PingFang SC","Microsoft YaHei",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (white) {
      g.lineWidth = 8; g.strokeStyle = 'rgba(20,8,10,.9)'; g.strokeText(String(n), W / 2, H / 2 + 2);
      g.fillStyle = '#fff7f3'; g.fillText(String(n), W / 2, H / 2);
    } else {
      g.lineWidth = 2.5; g.strokeStyle = 'rgba(255,255,255,.28)'; g.strokeText(String(n), W / 2, H / 2 + 2);
      g.fillStyle = '#17110e'; g.fillText(String(n), W / 2, H / 2);
    }
  });
}
function buildCaption(S) {
  if (!S.captionShow || !S.captionText) return null;
  return mk(690, 108, (g, W, H) => {
    g.save(); g.translate(W / 2, H / 2);
    drawOutlinedText(g, S.captionText, 0, 0, '900 50px "PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif', '#fffef8', 'rgba(16,12,14,.96)', 12, 3);
    g.restore();
  });
}
function buildDisclaimer(S) {
  if (!S.discShow) return null;
  const h = Math.max(44, S.discSize * 2.2);
  return mk(720, h, (g, W, H) => {
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(.35, 'rgba(0,0,0,.58)'); grd.addColorStop(1, 'rgba(0,0,0,.78)');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.font = `600 ${S.discSize}px "PingFang SC","Microsoft YaHei",sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(255,255,255,.72)';
    g.fillText(S.discText, W / 2, H / 2 + 4, W - 36);
  });
}
function buildMatchRing(S) {
  return mk(170, 170, (g, W, H) => {
    const cx = W / 2, cy = H / 2;
    const grd = g.createRadialGradient(cx, cy, 20, cx, cy, 82);
    grd.addColorStop(0, rgba(S.glowColor, 0)); grd.addColorStop(.55, rgba(S.glowColor, .1)); grd.addColorStop(.8, rgba(S.glowColor, .35)); grd.addColorStop(1, rgba(S.glowColor, 0));
    g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, 82, 0, TAU); g.fill();
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU, r = i % 2 ? 52 : 66;
      g.strokeStyle = rgba(S.glowColor, .85); g.lineWidth = 3;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * 45, cy + Math.sin(a) * 45); g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.stroke();
    }
    g.beginPath(); g.arc(cx, cy, 48, 0, TAU); g.strokeStyle = rgba(light(S.glowColor, .5), .9); g.lineWidth = 4; g.stroke();
  });
}
function buildHintRing(S) {
  return mk(110, 110, (g, W, H) => {
    const cx = W / 2, cy = H / 2;
    const grd = g.createRadialGradient(cx, cy, 26, cx, cy, 54);
    grd.addColorStop(0, rgba(S.glowColor, 0)); grd.addColorStop(.7, rgba(S.glowColor, .18)); grd.addColorStop(1, rgba(S.glowColor, 0));
    g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, 54, 0, TAU); g.fill();
    g.strokeStyle = rgba(light(S.glowColor, .3), .9); g.lineWidth = 4; g.setLineDash([10, 8]); g.beginPath(); g.arc(cx, cy, 45, 0, TAU); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#fff'; g.beginPath(); starPath(g, cx, cy - 54, 7, 2, 4, -.2); g.fill();
  });
}
function buildPlusTime(S) {
  return mk(150, 64, (g, W, H) => {
    g.font = '900 40px "Arial Black","PingFang SC",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 8; g.strokeStyle = 'rgba(20,12,10,.9)'; g.strokeText(`+${S.matchBonus}s`, W / 2, H / 2);
    g.fillStyle = '#fff4b0'; g.fillText(`+${S.matchBonus}s`, W / 2, H / 2);
  });
}
function buildSpark(S, gold = true) {
  return mk(34, 34, (g, W, H) => {
    const c = gold ? S.glowColor : '#ffffff';
    const grd = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 17);
    grd.addColorStop(0, '#fff'); grd.addColorStop(.3, rgba(c, .95)); grd.addColorStop(1, rgba(c, 0));
    g.fillStyle = grd; g.beginPath(); starPath(g, W / 2, H / 2, 16, 4, 4, 0); g.fill();
  });
}
function buildChip(S, teal = true) {
  return mk(24, 20, (g, W, H) => {
    const c = teal ? S.rockColor : S.brickColor;
    g.beginPath(); g.moveTo(3, 14); g.lineTo(8, 3); g.lineTo(19, 5); g.lineTo(22, 15); g.lineTo(11, 19); g.closePath();
    g.fillStyle = c; g.fill(); g.strokeStyle = dark(c, .5); g.lineWidth = 1.5; g.stroke();
    g.fillStyle = rgba(light(c, .5), .35); g.beginPath(); g.moveTo(7, 6); g.lineTo(14, 7); g.lineTo(9, 11); g.closePath(); g.fill();
  });
}
function buildDust() {
  return mk(64, 64, (g, W, H) => {
    const grd = g.createRadialGradient(W / 2, H / 2, 2, W / 2, H / 2, 32);
    grd.addColorStop(0, 'rgba(190,170,160,.45)'); grd.addColorStop(.5, 'rgba(150,135,130,.2)'); grd.addColorStop(1, 'rgba(140,125,120,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(W / 2, H / 2, 32, 0, TAU); g.fill();
  });
}
function buildFlash(hex, strength = 1) {
  return mk(DW, DH, (g) => {
    const grd = g.createRadialGradient(DW / 2, DH * .5, 40, DW / 2, DH * .55, DH * .72);
    grd.addColorStop(0, rgba(hex, .05 * strength)); grd.addColorStop(.55, rgba(hex, .2 * strength)); grd.addColorStop(1, rgba(hex, .72 * strength));
    g.fillStyle = grd; g.fillRect(0, 0, DW, DH);
  });
}
function buildEscapeGlow(S) {
  return mk(440, 440, (g, W, H) => {
    const grd = g.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, 220);
    grd.addColorStop(0, 'rgba(255,255,235,.75)'); grd.addColorStop(.25, rgba(S.glowColor, .45)); grd.addColorStop(.65, rgba(S.glowColor, .12)); grd.addColorStop(1, rgba(S.glowColor, 0));
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
  });
}
function buildWinRays(S) {
  return mk(760, 760, (g, W, H) => {
    g.translate(W / 2, H / 2);
    for (let i = 0; i < 18; i++) {
      const a = i / 18 * TAU, w = .035 + (i % 3) * .014;
      g.fillStyle = rgba(S.glowColor, .08 + (i % 2) * .05);
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 370, a - w, a + w); g.closePath(); g.fill();
    }
    const grd = g.createRadialGradient(0, 0, 8, 0, 0, 160);
    grd.addColorStop(0, 'rgba(255,255,240,.75)'); grd.addColorStop(1, rgba(S.glowColor, 0));
    g.fillStyle = grd; g.beginPath(); g.arc(0, 0, 160, 0, TAU); g.fill();
  });
}

// ---------- 失败徽章 / 白手套 ----------
function buildFailBadge() {
  return mk(330, 330, (g, W, H) => {
    const cx = W / 2, cy = H / 2;
    g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.arc(cx + 5, cy + 9, 152, 0, TAU); g.fill();
    g.beginPath(); g.arc(cx, cy, 148, 0, TAU); g.fillStyle = '#fffdf7'; g.fill();
    g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 8; g.stroke();
    const grd = g.createRadialGradient(cx - 35, cy - 45, 10, cx, cy, 132);
    grd.addColorStop(0, '#ef557e'); grd.addColorStop(.65, '#df2f61'); grd.addColorStop(1, '#b81448');
    g.beginPath(); g.arc(cx, cy, 132, 0, TAU); g.fillStyle = grd; g.fill();
    g.beginPath(); g.arc(cx, cy, 115, 0, TAU); g.strokeStyle = 'rgba(255,255,255,.16)'; g.lineWidth = 4; g.stroke();
    g.save(); g.translate(cx, cy + 2); g.rotate(-.05);
    g.font = '900 94px "Arial Black","PingFang SC",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 10; g.strokeStyle = 'rgba(120,10,44,.25)'; g.strokeText('FAIL', 0, 4);
    g.fillStyle = '#fffdf7'; g.fillText('FAIL', 0, 0);
    g.restore();
    // 白色高光
    g.beginPath(); g.ellipse(cx - 48, cy - 80, 44, 18, -.5, 0, TAU); g.fillStyle = 'rgba(255,255,255,.18)'; g.fill();
  });
}

function gloveCanvas() {
  return mk(400, 480, (g) => {
    const dark = '#22303a';
    const cap = (x1, y1, x2, y2, r) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineCap = 'round'; g.stroke(); };
    // 外层深色描边（所有部件先铺大一圈）
    g.strokeStyle = dark; g.fillStyle = dark;
    g.lineWidth = 68; cap(82, 46, 168, 240);
    g.beginPath(); g.ellipse(218, 292, 96, 110, -.2, 0, TAU); g.fill();
    g.lineWidth = 72; cap(133, 266, 92, 340);
    for (const [x, y, r] of [[288, 256, 42], [310, 316, 42], [298, 372, 37]]) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
    // 白色主体
    const white = g.createLinearGradient(60, 40, 340, 440);
    white.addColorStop(0, '#ffffff'); white.addColorStop(.5, '#f8fdff'); white.addColorStop(1, '#d8edf8');
    g.strokeStyle = 'rgba(248,253,255,1)'; g.fillStyle = white;
    g.lineWidth = 60; cap(82, 46, 168, 240);
    g.beginPath(); g.ellipse(218, 292, 90, 104, -.2, 0, TAU); g.fill();
    g.lineWidth = 64; cap(133, 266, 92, 340);
    for (const [x, y, r] of [[288, 256, 36], [310, 316, 36], [298, 372, 31]]) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
    // 食指关节与高光
    g.strokeStyle = 'rgba(174,214,235,.55)'; g.lineWidth = 8; g.lineCap = 'round';
    g.beginPath(); g.moveTo(104, 112); g.quadraticCurveTo(150, 142, 176, 216); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 9;
    g.beginPath(); g.moveTo(110, 68); g.quadraticCurveTo(136, 136, 158, 198); g.stroke();
    // 拇指根弧线
    g.strokeStyle = 'rgba(170,210,232,.5)'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(138, 300); g.quadraticCurveTo(170, 336, 212, 356); g.stroke();
    // 折叠手指的接缝
    g.strokeStyle = 'rgba(160,200,225,.4)'; g.lineWidth = 5;
    g.beginPath(); g.arc(256, 286, 58, -.2, 1.15); g.stroke();
    g.beginPath(); g.arc(268, 342, 54, -.15, 1.2); g.stroke();
    // 黑色袖口
    g.save(); g.translate(304, 410); g.rotate(.25);
    g.fillStyle = '#1d2930'; rr(g, -82, -36, 164, 82, 22); g.fill();
    g.strokeStyle = '#0c1318'; g.lineWidth = 5; g.stroke();
    g.fillStyle = '#43545c'; rr(g, -72, -30, 144, 26, 12); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 3; g.beginPath(); g.moveTo(-60, -20); g.lineTo(60, -20); g.stroke();
    g.restore();
    // 指尖很轻的粉红
    g.beginPath(); g.arc(86, 58, 14, 0, TAU); g.fillStyle = 'rgba(255,215,220,.45)'; g.fill();
  });
}

export function gloveAsset(S) {
  const c = gloveCanvas();
  return { id: 'hand', c, w: c.width, h: c.height, ax: S.handAnchorX * c.width, ay: S.handAnchorY * c.height };
}

// ---------- 结束页 ----------
function drawEndText(g, S, W, H) {
  g.save(); g.translate(0, 0); g.rotate(-.02);
  // 参考结束卡：橙色“无需下载”+ 白色“点击即玩哦”，错落排列
  drawOutlinedText(g, S.endTitle || '无需下载', 240, 142, '900 56px "PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif', '#ff9b08', '#fffdf6', 12, 2);
  drawOutlinedText(g, S.endSub || '点击即玩哦', 474, 222, '900 50px "PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif', '#fffdf6', '#d97706', 10, 2);
  g.restore();
  g.font = '400 14px "PingFang SC","Microsoft YaHei",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(62,58,58,.5)';
  g.fillText('广告创意演示 · 实际玩法与奖励以游戏内为准', W / 2, 1234);
}

function buildEndCard(S, fail = false) {
  return mk(DW, DH, (g, W, H) => {
    // 优先使用 AI 生成的原创黑猫照片（非参考视频素材）；加载失败时退回程序化黑猫。
    if (endCatImg) {
      g.drawImage(endCatImg, 0, 0, W, H);
      drawEndText(g, S, W, H);
      return;
    }
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#fafafa'); bg.addColorStop(.55, '#f2f2f2'); bg.addColorStop(1, '#e8e9ea');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const vg = g.createRadialGradient(W * .48, H * .46, 180, W * .5, H * .5, H * .72);
    vg.addColorStop(0, 'rgba(255,255,255,0)'); vg.addColorStop(1, 'rgba(120,120,125,.16)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    // 地面柔光
    const floor = g.createLinearGradient(0, 980, 0, H);
    floor.addColorStop(0, 'rgba(190,190,195,0)'); floor.addColorStop(1, 'rgba(150,150,158,.2)');
    g.fillStyle = floor; g.fillRect(0, 980, W, H - 980);
    // 猫的地面阴影
    g.save(); g.filter = 'blur(10px)'; g.fillStyle = 'rgba(70,62,64,.3)'; g.beginPath(); g.ellipse(360, 1120, 235, 42, 0, 0, TAU); g.fill(); g.restore();

    // ---------- 原创黑猫 ----------
    const ink = '#141416', fur = '#222226', fur2 = '#2f3035', rim = '#5b5e64';
    g.save(); g.translate(360, 760);
    // 尾巴
    g.strokeStyle = ink; g.lineWidth = 54; g.lineCap = 'round'; g.beginPath();
    g.moveTo(130, 260); g.bezierCurveTo(250, 360, 360, 300, 330, 190);
    g.bezierCurveTo(312, 130, 250, 150, 250, 208); g.stroke();
    g.strokeStyle = fur2; g.lineWidth = 32; g.beginPath();
    g.moveTo(138, 256); g.bezierCurveTo(244, 340, 338, 290, 316, 204); g.stroke();
    // 身体
    const body = g.createRadialGradient(-40, 80, 20, 20, 200, 260);
    body.addColorStop(0, '#3b3d43'); body.addColorStop(.45, fur); body.addColorStop(1, '#101012');
    g.fillStyle = body; g.beginPath(); g.ellipse(0, 220, 170, 210, 0, 0, TAU); g.fill();
    g.strokeStyle = ink; g.lineWidth = 8; g.stroke();
    // 后腿 / 前腿
    g.fillStyle = fur2; g.beginPath(); g.ellipse(-120, 300, 75, 105, .1, 0, TAU); g.fill(); g.strokeStyle = ink; g.lineWidth = 6; g.stroke();
    g.fillStyle = fur; g.beginPath(); g.ellipse(110, 300, 70, 115, -.1, 0, TAU); g.fill(); g.strokeStyle = ink; g.lineWidth = 6; g.stroke();
    // 前爪
    for (const [x, y] of [[-120, 390], [110, 392]]) {
      g.fillStyle = '#303238'; g.beginPath(); g.ellipse(x, y, 58, 34, 0, 0, TAU); g.fill(); g.strokeStyle = ink; g.lineWidth = 5; g.stroke();
      g.strokeStyle = '#5a5c62'; g.lineWidth = 3;
      for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(x + i * 17 - 4, y + 10); g.lineTo(x + i * 17 + 6, y + 27); g.stroke(); }
    }
    // 抬起的左前爪
    g.strokeStyle = ink; g.lineWidth = 66; g.lineCap = 'round'; g.beginPath(); g.moveTo(-132, 160); g.lineTo(-208, 56); g.stroke();
    g.strokeStyle = fur2; g.lineWidth = 46; g.beginPath(); g.moveTo(-132, 158); g.lineTo(-204, 62); g.stroke();
    g.fillStyle = '#33353b'; g.beginPath(); g.ellipse(-212, 40, 56, 60, -.35, 0, TAU); g.fill(); g.strokeStyle = ink; g.lineWidth = 6; g.stroke();
    g.fillStyle = '#b27b86'; g.beginPath(); g.ellipse(-204, 38, 22, 26, -.4, 0, TAU); g.fill();
    g.fillStyle = '#33353b'; g.beginPath(); g.ellipse(-230, 68, 16, 19, -.5, 0, TAU); g.fill();
    // 头
    const head = g.createRadialGradient(-45, -180, 10, 0, -140, 190);
    head.addColorStop(0, '#3d3f45'); head.addColorStop(.45, fur); head.addColorStop(1, '#0e0e10');
    g.fillStyle = head; g.beginPath(); g.ellipse(0, -150, 160, 145, 0, 0, TAU); g.fill(); g.strokeStyle = ink; g.lineWidth = 8; g.stroke();
    // 耳朵
    for (const sgn of [-1, 1]) {
      g.beginPath(); g.moveTo(sgn * 118, -250); g.quadraticCurveTo(sgn * 155, -350, sgn * 190, -294); g.quadraticCurveTo(sgn * 172, -240, sgn * 132, -226); g.closePath();
      g.fillStyle = fur; g.fill(); g.strokeStyle = ink; g.lineWidth = 7; g.stroke();
      g.beginPath(); g.moveTo(sgn * 138, -258); g.quadraticCurveTo(sgn * 156, -316, sgn * 176, -286); g.quadraticCurveTo(sgn * 160, -254, sgn * 144, -244); g.closePath();
      g.fillStyle = '#6e4a55'; g.fill();
    }
    // 眼睛
    for (const sgn of [-1, 1]) {
      const ex = sgn * 63, ey = -165;
      const eye = g.createRadialGradient(ex - 8, ey - 10, 2, ex, ey, 52);
      eye.addColorStop(0, '#fff6a8'); eye.addColorStop(.35, '#ffd735'); eye.addColorStop(.8, '#d99b00'); eye.addColorStop(1, '#8f5b00');
      g.beginPath(); g.ellipse(ex, ey, 48, 56, 0, 0, TAU); g.fillStyle = eye; g.fill();
      g.strokeStyle = '#1b1308'; g.lineWidth = 5; g.stroke();
      g.beginPath(); g.ellipse(ex + (sgn < 0 ? 5 : -5), ey + 2, 17, 36, -.05, 0, TAU); g.fillStyle = '#0c0b0a'; g.fill();
      g.beginPath(); g.arc(ex - 11, ey - 16, 10, 0, TAU); g.fillStyle = '#fffef1'; g.fill();
      g.beginPath(); g.arc(ex + 13, ey + 18, 4.5, 0, TAU); g.fillStyle = 'rgba(255,255,255,.8)'; g.fill();
      // 上眼睑阴影
      g.strokeStyle = 'rgba(30,25,20,.55)'; g.lineWidth = 4; g.beginPath(); g.arc(ex, ey, 50, Math.PI * 1.03, Math.PI * 1.55); g.stroke();
    }
    // 鼻子和嘴
    g.fillStyle = '#b56d7a'; g.beginPath(); g.moveTo(0, -90); g.lineTo(-14, -103); g.quadraticCurveTo(0, -110, 14, -103); g.closePath(); g.fill();
    g.strokeStyle = ink; g.lineWidth = 5; g.beginPath(); g.moveTo(0, -90); g.lineTo(0, -78); g.stroke();
    g.beginPath(); g.ellipse(0, -45, 38, 34, 0, 0, TAU); g.fillStyle = '#3d1019'; g.fill(); g.strokeStyle = ink; g.lineWidth = 5; g.stroke();
    g.beginPath(); g.ellipse(0, -27, 22, 17, 0, 0, TAU); g.fillStyle = '#e8798d'; g.fill();
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 3;
    for (const sgn of [-1, 1]) {
      for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(sgn * 40, -75 + i * 12); g.lineTo(sgn * 135, -95 + i * 20); g.stroke(); }
    }
    // 毛发光泽
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 10;
    g.beginPath(); g.arc(-40, -200, 95, Math.PI * 1.1, Math.PI * 1.55); g.stroke();
    g.beginPath(); g.moveTo(-110, 40); g.quadraticCurveTo(-130, 150, -95, 250); g.stroke();
    g.restore();

    drawEndText(g, S, W, H);
  });
}
function buildEndCta(S, text) {
  return mk(500, 116, (g, W, H) => {
    g.fillStyle = 'rgba(0,0,0,.45)'; rr(g, 8, 12, W - 16, H - 14, 44); g.fill();
    const grd = g.createLinearGradient(0, 8, 0, H - 8);
    grd.addColorStop(0, '#fff2a6'); grd.addColorStop(.35, '#ffd75a'); grd.addColorStop(.7, '#f6a728'); grd.addColorStop(1, '#d97a16');
    rr(g, 6, 4, W - 12, H - 20, 44); fillStroke(g, grd, '#7c3c10', 4);
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 3; g.beginPath(); g.moveTo(42, 18); g.lineTo(W - 42, 18); g.stroke();
    g.fillStyle = 'rgba(110,50,10,.9)'; g.font = '900 38px "PingFang SC","Microsoft YaHei",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text || '立即游玩', W / 2, 48);
    // 箭头
    g.fillStyle = 'rgba(110,50,10,.75)'; g.beginPath(); g.moveTo(W - 66, 34); g.lineTo(W - 42, 48); g.lineTo(W - 66, 62); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.ellipse(W / 2, 26, 128, 6, 0, 0, TAU); g.fill();
  });
}

// ---------- 组装资产 ----------
export function buildAssets(S, L) {
  applyScene(S);
  const A = {};
  const B = boardGeom(L);
  add(A, 'background', buildBackground(S), 360, 640);
  add(A, 'acid', buildAcid(S), 122, 620);
  add(A, 'bubble', buildBubble(S), 25, 25);
  add(A, 'board', buildBoard(S, L), B.w / 2, B.h / 2);
  add(A, 'slab', buildSlab(S));
  add(A, 'platform', buildPlatform(S), LAYOUT.platform.w / 2, LAYOUT.platform.h / 2);
  add(A, 'tray', buildTray(S), LAYOUT.tray.w / 2, LAYOUT.tray.h / 2);
  for (const c of ['red', 'blue', 'green', 'purple', 'yellow', 'pink']) add(A, 'tray_' + c, buildTray(S, COLOR_HEX[c]), LAYOUT.tray.w / 2, LAYOUT.tray.h / 2);
  add(A, 'tray_mount', buildTrayMount(S));
  add(A, 'pulley', buildPulley(S));
  add(A, 'weight', buildWeight(S));
  add(A, 'rope', mk(280, 18, (g, W, H) => {
    g.strokeStyle = '#3b2a17'; g.lineWidth = 10; g.beginPath(); g.moveTo(0, 9); g.lineTo(W, 9); g.stroke();
    g.strokeStyle = '#c8a45f'; g.lineWidth = 7; g.beginPath(); g.moveTo(0, 8); g.lineTo(W, 8); g.stroke();
    g.strokeStyle = 'rgba(255,235,180,.28)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 5); g.lineTo(W, 5); g.stroke();
    for (let x = 6; x < W; x += 18) { g.strokeStyle = 'rgba(90,60,20,.4)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x, 3); g.lineTo(x + 4, 13); g.stroke(); }
  }), 0, 9);
  add(A, 'plank_h0', buildPlank(S, B, 'h', 0));
  add(A, 'plank_h1', buildPlank(S, B, 'h', 1));
  add(A, 'plank_v0', buildPlank(S, B, 'v', 0));
  add(A, 'plank_v1', buildPlank(S, B, 'v', 1));
  for (const c of L.colors) add(A, 'screw_' + c, buildScrew(c));
  add(A, 'hero_head', buildHead('scared'));
  add(A, 'hero_head_happy', buildHeadHappy());
  add(A, 'hero_head_dizzy', buildHeadDizzy());
  add(A, 'hero_body', buildBody(true), 69, 138);
  add(A, 'hero_body_plain', buildBody(false), 69, 138);
  add(A, 'hero_arm_l', buildArm('back'), 106, 28);
  add(A, 'hero_arm_r', buildArm('front'), 106, 28);
  add(A, 'hero_arm_scared_l', buildArmScared('l'), 100, 82);
  add(A, 'hero_arm_scared_r', buildArmScared('r'), 20, 82);
  add(A, 'hero_leg_l', buildLeg('back'), 31, 8);
  add(A, 'hero_leg_r', buildLeg('front'), 31, 8);
  add(A, 'hero_shadow', mk(150, 38, (g, W, H) => { const grd = g.createRadialGradient(W / 2, H / 2, 2, W / 2, H / 2, 70); grd.addColorStop(0, 'rgba(0,0,0,.42)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.beginPath(); g.ellipse(W / 2, H / 2, 70, 18, 0, 0, TAU); g.fill(); }), 75, 19);
  add(A, 'timer_ring_g', buildTimerRing(S, 'g')); add(A, 'timer_ring_y', buildTimerRing(S, 'y')); add(A, 'timer_ring_r', buildTimerRing(S, 'r'));
  add(A, 'timer_marker', buildTimerMarker(S));
  for (let n = 0; n <= 9; n++) { add(A, 'digit_' + n, buildDigit(n, S)); add(A, 'digit_w_' + n, buildDigit(n, S, true)); }
  add(A, 'hint_ring', buildHintRing(S));
  add(A, 'match_ring', buildMatchRing(S));
  add(A, 'plus_time', buildPlusTime(S));
  add(A, 'spark', buildSpark(S, true));
  add(A, 'spark_white', buildSpark(S, false));
  add(A, 'chip0', buildChip(S, true)); add(A, 'chip1', buildChip(S, false));
  add(A, 'dust', buildDust());
  add(A, 'flash_fail', buildFlash('#ff2f3a', 1));
  add(A, 'flash_win', buildFlash('#ffd75a', .72));
  add(A, 'fail_badge', buildFailBadge());
  add(A, 'glove', gloveCanvas());
  add(A, 'escape_glow', buildEscapeGlow(S));
  add(A, 'win_rays', buildWinRays(S), 380, 380);
  const cap = buildCaption(S); if (cap) add(A, 'caption', cap);
  const disc = buildDisclaimer(S); if (disc) add(A, 'disclaimer', disc, 360, disc.height / 2);
  add(A, 'end_card_win', buildEndCard(S, false), 360, 640);
  add(A, 'end_card_fail', buildEndCard(S, true), 360, 640);
  add(A, 'end_hero', buildEndHero(), 165, 372);
  add(A, 'end_cta', buildEndCta(S, S.ctaText), 250, 58);
  add(A, 'end_glow', buildEscapeGlow(S), 220, 220);
  return A;
}

// ---------- 手图 ----------
export function handAsset(img, S) {
  if (!img) return null;
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  return { id: 'hand', c, w: c.width, h: c.height, ax: S.handAnchorX * c.width, ay: S.handAnchorY * c.height };
}

// ---------- 场景绘制 ----------
export function drawItems(g, items, k = 1) {
  g.setTransform(k, 0, 0, k, 0, 0);
  for (const it of items) {
    const a = it.a; if (!a || it.op <= 0) continue;
    g.save();
    g.translate(it.x, it.y);
    if (it.rot) g.rotate(it.rot);
    g.scale(it.sx || 1, it.sy || 1);
    g.globalAlpha = Math.max(0, Math.min(1, it.op == null ? 1 : it.op));
    g.drawImage(a.c, -a.ax, -a.ay, a.w, a.h);
    g.restore();
  }
  g.globalAlpha = 1;
  g.setTransform(1, 0, 0, 1, 0, 0);
}

export function makeSprite(A, id, asset, x, y, z, opt = {}) {
  return {
    id, asset, a: A[asset], x, y, z,
    sx: opt.sx == null ? 1 : opt.sx, sy: opt.sy == null ? 1 : opt.sy,
    rot: opt.rot || 0, op: opt.op == null ? 1 : opt.op,
  };
}
