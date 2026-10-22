// 巨石营救 · After Effects 精灵时间轴记录器
// 网页每帧绘制的就是 scene 列表（素材 + 中心位置/缩放/旋转/不透明度/层级）。
// 这里逐帧采样；导出时每个元素（id + 素材）的每段连续出现 = 一个独立图层。
import { makeZip } from './zip.js';
import JSX_TEXT from './build_ae_project.jsx';
import README_TEXT from './README_AE.md';
import { renderSfxOffline, encodeWav, SFX_NAMES, SFX_DUR } from '../audio.js';
const r3 = v => Math.round(v * 1000) / 1000;
const LABEL = { bg: 15, board: 14, screw: 9, plank: 10, hero: 11, scene: 12, ui: 15, fx: 5, end: 5, hand: 12, audio: 16 };
const TOOL_ID = 'boulder-rescue-tool';

const NAMES = {
  background: ['背景', 'Background'], acid: ['酸液', 'Acid'], bubble: ['气泡', 'Bubble'],
  board: ['棋盘', 'Board'], slab: ['悬石', 'Slab'], platform: ['平台', 'Platform'],
  tray: ['托盘', 'Tray'], pulley: ['滑轮', 'Pulley'], weight: ['配重', 'Counterweight'],
  rope: ['绳索', 'Rope'], plank: ['木板', 'Plank'], screw: ['螺丝', 'Screw'],
  hero: ['矿工', 'Miner'], timer: ['计时', 'Timer'], caption: ['字幕', 'Caption'],
  disclaimer: ['免责声明', 'Disclaimer'], hint: ['提示光环', 'Hint'], match: ['三消光环', 'Match ring'],
  plus: ['加时', 'Bonus'], fx: ['粒子', 'FX'], end: ['结束页', 'End card'], hand: ['手指', 'Hand'],
};
function splitId(id) {
  const m = /^([a-z]+)_?(.*)$/.exec(id) || [id, id, ''];
  return { k: m[1], rest: m[2] };
}
// 图层命名（中文 / English）。固定层名必须为 手指 / Hand、结束页 / End card、免责声明 / Disclaimer、背景 / Background。
export function layerName(id, asset, zh) {
  if (id === 'background') return zh ? '背景' : 'Background';
  if (id === 'hand') return zh ? '手指' : 'Hand';
  if (id === 'disclaimer') return zh ? '免责声明' : 'Disclaimer';
  if (id === 'end_card') return zh ? '结束页' : 'End card';
  const { k, rest } = splitId(id);
  const base = (NAMES[k] || [k, k])[zh ? 0 : 1];
  if (k === 'hero') {
    const P = { head: ['矿工_头', 'Miner_Head'], head_happy: ['矿工_开心', 'Miner_Happy'], head_dizzy: ['矿工_眩晕', 'Miner_Dizzy'], body: ['矿工_身体', 'Miner_Body'], arm_l: ['矿工_左臂', 'Miner_ArmL'], arm_r: ['矿工_右臂', 'Miner_ArmR'], leg_l: ['矿工_左腿', 'Miner_LegL'], leg_r: ['矿工_右腿', 'Miner_LegR'], shadow: ['矿工_影子', 'Miner_Shadow'] };
    return (P[rest] || [base + '_' + rest, base + '_' + rest])[zh ? 0 : 1];
  }
  if (k === 'screw') {
    const color = String(asset).replace('screw_', '');
    return base + '_' + rest + '_' + color;
  }
  if (k === 'plank') return base + '_' + rest;
  if (k === 'bubble') return base + '_' + rest;
  if (k === 'timer') {
    if (id === 'timer_ring') return zh ? '计时环' : 'Timer ring';
    if (id === 'timer_marker') return zh ? '计时指针' : 'Timer marker';
  }
  if (k === 'end') {
    if (id === 'end_hero') return zh ? '结束页矿工' : 'End hero';
    if (id === 'end_cta') return zh ? '结束页按钮' : 'End CTA';
    if (id === 'end_glow') return zh ? '结束页光晕' : 'End glow';
  }
  return rest ? base + '_' + rest : base;
}
const labelOf = id =>
  id.startsWith('screw') ? LABEL.screw :
  id.startsWith('plank') ? LABEL.plank :
  id.startsWith('hero') ? LABEL.hero :
  id.startsWith('fx') ? LABEL.fx :
  id.startsWith('end') || id === 'end_card' ? LABEL.end :
  id === 'hand' ? LABEL.hand :
  id === 'background' ? LABEL.bg :
  id.startsWith('board') ? LABEL.board :
  ['acid', 'bubble', 'slab', 'platform', 'tray', 'pulley', 'weight', 'rope'].some(x => id.startsWith(x)) ? LABEL.scene : LABEL.ui;

