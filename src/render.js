// 巨石营救 · 程序化美术与精灵绘制
// 所有画面元素都绘制成独立 canvas 精灵，由 main.js 组合成 scene 列表：同一份列表既用于屏幕绘制，
// 也用于 AE 时间轴逐元素记录与 3D 导出，保证三者结构一致。
import { COLOR_HEX, COLOR_DARK, COLOR_LIGHT } from './level.js';

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
function buildBackground(S, seed = 11) {
  return mk(DW, DH, (g) => {
    const R = rng(seed);
    const base = S.brickColor, dk = S.brickDark;
    const grd = g.createLinearGradient(0, 0, 0, DH);
    grd.addColorStop(0, dark(base, 0.5)); grd.addColorStop(0.45, dark(base, 0.22)); grd.addColorStop(1, dark(dk, 0.45));
    g.fillStyle = grd; g.fillRect(0, 0, DW, DH);
    drawBrickWall(g, -20, -20, DW + 40, DH + 40, base, dk, 21, { bh: 33, bw: 82, gap: 4 });
    // 两侧粗石壁柱
    for (const [x, w] of [[0, 42], [DW - 38, 42]]) {
      const pg = g.createLinearGradient(x, 0, x + w, 0);
      pg.addColorStop(0, dark(base, 0.5)); pg.addColorStop(.5, dark(base, 0.18)); pg.addColorStop(1, dark(dk, 0.55));
      g.fillStyle = pg; g.fillRect(x, 0, w, DH);
      for (let y = 20; y < DH; y += 58) {
        g.strokeStyle = rgba(dark(dk, .5), .6); g.lineWidth = 2; g.beginPath(); g.moveTo(x + 2, y); g.lineTo(x + w - 2, y); g.stroke();
      }
      g.strokeStyle = rgba(light(base, .2), .16); g.lineWidth = 3; g.beginPath(); g.moveTo(x + 5, 0); g.lineTo(x + 5, DH); g.stroke();
    }
    // 顶部横梁
    const beamY = 24, beamH = 60;
    drawWood(g, 26, beamY, DW - 76, beamH, S.woodColor, S.woodDark, 31);
    g.fillStyle = rgba('#000000', .28); g.fillRect(26, beamY + beamH - 6, DW - 76, 10);
    for (const bx of [62, 172, 548, 646]) {
      rr(g, bx - 9, beamY + 6, 18, beamH - 12, 5); g.fillStyle = dark(S.metalColor, .55); g.fill();
      g.strokeStyle = rgba('#000000', .4); g.lineWidth = 2; g.stroke();
      g.beginPath(); g.arc(bx, beamY + beamH / 2, 4, 0, TAU); g.fillStyle = rgba('#ffffff', .25); g.fill();
    }
    // 上方洞口与阴影
    const cave = g.createLinearGradient(0, 70, 0, 560);
    cave.addColorStop(0, 'rgba(9,6,10,.05)'); cave.addColorStop(.45, 'rgba(9,6,10,.28)'); cave.addColorStop(1, 'rgba(7,5,9,.62)');
    g.fillStyle = cave; g.fillRect(40, 78, DW - 80, 500);
    // 洞口拱形石框
    g.save();
    g.strokeStyle = rgba(dark(base, .6), .95); g.lineWidth = 24;
    g.beginPath(); g.moveTo(80, 585); g.lineTo(80, 260); g.quadraticCurveTo(80, 120, 260, 118); g.lineTo(560, 118); g.quadraticCurveTo(680, 120, 690, 250); g.stroke();
    g.strokeStyle = rgba(light(base, .12), .28); g.lineWidth = 4;
    g.beginPath(); g.moveTo(92, 560); g.lineTo(92, 265); g.quadraticCurveTo(94, 134, 260, 132); g.stroke();
    g.restore();
    // 左上方巨石堆
    drawBoulderPile(g, S, 71);
    // 矿洞深处大洞（棋盘后面）
    const hole = g.createRadialGradient(500, 860, 30, 480, 900, 440);
    hole.addColorStop(0, '#120b12'); hole.addColorStop(.7, '#09070b'); hole.addColorStop(1, '#150d14');
    g.fillStyle = hole; rr(g, 214, 552, 506, 728, 34); g.fill();
    // 洞内砖纹
    g.save(); rr(g, 220, 558, 494, 716, 30); g.clip(); drawBrickWall(g, 214, 552, 512, 728, dark(base, .35), '#120b12', 33, { bh: 28, bw: 64, gap: 6 }); g.globalAlpha = .6; g.fillStyle = '#0b070c'; g.fillRect(214, 552, 512, 728); g.restore();
    // 左侧竖链
    g.save(); g.strokeStyle = rgba(dark(S.metalColor, .35), .65); g.lineWidth = 4;
    for (let y = 96; y < 400; y += 22) { g.beginPath(); g.ellipse(30, y, 6, 11, 0, 0, TAU); g.stroke(); }
    for (let y = 120; y < 330; y += 26) { g.beginPath(); g.ellipse(694, y, 5, 10, 0, 0, TAU); g.stroke(); }
    g.restore();
    // 右上方光束
    const beam = g.createLinearGradient(640, 0, 320, 780);
    beam.addColorStop(0, 'rgba(140,255,220,.13)'); beam.addColorStop(.5, 'rgba(120,220,210,.03)'); beam.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = beam; g.beginPath(); g.moveTo(560, 106); g.lineTo(700, 106); g.lineTo(430, 760); g.lineTo(300, 760); g.closePath(); g.fill();
    // 青苔与污渍
    for (let i = 0; i < 26; i++) {
      const x = 40 + R() * 620, y = 300 + R() * 900, r = 5 + R() * 20;
      g.fillStyle = `rgba(${58 + R() * 40 | 0},${100 + R() * 50 | 0},${60 + R() * 30 | 0},${.05 + R() * .1})`;
      g.beginPath(); g.ellipse(x, y, r, r * .55, R() * 3, 0, TAU); g.fill();
    }
    // 整体光/暗角
    const topGlow = g.createLinearGradient(0, 0, 0, 420);
    topGlow.addColorStop(0, 'rgba(255,190,90,.06)'); topGlow.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = topGlow; g.fillRect(0, 0, DW, 420);
    // 噪点
    const n = Math.round(2600 * S.bgGrain);
    for (let i = 0; i < n; i++) {
      const a = R() * .06;
      g.fillStyle = R() < .5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
      g.fillRect(R() * DW, R() * DH, 1 + (R() < .15 ? 1 : 0), 1);
    }
    const vg = g.createRadialGradient(DW / 2, DH * .44, DH * .2, DW / 2, DH * .5, DH * .72);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${.62 * S.vignette})`);
    g.fillStyle = vg; g.fillRect(0, 0, DW, DH);
  });
}

// ---------- 棋盘底板 ----------
function buildBoard(S, L, seed = 51) {
  const B = boardGeom(L);
  return mk(B.w, B.h, (g, W, H) => {
    const R = rng(seed);
    const ox = B.left, oy = B.top;
    // 外框：暖砖 + 圆角石座
    g.fillStyle = 'rgba(0,0,0,.5)'; rr(g, 4, 12, W - 4, H - 6, 36); g.fill();
    const frame = g.createLinearGradient(0, 0, W, H);
    frame.addColorStop(0, light(S.brickColor, .1)); frame.addColorStop(.45, S.brickColor); frame.addColorStop(1, dark(S.brickDark, .2));
    rr(g, 0, 0, W, H, 34); fillStroke(g, frame, dark(S.brickDark, .55), 5);
    g.save(); rr(g, 2, 2, W - 4, H - 4, 32); g.clip();
    drawBrickWall(g, 0, 0, W, H, S.brickColor, S.brickDark, 53, { bh: 31, bw: 72, gap: 5 });
    g.fillStyle = 'rgba(12,6,10,.48)'; g.fillRect(0, 0, W, H);
    g.restore();
    // 内腔：深蓝碎石堆（参考视频最醒目的底层质感）
    rr(g, 15, 15, W - 30, H - 30, 26); g.fillStyle = '#0a1016'; g.fill();
    g.save(); rr(g, 16, 16, W - 32, H - 32, 25); g.clip();
    const backs = g.createLinearGradient(0, 0, 0, H);
    backs.addColorStop(0, '#0d1a22'); backs.addColorStop(.4, '#0a151c'); backs.addColorStop(1, '#060b10');
    g.fillStyle = backs; g.fillRect(0, 0, W, H);
    // 三层碎石：暗 → 中 → 亮，营造密集矿堆
    for (let layer = 0; layer < 3; layer++) {
      const count = layer === 0 ? 130 : layer === 1 ? 105 : 70;
      for (let i = 0; i < count; i++) {
        const x = -14 + R() * (W + 28), y = -10 + R() * (H + 20);
        const r = (layer === 0 ? 20 : layer === 1 ? 15 : 10) + R() * (layer === 0 ? 26 : layer === 1 ? 18 : 12);
        const col = layer === 0 ? dark(S.rockColor, .32) : layer === 1 ? S.rockColor : (R() < .55 ? S.rockLight : mix(S.rockColor, S.rockLight, .55));
        drawRock(g, x, y, r, col, 3000 + layer * 977 + i * 13);
      }
    }
    // 压暗四周，中心略亮
    const shade = g.createRadialGradient(W * .5, H * .45, 40, W * .5, H * .55, W * .78);
    shade.addColorStop(0, 'rgba(5,10,14,.06)'); shade.addColorStop(.62, 'rgba(4,7,10,.38)'); shade.addColorStop(1, 'rgba(3,5,8,.86)');
    g.fillStyle = shade; g.fillRect(0, 0, W, H);
    // 冷色矿光
    const glow = g.createRadialGradient(W * .42, H * .42, 10, W * .42, H * .5, W * .62);
    glow.addColorStop(0, 'rgba(95,190,195,.15)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = glow; g.fillRect(0, 0, W, H);
    g.restore();
    // 内框压边
    rr(g, 15, 15, W - 30, H - 30, 26); g.strokeStyle = rgba(dark(S.brickDark, .7), .95); g.lineWidth = 7; g.stroke();
    rr(g, 23, 23, W - 46, H - 46, 20); g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 3; g.stroke();
    rr(g, 6, 6, W - 12, H - 12, 30); g.strokeStyle = rgba(light(S.brickColor, .26), .32); g.lineWidth = 3; g.stroke();

    // 每个节点的木孔（螺丝拔出后露出的洞）
    for (const n of L.nodes) {
      const p = B.node(n.c, n.r), x = p.x - ox, y = p.y - oy;
      g.beginPath(); g.arc(x, y + 3, 27, 0, TAU); g.fillStyle = 'rgba(0,0,0,.5)'; g.fill();
      const hole = g.createRadialGradient(x - 6, y - 6, 3, x, y, 26);
      hole.addColorStop(0, '#090407'); hole.addColorStop(.6, '#150c10'); hole.addColorStop(1, '#33211d');
      g.beginPath(); g.arc(x, y, 23, 0, TAU); g.fillStyle = hole; g.fill();
      g.strokeStyle = 'rgba(14,8,7,.9)'; g.lineWidth = 3; g.stroke();
      g.strokeStyle = 'rgba(215,166,110,.22)'; g.lineWidth = 1.6; g.beginPath(); g.arc(x - 1, y - 1, 20, Math.PI * 1.05, Math.PI * 1.72); g.stroke();
    }
    // 底部危险条纹 + 铭牌
    g.save(); g.beginPath(); g.rect(38, H - 48, W - 76, 18); g.clip();
    for (let x = -20; x < W; x += 24) { g.fillStyle = x % 48 ? rgba(S.glowColor, .38) : 'rgba(0,0,0,.55)'; g.save(); g.translate(x, H - 48); g.rotate(-.55); g.fillRect(0, -12, 12, 46); g.restore(); }
    g.restore();
    rr(g, W / 2 - 62, H - 42, 124, 20, 9); g.fillStyle = dark(S.metalColor, .62); g.fill(); g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = rgba(light(S.metalColor, .5), .45); g.font = '700 10px "PingFang SC","Microsoft YaHei",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('B O U L D E R   R E S C U E', W / 2, H - 32);
    // 左上角巨石压境的阴影
    const sh = g.createLinearGradient(0, 0, 100, 280);
    sh.addColorStop(0, 'rgba(0,0,0,.55)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh; g.fillRect(0, 0, 150, 320);
  });
}

// ---------- 木板 ----------
function buildPlank(S, B, dir, variant = 0) {
  const pw = Math.round(S.plankW);
  if (dir === 'h') {
    const L2 = Math.round(B.dx + 18);
    return mk(L2 + 14, pw + 18, (g, W, H) => {
      g.fillStyle = 'rgba(0,0,0,.35)'; rr(g, 7, 11, W - 14, H - 14, 7); g.fill();
      drawWood(g, 7, 7, W - 14, pw, S.woodColor, S.woodDark, 600 + variant * 7, false);
      const y = 7 + pw / 2;
      for (const x of [16, W - 16]) {
        g.beginPath(); g.arc(x, y, 4.4, 0, TAU); g.fillStyle = 'rgba(18,10,7,.8)'; g.fill();
        g.beginPath(); g.arc(x - 1, y - 1, 2.6, 0, TAU); g.fillStyle = rgba(S.metalColor, .4); g.fill();
      }
    });
  }
  const L2 = Math.round(B.dy + 18);
  return mk(pw + 18, L2 + 14, (g, W, H) => {
    g.fillStyle = 'rgba(0,0,0,.35)'; rr(g, 9, 7, W - 14, H - 14, 7); g.fill();
    drawWood(g, 7, 7, pw, H - 14, S.woodColor, S.woodDark, 620 + variant * 7, true);
    const x = 7 + pw / 2;
    for (const y of [16, H - 16]) {
      g.beginPath(); g.arc(x, y, 4.4, 0, TAU); g.fillStyle = 'rgba(18,10,7,.8)'; g.fill();
      g.beginPath(); g.arc(x - 1, y - 1, 2.6, 0, TAU); g.fillStyle = rgba(S.metalColor, .4); g.fill();
    }
  });
}

// ---------- 螺丝 ----------
// 参考视频中的螺丝是「深色木孔 + 彩色十字凸台」：外圈是坑洞，中心是被拧亮的十字螺栓。
function buildScrew(color) {
  const base = COLOR_HEX[color], dk = COLOR_DARK[color], lt = COLOR_LIGHT[color];
  return mk(74, 74, (g, W, H) => {
    const cx = W / 2, cy = H / 2;
    // 木孔投影
    g.fillStyle = 'rgba(0,0,0,.45)'; g.beginPath(); g.ellipse(cx + 3, cy + 4, 30, 27, 0, 0, TAU); g.fill();
    // 深色凹槽
    const hole = g.createRadialGradient(cx - 8, cy - 9, 3, cx, cy, 30);
    hole.addColorStop(0, '#1a1014'); hole.addColorStop(.62, '#120a0e'); hole.addColorStop(1, '#3a2620');
    g.beginPath(); g.arc(cx, cy, 28.5, 0, TAU); g.fillStyle = hole; g.fill();
    g.strokeStyle = 'rgba(18,10,8,.95)'; g.lineWidth = 3; g.stroke();
    g.strokeStyle = 'rgba(210,156,96,.24)'; g.lineWidth = 2;
    g.beginPath(); g.arc(cx, cy, 25.5, Math.PI * 1.02, Math.PI * 1.7); g.stroke();
    g.beginPath(); g.arc(cx, cy, 25.5, Math.PI * 1.88, Math.PI * 2.22); g.stroke();

    g.save(); g.translate(cx, cy); g.rotate(-0.16);
    const arm = 26, wid = 14;
    const plus = (x, y, w, r) => {
      rr(g, -w / 2 + x, -arm + y, w, arm * 2, r); g.fill();
      rr(g, -arm + x, -w / 2 + y, arm * 2, w, r); g.fill();
    };
    // 深色描边层（稍大），再叠彩色主体，得到干净的十字轮廓
    g.fillStyle = dark(dk, .6);
    plus(2.6, 3.4, wid + 4, 8);
    plus(0, 0, wid + 4, 8);
    // 凸台侧壁
    g.fillStyle = dark(dk, .22);
    plus(2.2, 3, wid, 7);
    // 十字主体
    const face = g.createLinearGradient(-arm, -arm, arm, arm);
    face.addColorStop(0, light(base, .42)); face.addColorStop(.3, light(base, .1));
    face.addColorStop(.64, base); face.addColorStop(1, dark(base, .16));
    g.fillStyle = face;
    plus(0, 0, wid, 7);
    // 左上倒角高光
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(-arm + 7, -wid / 2 + 2); g.lineTo(-wid / 2 + 2, -wid / 2 + 2); g.lineTo(-wid / 2 + 2, -arm + 7); g.stroke();
    g.beginPath(); g.moveTo(wid / 2 - 1, -arm + 7); g.lineTo(wid / 2 - 1, -wid / 2 + 1); g.stroke();
    // 右下暗边
    g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(-wid / 2 + 2, arm - 6); g.lineTo(-wid / 2 + 2, wid / 2 + 1); g.lineTo(arm - 6, wid / 2 + 1); g.stroke();
    // 中心内六角
    g.beginPath(); g.arc(0, 0, 6, 0, TAU); g.fillStyle = dark(dk, .62); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 1.6; g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 1.6; g.beginPath(); g.arc(-1, -1, 5, Math.PI, TAU * .92); g.stroke();
    // 金属擦痕
    g.strokeStyle = 'rgba(255,255,255,.2)'; g.lineWidth = 1.1;
    for (let i = 0; i < 2; i++) { g.beginPath(); g.moveTo(-18 + i * 7, -19 + i * 2); g.lineTo(-9 + i * 6, -21 + i * 2); g.stroke(); }
    g.restore();

    const glow = g.createRadialGradient(cx, cy, 18, cx, cy, 38);
    glow.addColorStop(0, rgba(base, .14)); glow.addColorStop(.7, rgba(base, .04)); glow.addColorStop(1, rgba(base, 0));
    g.fillStyle = glow; g.beginPath(); g.arc(cx, cy, 38, 0, TAU); g.fill();
  });
}

// ---------- 托盘底座（嵌进砖台的粉色霓虹台） ----------
function buildTrayMount(S) {
  return mk(402, 178, (g, W, H) => {
    const R = rng(188);
    g.fillStyle = 'rgba(0,0,0,.5)'; rr(g, 6, 20, W - 8, H - 18, 26); g.fill();
    // 砖台
    g.save(); rr(g, 2, 4, W - 4, H - 30, 24); g.clip();
    drawBrickWall(g, -6, 0, W + 12, H, S.brickColor, S.brickDark, 121, { bh: 27, bw: 74, gap: 5 });
    g.fillStyle = 'rgba(12,7,10,.35)'; g.fillRect(0, 0, W, H);
    const sh = g.createLinearGradient(0, 0, 0, H);
    sh.addColorStop(0, 'rgba(255,220,190,.16)'); sh.addColorStop(.28, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.55)');
    g.fillStyle = sh; g.fillRect(0, 0, W, H);
    g.restore();
    rr(g, 2, 4, W - 4, H - 30, 24); g.strokeStyle = rgba(dark(S.brickDark, .55), .95); g.lineWidth = 4; g.stroke();
    rr(g, 8, 10, W - 16, H - 42, 19); g.strokeStyle = 'rgba(0,0,0,.42)'; g.lineWidth = 3; g.stroke();
    // 粉色霓虹嵌框
    const neon = g.createLinearGradient(0, 14, 0, H - 34);
    neon.addColorStop(0, light(S.trayColor, .45)); neon.addColorStop(.45, S.trayColor); neon.addColorStop(1, dark(S.trayColor, .35));
    rr(g, 22, 26, W - 44, H - 78, 15); g.fillStyle = rgba(dark(S.brickDark, .78), 1); g.fill();
    rr(g, 22, 26, W - 44, H - 78, 15); g.strokeStyle = neon; g.lineWidth = 7; g.stroke();
    rr(g, 30, 34, W - 60, H - 94, 11); g.strokeStyle = rgba(light(S.trayColor, .35), .5); g.lineWidth = 2; g.stroke();
    // 两侧铆钉
    for (const [x, y] of [[14, 22], [W - 14, 22], [14, H - 20], [W - 14, H - 20]]) {
      g.beginPath(); g.arc(x, y, 6, 0, TAU); g.fillStyle = dark(S.metalColor, .5); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 1.5; g.stroke();
      g.beginPath(); g.arc(x - 1.5, y - 1.5, 2.2, 0, TAU); g.fillStyle = rgba('#fff', .4); g.fill();
    }
  });
}

// ---------- 托盘 ----------
function buildTray(S) {
  const T = trayGeom(S);
  return mk(T.w, T.h, (g, W, H) => {
    g.fillStyle = 'rgba(0,0,0,.45)'; rr(g, 8, 16, W - 12, H - 10, 24); g.fill();
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, light(S.trayColor, .35)); grd.addColorStop(.22, S.trayColor); grd.addColorStop(.78, dark(S.trayColor, .18)); grd.addColorStop(1, dark(S.trayColor, .42));
    rr(g, 4, 4, W - 8, H - 8, 22); fillStroke(g, grd, dark(S.trayColor, .55), 4);
    // 内嵌深色槽板
    const inner = g.createLinearGradient(0, 20, 0, H - 14);
    inner.addColorStop(0, dark(S.trayColor, .62)); inner.addColorStop(1, dark(S.trayColor, .78));
    rr(g, 22, 22, W - 44, H - 38, 16); fillStroke(g, inner, dark(S.trayColor, .6), 3);
    // 槽位
    for (const sx of T.slots) {
      const cx = W / 2 + sx, cy = H / 2 + 3;
      const hole = g.createRadialGradient(cx - 6, cy - 6, 3, cx, cy, 34);
      hole.addColorStop(0, '#2a1420'); hole.addColorStop(.7, '#170b12'); hole.addColorStop(1, '#3b1b2b');
      g.beginPath(); g.arc(cx, cy, 31, 0, TAU); g.fillStyle = hole; g.fill();
      g.strokeStyle = rgba(S.trayColor, .85); g.lineWidth = 4; g.stroke();
      g.strokeStyle = rgba(light(S.trayColor, .5), .5); g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, 35, Math.PI * 1.04, Math.PI * 1.6); g.stroke();
    }
    // 顶部高光与铆钉
    g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(28, 13); g.lineTo(W - 26, 13); g.stroke();
    for (const x of [15, W - 15]) for (const y of [18, H - 16]) {
      g.beginPath(); g.arc(x, y, 5, 0, TAU); g.fillStyle = dark(S.trayColor, .55); g.fill();
      g.beginPath(); g.arc(x - 1, y - 1, 2, 0, TAU); g.fillStyle = rgba('#fff', .45); g.fill();
    }
    // 底部小灯条
    g.fillStyle = rgba(S.glowColor, .25); rr(g, W / 2 - 60, H - 13, 120, 4, 2); g.fill();
    g.fillStyle = rgba(light(S.trayColor, .6), .5); g.font = '700 10px "PingFang SC",sans-serif'; g.textAlign = 'center'; g.fillText('S C R E W   S O R T E R', W / 2, H - 18);
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
    grd.addColorStop(0, 'rgba(140,245,80,.15)'); grd.addColorStop(.18, rgba(S.acidColor, .8)); grd.addColorStop(.5, dark(S.acidColor, .22)); grd.addColorStop(1, dark(S.acidColor, .65));
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
  const skin = '#f0bd93', ink = '#3b241c';
  // 头
  g.beginPath(); g.ellipse(0, 0, 35, 36, -.03, 0, TAU); g.fillStyle = skin; g.fill();
  g.strokeStyle = ink; g.lineWidth = 3.4; g.stroke();
  // 耳朵
  g.beginPath(); g.ellipse(-34, 4, 7, 9, 0, 0, TAU); g.fillStyle = skin; g.fill(); g.stroke();
  g.beginPath(); g.arc(-34, 4, 3, 0, TAU); g.fillStyle = '#d79572'; g.fill();
  // 头发
  g.fillStyle = '#c76b2e';
  for (const [x, y, r] of [[-26, -27, 12], [-8, -34, 13], [12, -32, 12], [27, -22, 9]]) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  g.strokeStyle = rgba(ink, .8); g.lineWidth = 2; g.stroke();
  // 帽子
  g.save(); g.rotate(-.08);
  const cap = g.createLinearGradient(-10, -52, 10, -20);
  cap.addColorStop(0, '#fff4d9'); cap.addColorStop(.6, '#efe0bd'); cap.addColorStop(1, '#cfbc98');
  g.beginPath(); g.ellipse(0, -33, 30, 20, 0, Math.PI, TAU); g.quadraticCurveTo(30, -15, 0, -15); g.quadraticCurveTo(-30, -15, -30, -33); g.closePath(); g.fillStyle = cap; g.fill(); g.strokeStyle = ink; g.lineWidth = 3; g.stroke();
  g.beginPath(); g.ellipse(-30, -28, 20, 7, -.25, Math.PI * .92, Math.PI * 1.95); g.fillStyle = '#f7e9c9'; g.fill(); g.strokeStyle = ink; g.lineWidth = 2.6; g.stroke();
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
  g.fillStyle = '#e0a77e'; g.fillRect(-11, 27, 22, 12); g.strokeStyle = ink; g.lineWidth = 2.5; g.strokeRect(-11, 27, 22, 12);
}
function buildHead(mode) {
  return mk(132, 132, (g) => { g.translate(66, 66); drawFace(g, mode); });
}
function buildBody() {
  return mk(138, 154, (g, W, H) => {
    const ink = '#3b241c', skin = '#eab086';
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
    // 肚脐
    g.beginPath(); g.ellipse(1, -45, 2.2, 3, 0, 0, TAU); g.fillStyle = 'rgba(120,60,40,.6)'; g.fill();
    // 平台阴影接触
    g.beginPath(); g.ellipse(0, 8, 32, 6, 0, 0, TAU); g.fillStyle = 'rgba(0,0,0,.25)'; g.fill();
  });
}
function buildArm(kind = 'front') {
  return mk(118, 56, (g, W, H) => {
    const ink = '#3b241c', skin = kind === 'front' ? '#ecb389' : '#d99a70';
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
    // 手腕绳
    g.strokeStyle = '#c9a458'; g.lineWidth = 4; g.beginPath(); g.moveTo(-70, -12); g.quadraticCurveTo(-66, 0, -70, 12); g.stroke();
    // 上臂阴影
    g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.ellipse(-25, -7, 18, 4, -.1, 0, TAU); g.fill();
  });
}
function buildLeg(kind = 'front') {
  return mk(62, 92, (g, W, H) => {
    const ink = '#3b241c', skin = kind === 'front' ? '#eab086' : '#d0956d';
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
  const col = phase === 'g' ? '#54e06a' : phase === 'y' ? '#ffd447' : '#ff4d5a';
  return mk(124, 124, (g, W, H) => {
    const cx = W / 2, cy = H / 2;
    g.fillStyle = 'rgba(0,0,0,.38)'; g.beginPath(); g.arc(cx + 2, cy + 4, 54, 0, TAU); g.fill();
    const rim = g.createLinearGradient(0, 0, 0, H);
    rim.addColorStop(0, '#4b4b58'); rim.addColorStop(.5, '#22222b'); rim.addColorStop(1, '#111116');
    g.beginPath(); g.arc(cx, cy, 53, 0, TAU); g.fillStyle = rim; g.fill(); g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 4; g.stroke();
    g.beginPath(); g.arc(cx, cy, 46, 0, TAU); g.strokeStyle = dark(col, .15); g.lineWidth = 6; g.stroke();
    const glow = g.createRadialGradient(cx, cy, 20, cx, cy, 48);
    glow.addColorStop(0, rgba(col, .05)); glow.addColorStop(.75, rgba(col, .24)); glow.addColorStop(1, rgba(col, 0));
    g.fillStyle = glow; g.beginPath(); g.arc(cx, cy, 48, 0, TAU); g.fill();
    g.beginPath(); g.arc(cx, cy, 44, 0, TAU); g.strokeStyle = rgba(col, .9); g.lineWidth = 3; g.stroke();
    // 刻度
    for (let i = 0; i < 20; i++) {
      const a = i / 20 * TAU, r1 = 48.5, r2 = i % 5 === 0 ? 54 : 51.5;
      g.strokeStyle = i % 5 === 0 ? rgba(col, .9) : 'rgba(255,255,255,.22)'; g.lineWidth = i % 5 === 0 ? 2.4 : 1.2;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); g.stroke();
    }
    g.beginPath(); g.arc(cx, cy, 35, 0, TAU); g.fillStyle = 'rgba(10,8,12,.62)'; g.fill();
    // 小时漏标志
    g.fillStyle = rgba(col, .35); g.font = '700 9px "PingFang SC",sans-serif'; g.textAlign = 'center'; g.fillText('T I M E', cx, cy + 30);
  });
}
function buildTimerMarker(S) {
  return mk(28, 28, (g, W, H) => {
    const grd = g.createRadialGradient(W / 2, H / 2, 1, W / 2, H / 2, 14);
    grd.addColorStop(0, '#fff'); grd.addColorStop(.3, S.glowColor); grd.addColorStop(1, rgba(S.glowColor, 0));
    g.fillStyle = grd; g.beginPath(); g.arc(W / 2, H / 2, 14, 0, TAU); g.fill();
  });
}
function buildDigit(n, S) {
  return mk(48, 76, (g, W, H) => {
    g.font = '900 66px "Arial Black","PingFang SC","Microsoft YaHei",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 9; g.strokeStyle = 'rgba(8,6,10,.95)'; g.strokeText(String(n), W / 2, H / 2 + 3);
    g.lineWidth = 4; g.strokeStyle = dark(S.glowColor, .35); g.strokeText(String(n), W / 2, H / 2 + 2);
    g.fillStyle = '#fff8e3'; g.fillText(String(n), W / 2, H / 2);
    g.fillStyle = 'rgba(255,255,255,.4)'; g.fillText(String(n), W / 2, H / 2 - 2);
  });
}
function buildCaption(S) {
  if (!S.captionShow || !S.captionText) return null;
  return mk(640, 92, (g, W, H) => {
    g.font = '900 46px "PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif';
    g.textBaseline = 'middle'; g.textAlign = 'center';
    g.save(); g.translate(W / 2, H / 2); g.rotate(-.012);
    g.lineWidth = 13; g.strokeStyle = 'rgba(32,17,24,.95)'; drawSpaced(g, S.captionText, 0, 4, 2);
    g.lineWidth = 6; g.strokeStyle = 'rgba(72,38,28,.9)'; drawSpaced(g, S.captionText, 0, 3, 2);
    const grd = g.createLinearGradient(0, -30, 0, 32);
    grd.addColorStop(0, '#fffdf2'); grd.addColorStop(.55, '#ffe6a1'); grd.addColorStop(1, '#f6b948');
    g.fillStyle = grd; drawSpaced(g, S.captionText, 0, 0, 2);
    g.strokeStyle = 'rgba(120,70,20,.35)'; g.lineWidth = 1.5; g.strokeText(S.captionText, 0, 0);
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

// ---------- 结束页 ----------
function buildEndCard(S, fail = false) {
  return mk(DW, DH, (g, W, H) => {
    const R = rng(1234);
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0c2b31'); bg.addColorStop(.45, '#102126'); bg.addColorStop(1, '#071012');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // 放射光
    g.save(); g.translate(W / 2, 500);
    for (let i = 0; i < 22; i++) {
      const a = i / 22 * TAU; g.fillStyle = rgba(fail ? '#ff5a50' : S.glowColor, .025 + (i % 2) * .02);
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 900, a, a + .11); g.closePath(); g.fill();
    }
    g.restore();
    const glow = g.createRadialGradient(W / 2, 560, 20, W / 2, 560, 480);
    glow.addColorStop(0, fail ? 'rgba(255,70,60,.24)' : rgba(S.glowColor, .2)); glow.addColorStop(.55, rgba(S.glowColor, .04)); glow.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = glow; g.fillRect(0, 0, W, H);
    // 底部的巨石与螺丝
    for (let i = 0; i < 20; i++) {
      const x = R() * W, y = 1030 + R() * 250, r = 30 + R() * 60;
      drawRock(g, x, y, r, i % 3 ? dark(S.rockColor, .4) : dark(S.rockColor, .6), 500 + i * 17);
    }
    for (let i = 0; i < 10; i++) {
      const x = 60 + R() * 600, y = 980 + R() * 240, r = 18 + R() * 22;
      g.save(); g.translate(x, y); g.rotate(R() * TAU); g.globalAlpha = .65;
      const cols = ['red', 'blue', 'green', 'purple', 'yellow']; const col = COLOR_HEX[cols[i % 5]];
      const rim = g.createRadialGradient(-5, -5, 2, 0, 0, r);
      rim.addColorStop(0, light(col, .5)); rim.addColorStop(.7, col); rim.addColorStop(1, dark(col, .4));
      g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fillStyle = rim; g.fill(); g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 2; g.stroke();
      g.strokeStyle = 'rgba(20,10,15,.6)'; g.lineWidth = 3; g.beginPath(); g.moveTo(-r * .5, 0); g.lineTo(r * .5, 0); g.moveTo(0, -r * .5); g.lineTo(0, r * .5); g.stroke();
      g.restore();
    }
    // 边框
    g.strokeStyle = rgba(S.glowColor, .35); g.lineWidth = 4; rr(g, 14, 14, W - 28, H - 28, 30); g.stroke();
    rr(g, 24, 24, W - 48, H - 48, 24); g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 2; g.stroke();
    // 顶部小徽章
    g.fillStyle = rgba(S.glowColor, .16); rr(g, W / 2 - 108, 62, 216, 34, 17); g.fill();
    g.strokeStyle = rgba(S.glowColor, .5); g.lineWidth = 1.5; g.stroke();
    g.fillStyle = rgba(light(S.glowColor, .5), .9); g.font = '700 13px "PingFang SC","Microsoft YaHei",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('B O U L D E R   R E S C U E', W / 2, 80);
    // 标题
    g.font = '900 74px "PingFang SC","Microsoft YaHei",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 14; g.strokeStyle = 'rgba(0,0,0,.6)'; drawSpaced(g, '巨石营救', W / 2, 160, 6);
    const title = g.createLinearGradient(0, 120, 0, 205);
    title.addColorStop(0, '#fff9d8'); title.addColorStop(.45, '#ffe27a'); title.addColorStop(1, '#e29a24');
    g.fillStyle = title; drawSpaced(g, '巨石营救', W / 2, 160, 6);
    g.font = '700 28px "PingFang SC","Microsoft YaHei",sans-serif'; g.fillStyle = 'rgba(255,255,255,.9)';
    g.fillText(fail ? '被埋住了！' : S.endTitle, W / 2, 224, W - 80);
    g.font = '400 18px "PingFang SC","Microsoft YaHei",sans-serif'; g.fillStyle = 'rgba(220,235,230,.62)';
    g.fillText(fail ? '托盘别塞满异色螺丝 · 再来一次' : S.endSub, W / 2, 260, W - 90);
    // 中央信息板底部
    g.fillStyle = 'rgba(5,12,13,.5)'; rr(g, 54, 868, W - 108, 218, 26); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.1)'; g.lineWidth = 2; g.stroke();
    g.font = '700 18px "PingFang SC","Microsoft YaHei",sans-serif'; g.fillStyle = 'rgba(255,255,255,.8)';
    g.fillText(fail ? '差一点就成功了' : '拆光螺丝 · 三消同色 · 带他回家', W / 2, 916);
    // 三个卖点
    const badges = fail ? ['三消同色', '别塞满托盘', '再来一次'] : ['42 颗螺丝', '14 组三消', '一座矿坑'];
    badges.forEach((t, i) => {
      const x = 166 + i * 194;
      g.fillStyle = rgba(S.glowColor, .1); rr(g, x - 82, 946, 164, 42, 21); g.fill();
      g.strokeStyle = rgba(S.glowColor, .25); g.lineWidth = 1.5; g.stroke();
      g.fillStyle = 'rgba(255,248,220,.9)'; g.font = '700 17px "PingFang SC",sans-serif'; g.fillText(t, x, 967);
    });
    // 免责声明
    g.font = '400 13px "PingFang SC",sans-serif'; g.fillStyle = 'rgba(255,255,255,.32)';
    g.fillText('广告创意演示 · 实际玩法与奖励以游戏内为准', W / 2, 1220);
    // 暗角
    const vg = g.createRadialGradient(W / 2, H * .42, 200, W / 2, H * .5, H * .7);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.5)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
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
  const A = {};
  const B = boardGeom(L);
  add(A, 'background', buildBackground(S), 360, 640);
  add(A, 'acid', buildAcid(S), 122, 620);
  add(A, 'bubble', buildBubble(S), 25, 25);
  add(A, 'board', buildBoard(S, L), B.w / 2, B.h / 2);
  add(A, 'slab', buildSlab(S));
  add(A, 'platform', buildPlatform(S), LAYOUT.platform.w / 2, LAYOUT.platform.h / 2);
  add(A, 'tray', buildTray(S), LAYOUT.tray.w / 2, LAYOUT.tray.h / 2);
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
  add(A, 'hero_body', buildBody(), 69, 138);
  add(A, 'hero_arm_l', buildArm('back'), 106, 28);
  add(A, 'hero_arm_r', buildArm('front'), 106, 28);
  add(A, 'hero_leg_l', buildLeg('back'), 31, 8);
  add(A, 'hero_leg_r', buildLeg('front'), 31, 8);
  add(A, 'hero_shadow', mk(150, 38, (g, W, H) => { const grd = g.createRadialGradient(W / 2, H / 2, 2, W / 2, H / 2, 70); grd.addColorStop(0, 'rgba(0,0,0,.42)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.beginPath(); g.ellipse(W / 2, H / 2, 70, 18, 0, 0, TAU); g.fill(); }), 75, 19);
  add(A, 'timer_ring_g', buildTimerRing(S, 'g')); add(A, 'timer_ring_y', buildTimerRing(S, 'y')); add(A, 'timer_ring_r', buildTimerRing(S, 'r'));
  add(A, 'timer_marker', buildTimerMarker(S));
  for (let n = 0; n <= 9; n++) add(A, 'digit_' + n, buildDigit(n, S));
  add(A, 'hint_ring', buildHintRing(S));
  add(A, 'match_ring', buildMatchRing(S));
  add(A, 'plus_time', buildPlusTime(S));
  add(A, 'spark', buildSpark(S, true));
  add(A, 'spark_white', buildSpark(S, false));
  add(A, 'chip0', buildChip(S, true)); add(A, 'chip1', buildChip(S, false));
  add(A, 'dust', buildDust());
  add(A, 'flash_fail', buildFlash('#ff2f3a', 1));
  add(A, 'flash_win', buildFlash('#ffd75a', .72));
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
