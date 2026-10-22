// 巨石营救 · 关卡生成、托盘规则与求解器（纯逻辑，可在 Node 中测试）
// 棋盘是一张螺丝格架：节点 = 螺丝，相邻节点之间铺木板。木板不妨碍点击，只在两端螺丝都拆掉后坠落。
// 生成器始终保证每种颜色的数量是 3 的倍数，因此一定存在“按颜色分组、三颗一消”的合法通关序列。

export const DW = 720, DH = 1280;
// 参考视频使用粉/红/黄/绿/紫/蓝六色十字螺丝；前五色保持旧档配色不变，粉色为新增。
export const COLORS = ['red', 'blue', 'green', 'purple', 'yellow', 'pink'];
export const COLOR_HEX = { red: '#ef4b57', blue: '#3f8ee8', green: '#6fd33f', purple: '#a75de0', yellow: '#f2df38', pink: '#f04bd3' };
export const COLOR_DARK = { red: '#8f202b', blue: '#1d4f91', green: '#357a1c', purple: '#5a2a84', yellow: '#8f7f12', pink: '#8a1f78' };
export const COLOR_LIGHT = { red: '#ff9aa2', blue: '#9ac8ff', green: '#c8ffa3', purple: '#ddb4ff', yellow: '#fff8a8', pink: '#ffb0f0' };

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

export function fullMask(cols, rows) { return new Array(cols * rows).fill(true); }

// 把格子数修剪到 3 的倍数：从边缘、离中心最远的格子开始移除，尽量保持图形轮廓。
export function trimToTriples(mask, cols, rows) {
  const m = mask.slice();
  let count = m.filter(Boolean).length;
  const edgeCells = () => {
    const out = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c; if (!m[i]) continue;
      const edge = c === 0 || r === 0 || c === cols - 1 || r === rows - 1 ||
        !m[(r - 1) * cols + c] || !m[(r + 1) * cols + c] || !m[r * cols + c - 1] || !m[r * cols + c + 1];
      if (!edge) continue;
      const cx = (cols - 1) / 2, cy = (rows - 1) / 2;
      out.push({ i, d: Math.hypot(c - cx, r - cy) + (c === 0 || c === cols - 1 ? 0.25 : 0) + (r === 0 || r === rows - 1 ? 0.25 : 0) });
    }
    return out.sort((a, b) => b.d - a.d || a.i - b.i);
  };
  while (count % 3 !== 0 && count > 3) {
    const e = edgeCells();
    if (!e.length) break;
    m[e[0].i] = false; count--;
  }
  return m;
}

// 颜色数量分配：每种颜色至少一组三连；余下的三连按种子分配，保证总数恰好等于格子数。
export function colorCounts(n, colorCount, rng) {
  if (n % 3 !== 0) throw new Error('节点数必须是 3 的倍数');
  const triples = n / 3, k = Math.max(1, Math.min(colorCount, triples));
  const counts = new Array(k).fill(0);
  const base = Math.floor(triples / k);
  for (let i = 0; i < k; i++) counts[i] = base * 3;
  let left = triples - base * k;
  const order = shuffle([...Array(k).keys()], rng);
  for (let i = 0; left > 0; i = (i + 1) % k, left--) counts[order[i]] += 3;
  return counts;
}

// 从透明图片的 alpha 生成网格 mask（格内不透明像素占比 ≥ cover）。
export function maskFromAlpha(imageData, cols, rows, threshold = 0.5, cover = 0.5) {
  const { data, width, height } = imageData, mask = new Array(cols * rows).fill(false);
  const thr = threshold * 255;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x0 = Math.floor(c * width / cols), x1 = Math.max(x0 + 1, Math.floor((c + 1) * width / cols));
    const y0 = Math.floor(r * height / rows), y1 = Math.max(y0 + 1, Math.floor((r + 1) * height / rows));
    let hit = 0, total = 0;
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
      total++; if (data[(y * width + x) * 4 + 3] >= thr) hit++;
    }
    mask[r * cols + c] = total > 0 && hit / total >= cover;
  }
  return mask;
}