function folderOf(asset) {
  if (String(asset).startsWith('screw_')) return 'screws';
  if (String(asset).startsWith('plank_')) return 'planks';
  if (String(asset).startsWith('hero_')) return 'hero';
  if (String(asset).startsWith('end_')) return 'ui';
  if (['background', 'acid', 'bubble', 'board', 'slab', 'platform', 'tray', 'pulley', 'weight', 'rope'].includes(asset)) return 'scene';
  return 'ui';
}

export function createAERecorder(api) {
  let R = null;
  function start(opt = {}) {
    const E = api.env();
    R = {
      t0: performance.now(), lastT: 0, frames: 0, tracks: new Map(), sfx: [], snaps: [],
      snapEvery: opt.snapEvery || window.__aeSnapEvery || 0, maxSnaps: opt.maxSnaps || 40,
      L: E.L, S: { ...E.S }, A: E.A,
    };
    api.sfx.hook = (name, o) => { if (R) R.sfx.push({ t: (performance.now() - R.t0) / 1000, name, dur: o && o.dur }); };
  }
  function stop() { const r = R; R = null; return r; }
  function sample(now) {
    if (!R) return;
    const E = api.env();
    if (E.L !== R.L) { R = null; return; }
    R.A = E.A;
    const t = Math.max(R.lastT + (R.frames > 0 ? 1e-4 : 0), (now - R.t0) / 1000), f = R.frames;
    for (const it of E.items) {
      if (!it.a) continue;
      const key = it.id + '|' + it.asset;
      let tr = R.tracks.get(key);
      if (!tr) { tr = { id: it.id, asset: it.asset, z: it.z, s: [], order: R.tracks.size }; R.tracks.set(key, tr); }
      tr.s.push([t, r3(it.x), r3(it.y), r3(it.sx), r3(it.sy), r3(it.rot), r3(it.op), f, r3(it.lift || 0), r3(it.z)]);
    }
    if (R.snapEvery && f % R.snapEvery === R.snapEvery - 1 && R.snaps.length < R.maxSnaps) R.snaps.push({ t, url: E.canvas.toDataURL('image/png') });
    R.lastT = t; R.frames++;
  }

  async function exportZip(rec = R, So = null) {
    if (!rec || rec.frames < 2) throw new Error('没有可导出的记录：请先自动通关或手动游玩');
    const E = api.env(), S = So ? { ...rec.S, ...So } : rec.S, AS = rec.A;
    const fps = +S.aeFps || 30, bake = S.aeSampling === 'bake', CW = 720, CH = 1280, zh = S.aeNames !== 'en';
    const D = Math.max(1 / fps, Math.ceil((rec.lastT + 1 / fps) * fps - 1e-6) / fps);
    const assets = [], assetFiles = [], pending = [], used = new Map();
    const folders = [
      { id: 'root', name: zh ? '巨石营救_AE工程' : 'BoulderRescue_AE' },
      { id: 'img', name: zh ? '素材' : 'Assets', parent: 'root' },
      { id: 'scene', name: zh ? '场景' : 'Scene', parent: 'img' },
      { id: 'screws', name: zh ? '螺丝' : 'Screws', parent: 'img' },
      { id: 'planks', name: zh ? '木板' : 'Planks', parent: 'img' },
      { id: 'hero', name: zh ? '矿工' : 'Miner', parent: 'img' },
      { id: 'ui', name: zh ? '界面' : 'UI', parent: 'img' },
      { id: 'aud', name: zh ? '音频' : 'Audio', parent: 'root' },
      { id: 'pre', name: zh ? '预合成' : 'Precomps', parent: 'root' },
    ];
    const toPng = c => new Promise(res => c.toBlob(b => b.arrayBuffer().then(a => res(new Uint8Array(a))), 'image/png'));
    function assetFor(key) {
      if (used.has(key)) return used.get(key);
      const a = AS[key];
      if (!a) throw new Error('缺少素材: ' + key);
      const c = a.c;
      const file = 'assets/' + key + '.png';
      const o = { id: key, file, folder: folderOf(key), w: c.width, h: c.height, name: key + '.png', kx: c.width / a.w, ky: c.height / a.h, ax: a.ax, ay: a.ay };
      assets.push(o); pending.push(toPng(c).then(data => assetFiles.push({ name: file, data }))); used.set(key, o); return o;
    }
    const rnd = v => Array.isArray(v) ? v.map(x => Math.round(x * 100) / 100) : Math.round(v * 100) / 100;
    const r4 = x => Math.round(x * 10000) / 10000;
    function resample(s) {
      const f0 = Math.round(s[0][0] * fps), f1 = Math.max(f0, Math.round(s[s.length - 1][0] * fps)), out = []; let j = 0;
      for (let f = f0; f <= f1; f++) {
        const tau = f / fps;
        while (j < s.length - 2 && s[j + 1][0] <= tau + 1e-9) j++;
        const a = s[j], b = s[j + 1] || a, u = b[0] > a[0] ? Math.min(1, Math.max(0, (tau - a[0]) / (b[0] - a[0]))) : 0;
        out.push({ t: tau, v: a.map((x, i) => i === 0 ? tau : x + (b[i] - x) * u) });
      }
      return { f0, f1, list: out };
    }
    function prop(fr, get, tol) {
      const t = fr.list.map(o => o.t), vv = fr.list.map(o => get(o.v));
      const same = (a, b, e) => Array.isArray(a) ? a.every((x, i) => Math.abs(x - b[i]) <= e) : Math.abs(a - b) <= e;
      if (vv.every(x => same(x, vv[0], 1e-6))) return rnd(vv[0]);
      let keep;
      if (bake) keep = vv.map((_, i) => i);
      else {
        keep = [0]; let a = 0;
        for (let b = 2; b < vv.length; b++) {
          let ok = true;
          for (let m = a + 1; m < b && ok; m++) {
            const u = (t[m] - t[a]) / (t[b] - t[a]);
            const lin = Array.isArray(vv[a]) ? vv[a].map((x, i) => x + (vv[b][i] - x) * u) : vv[a] + (vv[b] - vv[a]) * u;
            ok = same(lin, vv[m], tol);
          }
          if (!ok) { keep.push(b - 1); a = b - 1; }
        }
        if (vv.length > 1) keep.push(vv.length - 1);
      }
      return { t: keep.map(i => r4(t[i])), v: keep.map(i => rnd(vv[i])) };
    }
    const keyCount = p => (p && typeof p === 'object' && !Array.isArray(p) && p.t) ? p.t.length : 0;
    const segs = [], layers = [], markers = [], comps = [];
    for (const tr of rec.tracks.values()) {
      let a = 0;
      for (let i = 1; i <= tr.s.length; i++) {
        if (i === tr.s.length || tr.s[i][7] !== tr.s[i - 1][7] + 1) {
          segs.push({ tr, s: tr.s.slice(a, i) }); a = i;
        }
      }
    }
    const nSeg = new Map();
    segs.forEach(g => nSeg.set(g.tr.id + '|' + g.tr.asset, (nSeg.get(g.tr.id + '|' + g.tr.asset) || 0) + 1));
    segs.sort((p, q) => p.tr.z - q.tr.z || p.tr.order - q.tr.order || p.s[0][0] - q.s[0][0]);
    const segK = new Map();
    for (const g of segs) {
      const a = assetFor(g.tr.asset), fr = resample(g.s), tin = fr.f0 / fps;
      const last = g.s[g.s.length - 1], nextT = rec.frames - 1 > last[7] ? last[0] + 1 / fps : D;
      const tout = Math.min(D, Math.max(tin + 1 / fps, Math.round(nextT * fps) / fps));
      const k = g.tr.id + '|' + g.tr.asset, n = (segK.get(k) || 0) + 1; segK.set(k, n);
      const nm = layerName(g.tr.id, g.tr.asset, zh) + (nSeg.get(k) > 1 ? ` #${n}` : '');
      layers.push({
        name: nm, src: { asset: a.id }, in: r4(tin), out: r4(tout), label: labelOf(g.tr.id),
        tr: {
          anchor: [rnd(a.ax * a.kx), rnd(a.ay * a.ky)],
          position: prop(fr, e => [e[1], e[2]], 0.25),
          scale: prop(fr, e => [e[3] * 100 / a.kx, e[4] * 100 / a.ky], 0.25),
          rotation: prop(fr, e => e[5] * 180 / Math.PI, 0.2),
          opacity: prop(fr, e => Math.max(0, Math.min(100, e[6] * 100)), 0.5),
        },
      });
    }
    // 音频
    const audioFiles = [], ZH = n => (SFX_NAMES[n] || [0, n])[1];
    if (S.aeAudio !== 'none' && rec.sfx.length) {
      try {
        if (S.aeAudio === 'both' || S.aeAudio === 'mixed') {
          const buf = await renderSfxOffline(rec.sfx, D, S);
          if (buf) {
            audioFiles.push({ name: 'audio/mix.wav', data: encodeWav(buf) });
            assets.push({ id: 'mix', file: 'audio/mix.wav', folder: 'aud', name: 'mix.wav' });
            layers.push({ name: zh ? '混合音轨' : 'Mixed audio', src: { asset: 'mix' }, label: LABEL.audio });
          }
        }
        if (S.aeAudio === 'both' || S.aeAudio === 'events') {
          const kinds = new Map();
          rec.sfx.forEach(e => { const k = e.name; if (!kinds.has(k)) kinds.set(k, e); e.k = k; });
          for (const [k, e] of kinds) {
            const buf = await renderSfxOffline([{ t: 0, name: e.name, dur: e.dur }], (SFX_DUR[e.name] || 0.4) + 0.2, S);
            if (!buf) continue;
            audioFiles.push({ name: `audio/sfx_${k}.wav`, data: encodeWav(buf) });
            assets.push({ id: 'sfx_' + k, file: `audio/sfx_${k}.wav`, folder: 'aud', name: `sfx_${k}.wav` });
          }
          const al = rec.sfx.map((e, i) => {
            const st = r4(e.t);
            return { name: zh ? `音效 ${i + 1} ${ZH(e.name)}` : `SFX ${i + 1} ${e.name}`, src: { asset: 'sfx_' + e.k }, start: st, in: st, label: LABEL.audio };
          });
          comps.push({ id: 'sfx', name: zh ? '音效_逐事件' : 'SFX events', w: CW, h: CH, duration: D, fps, folder: 'pre', layers: al });
          layers.push({ name: zh ? '音效_逐事件' : 'SFX events', src: { comp: 'sfx' }, label: LABEL.audio });
        }
      } catch (e) { console.warn('audio export', e); }
    }
    for (const e of rec.sfx) markers.push([r4(e.t), ZH(e.name)]);
    const d = new Date(), p2 = x => String(x).padStart(2, '0');
    const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
    comps.push({ id: 'main', name: zh ? '主合成_巨石营救' : 'Main_BoulderRescue', w: CW, h: CH, duration: D, fps, folder: 'root', bg: [0, 0, 0], layers, markers });
    const [CW2, CH2] = S.aeSize && S.aeSize !== 'canvas' ? S.aeSize.split('x').map(Number) : [E.canvas.width, E.canvas.height];
    const K = Math.round(CW2 / CW * 1e6) / 1e6;
    if (K !== 1) {
      const mul = (P, f) => P == null ? P : Array.isArray(P) ? P.map(x => x * f) : P.t ? { ...P, v: P.v.map(x => Array.isArray(x) ? x.map(y => y * f) : x * f) } : P;
      for (const c of comps) {
        c.w = CW2; c.h = CH2;
        for (const l of c.layers) if (l.tr) { l.tr.position = mul(l.tr.position, K); l.tr.scale = mul(l.tr.scale, K); }
      }
    }
    if (!zh) {
      const T = [['主合成_巨石营救', 'Main_BoulderRescue'], ['巨石营救_AE工程', 'BoulderRescue_AE'], ['音效_逐事件', 'SFX events'], ['混合音轨', 'Mixed audio'], ['预合成', 'Precomps'], ['音效', 'SFX'], ['素材', 'Assets'], ['界面', 'UI'], ['音频', 'Audio'], ['场景', 'Scene'], ['螺丝', 'Screws'], ['木板', 'Planks'], ['矿工', 'Miner'], ['手指', 'Hand'], ['结束页', 'End card'], ['免责声明', 'Disclaimer'], ['背景', 'Background'], ['按下', 'pick'], ['入槽', 'land'], ['三消', 'match'], ['木板坠落', 'plank'], ['落石', 'rumble'], ['滴答', 'tick'], ['通关', 'win'], ['失败', 'fail']];
      const tr = x => { if (typeof x !== 'string') return x; for (const [a, b] of T) x = x.split(a).join(b); return x; };
      for (const c of comps) { c.name = tr(c.name); if (c.markers) c.markers = c.markers.map(([t, m]) => [t, tr(m)]); for (const l of c.layers) l.name = tr(l.name); }
      for (const f of folders) f.name = tr(f.name);
    }
    const stats = { comps: comps.length, layers: 0, keys: 0, perComp: {}, screws: rec.L.nodes.length, planks: rec.L.planks.length, triples: rec.L.triples, sfx: rec.sfx.length };
    for (const c of comps) {
      stats.perComp[c.id] = c.layers.length; stats.layers += c.layers.length;
      for (const l of c.layers) if (l.tr) for (const k of ['position', 'scale', 'rotation', 'opacity']) { const kc = keyCount(l.tr[k]); if (kc > 1) stats.keys += kc; }
    }
    const timeline = {
      meta: {
        tool: TOOL_ID, format: 1, created: d.toISOString(), fps, width: CW2, height: CH2, duration: D,
        canvas: [E.canvas.width, E.canvas.height], sampling: bake ? 'bake' : 'reduce', scale: K,
        names: zh ? 'zh' : 'en', saveAep: S.aeSaveAep !== false, aepName: `boulder_${stamp}.aep`, newProject: true, stats,
        board: { cols: rec.L.cols, rows: rec.L.rows, total: rec.L.total, triples: rec.L.triples },
        note: '图层从下到上排列；时间单位秒；位置/锚点单位像素（合成坐标）；缩放为百分比',
      },
      folders, assets: assets.map(({ id, file, folder, w, h, name }) => ({ id, file, folder, w, h, name })), comps, mainComp: 'main',
    };
    await Promise.all(pending);
    const enc = new TextEncoder();
    const files = [
      { name: 'build_ae_project.jsx', data: enc.encode(JSX_TEXT) },
      { name: 'timeline.json', data: enc.encode(JSON.stringify(timeline)) },
      { name: 'README_AE.md', data: enc.encode(README_TEXT) },
      ...assetFiles.sort((a, b) => a.name < b.name ? -1 : 1),
      ...audioFiles,
    ];
    return {
      blob: makeZip(files), name: `boulder_ae_export_${stamp}.zip`, timeline, stats,
      files: files.length, fileList: files, snaps: rec.snaps.map(s => s.t),
      segs: segs.map(g => ({ id: g.tr.id, asset: g.tr.asset, z: g.tr.z, s: g.s, m: g.tr.m || null })),
    };
  }
  return { start, stop, sample, exportZip, get rec() { return R; }, set rec(v) { R = v; } };
}