// 由 mask + 颜色数量构造关卡
export function makeLevel({ cols = 7, rows = 6, colorCount = 6, seed = 1, mask = null, fixedColors = null } = {}) {
  cols = Math.max(3, Math.min(10, cols | 0)); rows = Math.max(3, Math.min(10, rows | 0));
  let m = mask ? mask.slice() : fullMask(cols, rows);
  if (!m.some(Boolean)) m = fullMask(cols, rows);
  m = trimToTriples(m, cols, rows);
  const cells = [];
  for (let i = 0; i < m.length; i++) if (m[i]) cells.push(i);
  if (cells.length < 3) throw new Error('透明图形至少需要覆盖 3 个格子');
  const rng = mulberry32(seed >>> 0 || 1);
  let palette = COLORS.slice(0, Math.max(2, Math.min(6, colorCount)));
  let cols3;
  if (fixedColors && fixedColors.length === cells.length) {
    cols3 = fixedColors.slice();
  } else {
    const cc = colorCounts(cells.length, palette.length, rng);
    const bag = [];
    cc.forEach((n, i) => { for (let k = 0; k < n; k++) bag.push(palette[i]); });
    shuffle(bag, rng);
    cols3 = bag;
  }
  const nodes = cells.map((i, k) => ({ i, c: i % cols, r: Math.floor(i / cols), color: cols3[k] }));
  const nodeMap = new Map(nodes.map(n => [n.i, n]));
  const planks = [];
  for (const n of nodes) {
    const right = n.i + 1, down = n.i + cols;
    if (n.c + 1 < cols && nodeMap.has(right)) planks.push({ a: n.i, b: right, dir: 'h' });
    if (n.r + 1 < rows && nodeMap.has(down)) planks.push({ a: n.i, b: down, dir: 'v' });
  }
  const tally = {};
  for (const n of nodes) tally[n.color] = (tally[n.color] || 0) + 1;
  return { cols, rows, mask: m, cells, nodes, nodeMap, planks, colors: palette, tally, seed, triples: nodes.length / 3, total: nodes.length };
}

// 固定的“参考关卡”：7×6 = 42 颗螺丝，默认六色（9/9/6/6/6/6，每种都是 3 的倍数），和参考视频的密度与配色一致。
export function referenceLevel(colorCount = 6) {
  return makeLevel({ cols: 7, rows: 6, colorCount, seed: 20261018 });
}

// 参考视频第二幕：6 列 × 7 行，同样 42 颗螺丝，画面更窄更高。
export function referenceAcidLevel(colorCount = 6) {
  return makeLevel({ cols: 6, rows: 7, colorCount, seed: 20261019 });
}

export function randomLevel(seed, colorCount = 6, cols = 7, rows = 6) {
  return makeLevel({ cols, rows, colorCount, seed: seed >>> 0 });
}

export function imageLevel(imageData, { colorCount = 6, seed = 1, cols = 7, rows = 6, threshold = 0.5, cover = 0.5 } = {}) {
  const mask = maskFromAlpha(imageData, cols, rows, threshold, cover);
  if (mask.filter(Boolean).length < 3) throw new Error('透明图形覆盖的格子太少（至少 3 格）');
  return makeLevel({ cols, rows, colorCount, seed, mask });
}

export function initState(L, { timeLimit = 90, traySlots = 3 } = {}) {
  return {
    removed: new Set(), tray: [], planksDown: new Set(), picked: 0, cleared: 0,
    lost: false, won: false, started: false, timeLeft: timeLimit, traySlots,
    lastPick: -1, lastColor: null, overflow: false,
  };
}

export function countInTray(st, color) { return st.tray.filter(c => c === color).length; }
export function remainingOf(L, st, color) { return L.nodes.filter(n => n.color === color && !st.removed.has(n.i)).length; }
export function availableSlots(st) { return Math.max(0, st.traySlots - st.tray.length); }
export function canPick(L, st, i) {
  if (!L || !st || st.lost || st.won) return { ok: false, reason: st && (st.won ? 'won' : st.lost ? 'lost' : 'state') };
  const n = L.nodeMap.get(i);
  if (!n) return { ok: false, reason: 'empty' };
  if (st.removed.has(i)) return { ok: false, reason: 'removed' };
  if (availableSlots(st) <= 0) return { ok: false, reason: 'full' };
  return { ok: true, node: n };
}

// 点击一颗螺丝 → 入托盘；凑满 3 颗同色自动消除。托盘塞满异色为失败（failOnJam）。
export function pick(L, st, i, { failOnJam = true, matchBonus = 0, timeLimit = 90 } = {}) {
  const c = canPick(L, st, i);
  if (!c.ok) return { ok: false, reason: c.reason };
  const n = c.node;
  st.started = true;
  st.removed.add(i);
  const slot = st.tray.length;
  st.tray.push(n.color);
  st.picked++;
  st.lastPick = i; st.lastColor = n.color;
  let matched = false;
  if (countInTray(st, n.color) >= 3) {
    let need = 3;
    st.tray = st.tray.filter(x => { if (x === n.color && need > 0) { need--; return false; } return true; });
    st.cleared++;
    matched = true;
  }
  const released = [];
  for (let p = 0; p < L.planks.length; p++) {
    const q = L.planks[p];
    if (!st.planksDown.has(p) && st.removed.has(q.a) && st.removed.has(q.b)) { st.planksDown.add(p); released.push(p); }
  }
  let lost = false;
  if (!matched && st.tray.length >= st.traySlots) {
    st.overflow = true;
    if (failOnJam) { st.lost = true; lost = true; }
  }
  const won = st.removed.size >= L.nodes.length;
  if (won) st.won = true;
  if (matched && matchBonus) st.timeLeft += matchBonus;
  return { ok: true, node: n, matched, color: n.color, lost, won, released, slot };
}

// 求解器：每种颜色一次拿三颗，保证托盘里永远只有一种颜色。返回可直接执行的节点索引序列。
export function solvePlan(L, st) {
  if (!L || !st) return null;
  if (st.lost || st.won) return [];
  const slots = st.traySlots || 3;
  const trayColors = [...new Set(st.tray)];
  if (trayColors.length > 1) return null;
  const rem = new Map();
  for (const n of L.nodes) if (!st.removed.has(n.i)) {
    if (!rem.has(n.color)) rem.set(n.color, []);
    rem.get(n.color).push(n);
  }
  const plan = [];
  let trayColor = trayColors[0] || null;
  let trayCount = trayColor ? st.tray.length : 0;

  const chooseGroup = () => {
    const cs = [...rem.entries()].filter(([, a]) => a.length >= 3);
    if (!cs.length) return null;
    // 先清底部颜色：整片木板从下往上坠落，画面更像参考广告
    cs.sort((a, b) => {
      const ra = a[1].reduce((s, n) => s + n.r, 0) / a[1].length;
      const rb = b[1].reduce((s, n) => s + n.r, 0) / b[1].length;
      return rb - ra || b[1].length - a[1].length || String(a[0]).localeCompare(String(b[0]));
    });
    return cs[0][0];
  };
  const takeFrom = (color, count) => {
    const group = rem.get(color);
    if (!group || group.length < count) return false;
    // 同色里优先挑靠下、靠中间的螺丝
    group.sort((a, b) => b.r - a.r || (Math.abs(a.c - (L.cols - 1) / 2) - Math.abs(b.c - (L.cols - 1) / 2)) || a.i - b.i);
    for (let k = 0; k < count; k++) {
      const n = group.shift();
      plan.push(n.i);
      const at = rem.get(color).indexOf(n);
      if (at >= 0) rem.get(color).splice(at, 1);
    }
    return true;
  };

  let guard = 0;
  while ([...rem.values()].some(a => a.length)) {
    if (++guard > 1000) return null;
    if (!trayColor) {
      const color = chooseGroup();
      if (!color) return null;
      if (!takeFrom(color, 3)) return null;
      trayColor = null; trayCount = 0; // 三颗立即消除，托盘清空
    } else {
      const need = Math.max(1, 3 - trayCount);
      if (!takeFrom(trayColor, need)) return null;
      trayColor = null; trayCount = 0;
    }
  }
  // 用真实规则回放校验（必须从当前局面的托盘/已拆螺丝继续，否则带残槽的解法会误判）
  const sim = initState(L, { timeLimit: 1e9, traySlots: slots });
  sim.removed = new Set(st.removed);
  sim.tray = [...st.tray];
  sim.picked = st.picked;
  sim.cleared = st.cleared;
  sim.planksDown = new Set(st.planksDown);
  sim.started = st.started;
  sim.lastPick = st.lastPick;
  sim.lastColor = st.lastColor;
  for (const i of plan) {
    const r = pick(L, sim, i, { failOnJam: true, matchBonus: 0, timeLimit: 1e9 });
    if (!r.ok || r.lost) return null;
  }
  return sim.won ? plan : null;
}

export function solve(L, st) { return solvePlan(L, st); }

export function hintNode(L, st) {
  const p = solvePlan(L, st);
  return p && p.length ? p[0] : -1;
}

export function applyPlan(L, plan, opts) {
  const st = initState(L, opts);
  for (const i of plan) { const r = pick(L, st, i, opts); if (!r.ok || r.lost) return null; }
  return st.won ? st : null;
}

// 视觉用的螺丝/木板初始位置（节点中心与木板中心）。
export function plankCenter(L, p) {
  const A = L.nodeMap.get(p.a), B = L.nodeMap.get(p.b);
  return { x: (A.c + B.c) / 2, y: (A.r + B.r) / 2, dir: p.dir };
}
