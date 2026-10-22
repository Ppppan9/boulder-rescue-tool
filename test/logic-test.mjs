// 纯逻辑测试：关卡生成、托盘规则、求解器、设置迁移。不依赖浏览器。
import {
  referenceLevel, makeLevel, randomLevel, imageLevel, initState, pick, canPick,
  solvePlan, applyPlan, hintNode, maskFromAlpha, trimToTriples, colorCounts,
  countInTray, remainingOf, availableSlots, plankCenter, COLORS,
} from '../src/level.js';
import {
  DEFS, GROUPS, migrate, exportJSON, APP_ID, STORE_KEY, SETTINGS_VERSION,
} from '../src/settings.js';
import { stage, check, eq, near, summary, log } from './helpers.mjs';

log('巨石营救 · 逻辑测试');
stage('参考关卡');
const L = referenceLevel(4);
eq(L.cols, 7, '参考关卡列数 7');
eq(L.rows, 6, '参考关卡行数 6');
eq(L.total, 42, '参考关卡 42 颗螺丝');
eq(L.triples, 14, '参考关卡 14 组三消');
eq(L.nodes.length, 42, '节点数组长度 42');
eq(L.planks.length, 71, '参考关卡 71 块木板');
eq(L.colors.length, 4, '默认 4 种颜色');
check(Object.values(L.tally).every(n => n % 3 === 0), '每种颜色数量都是 3 的倍数', L.tally);
check(L.cells.length === 42 && new Set(L.cells).size === 42, '格子唯一');
check(L.nodes.every(n => L.mask[n.i] && n.c >= 0 && n.c < 7 && n.r >= 0 && n.r < 6), '节点落在 mask 内');
check(L.planks.every(p => L.nodeMap.has(p.a) && L.nodeMap.has(p.b)), '木板两端都是有效节点');
const pc = plankCenter(L, L.planks[0]);
check(Number.isFinite(pc.x) && Number.isFinite(pc.y), '木板中心坐标有效');

stage('求解器：参考关卡');
const plan = solvePlan(L, initState(L, { timeLimit: 90, traySlots: 3 }));
check(Array.isArray(plan) && plan.length === 42, '解法覆盖全部 42 颗螺丝', plan && plan.length);
eq(new Set(plan).size, 42, '解法无重复节点');
const stWin = applyPlan(L, plan, { timeLimit: 90, traySlots: 3, failOnJam: true });
check(!!stWin && stWin.won, '按解法执行可以通关');
check(stWin && stWin.tray.length === 0 && stWin.cleared === 14, '通关后托盘清空、共 14 次三消');
const sim = initState(L, { timeLimit: 90, traySlots: 3 });
let maxTray = 0, illegal = null;
for (const i of plan) {
  const r = pick(L, sim, i, { failOnJam: true, matchBonus: 0, timeLimit: 90 });
  if (!r.ok || r.lost) { illegal = i; break; }
  maxTray = Math.max(maxTray, sim.tray.length);
}
check(illegal === null, '回放过程中没有非法点击或卡死', illegal);
check(maxTray <= 3, '回放托盘从未超过 3 槽', maxTray);
eq(hintNode(L, initState(L, { timeLimit: 90, traySlots: 3 })), plan[0], '提示节点 = 解法第一步');

stage('求解器：带残槽');
const stHalf = initState(L, { timeLimit: 90, traySlots: 3 });
const reds = L.nodes.filter(n => n.color === 'red');
pick(L, stHalf, reds[0].i, { timeLimit: 90 });
pick(L, stHalf, reds[1].i, { timeLimit: 90 });
eq(stHalf.tray.length, 2, '先放两颗同色，托盘 2 槽');
const planHalf = solvePlan(L, stHalf);
check(planHalf && planHalf.length === 40, '残槽局面仍可解（再拆 40 颗）', planHalf && planHalf.length);
const fin = initState(L, { timeLimit: 90, traySlots: 3 });
fin.removed = new Set(stHalf.removed); fin.tray = [...stHalf.tray];
fin.picked = stHalf.picked; fin.started = true;
let okHalf = true;
for (const i of planHalf) { const r = pick(L, fin, i, { timeLimit: 90 }); if (!r.ok || r.lost) { okHalf = false; break; } }
check(okHalf && fin.won, '残槽解法真实回放通关');
const mixed = initState(L, { timeLimit: 90, traySlots: 4 });
const byColor = new Map(); for (const n of L.nodes) if (!byColor.has(n.color)) byColor.set(n.color, n);
for (const n of [...byColor.values()].slice(0, 2)) pick(L, mixed, n.i, { timeLimit: 90, failOnJam: false });
eq(solvePlan(L, mixed), null, '托盘混色时求解器拒绝给出解法');
const lostPlan = solvePlan(L, { ...initState(L), lost: true });
check(Array.isArray(lostPlan) && lostPlan.length === 0, '已失败局面返回空计划');

stage('随机关卡：保证可解');
for (const colorCount of [3, 4, 5]) {
  for (const [cols, rows] of [[4, 3], [5, 5], [6, 4], [7, 6], [8, 8]]) {
    for (let seed = 1; seed <= 8; seed++) {
      const R = makeLevel({ cols, rows, colorCount, seed: seed * 137 });
      const p = solvePlan(R, initState(R, { timeLimit: 90, traySlots: 3 }));
      if (!check(p && p.length === R.total, `种子 ${seed * 137} ${cols}×${rows} ${colorCount} 色可解`, p && p.length)) {
        process.exitCode = 1;
      }
      if (R.total % 3 !== 0 || !Object.values(R.tally).every(n => n % 3 === 0)) {
        check(false, '随机关卡颜色数为 3 的倍数', JSON.stringify(R.tally));
      }
    }
  }
}
for (const size of [[3, 3], [10, 10]]) {
  const R = makeLevel({ cols: size[0], rows: size[1], colorCount: 5, seed: 9 });
  check(R.total % 3 === 0 && R.total >= 3, `${size[0]}×${size[1]} 边界尺寸仍为 3 的倍数`, R.total);
  check(!!solvePlan(R, initState(R, { timeLimit: 1e9, traySlots: 3 })), `${size[0]}×${size[1]} 边界尺寸可解`);
}
check(!!solvePlan(randomLevel(12345, 5, 7, 6), initState(randomLevel(12345, 5, 7, 6))), 'randomLevel 可解');

stage('托盘规则');
const jamL = referenceLevel(4);
const jamSt = initState(jamL, { timeLimit: 90, traySlots: 3 });
const firsts = [];
for (const c of ['red', 'blue', 'green']) firsts.push(jamL.nodes.find(n => n.color === c));
pick(jamL, jamSt, firsts[0].i, { timeLimit: 90 });
pick(jamL, jamSt, firsts[1].i, { timeLimit: 90 });
const third = pick(jamL, jamSt, firsts[2].i, { timeLimit: 90 });
check(third.ok && third.lost && jamSt.lost && jamSt.overflow, '三颗异色塞满 3 槽即失败');
eq(canPick(jamL, jamSt, jamL.nodes.find(n => !jamSt.removed.has(n.i)).i).reason, 'lost', '失败后禁止继续点击');
check(!stWin.overflow, '正常通关不触发 overflow');

const softSt = initState(jamL, { timeLimit: 90, traySlots: 3 });
pick(jamL, softSt, firsts[0].i, { timeLimit: 90, failOnJam: false });
pick(jamL, softSt, firsts[1].i, { timeLimit: 90, failOnJam: false });
pick(jamL, softSt, firsts[2].i, { timeLimit: 90, failOnJam: false });
check(!softSt.lost && softSt.overflow, 'failOnJam=false 时塞满不判负');
eq(availableSlots(softSt), 0, '塞满后可用槽位 0');
eq(canPick(jamL, softSt, jamL.nodes.find(n => !softSt.removed.has(n.i)).i).reason, 'full', '塞满后点击被拒绝');
eq(countInTray(softSt, 'red'), 1, '托盘颜色计数正确');
const redTotal = remainingOf(jamL, softSt, 'red');
check(redTotal === jamL.tally.red - 1, '剩余同色计数正确', redTotal);
eq(availableSlots(initState(jamL, { traySlots: 5 })), 5, '5 槽局面可用槽位 5');

const matchSt = initState(jamL, { timeLimit: 90, traySlots: 3 });
const reds3 = jamL.nodes.filter(n => n.color === 'red').slice(0, 3);
pick(jamL, matchSt, reds3[0].i, { timeLimit: 90 });
pick(jamL, matchSt, reds3[1].i, { timeLimit: 90 });
const matched = pick(jamL, matchSt, reds3[2].i, { timeLimit: 90, matchBonus: 5 });
check(matched.matched && matchSt.cleared === 1 && matchSt.tray.length === 0, '同色三颗自动消除');
near(matchSt.timeLeft, 95, 1e-6, '三消加时生效');
check(matched.released.length >= 0, '三消返回木板释放列表');

stage('图形关卡 / mask');
const w = 40, h = 40, img = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const on = x >= 10 && x < 30 && y >= 10 && y < 30;
  const i = (y * w + x) * 4; img.data[i] = 200; img.data[i + 1] = 60; img.data[i + 2] = 80; img.data[i + 3] = on ? 255 : 0;
}
const mask = maskFromAlpha(img, 5, 5, 0.5, 0.5);
check(mask.filter(Boolean).length >= 3 && mask.filter(Boolean).length < 25, 'alpha → 网格 mask 非空且不是满格', mask.filter(Boolean).length);
const IL = imageLevel(img, { colorCount: 4, seed: 4, cols: 5, rows: 5 });
check(IL.total % 3 === 0, '图形关卡节点数为 3 的倍数', IL.total);
check(!!solvePlan(IL, initState(IL)), '图形关卡可解');
const m2 = new Array(25).fill(true); m2[0] = false; m2[24] = false;
const trimmed = trimToTriples(m2, 5, 5);
check(trimmed.filter(Boolean).length % 3 === 0, 'trimToTriples 修到 3 的倍数', trimmed.filter(Boolean).length);
const counts = colorCounts(42, 4, () => 0.5);
eq(counts.reduce((a, b) => a + b, 0), 42, '颜色分组总数等于节点数');
check(counts.every(n => n % 3 === 0 && n > 0), '颜色分组每组为 3 的倍数', counts);
let threw = false; try { colorCounts(41, 3, () => 0.5); } catch { threw = true; }
check(threw, '非 3 倍数节点数在颜色分组时抛错');

stage('设置结构 / 迁移');
const groupNames = GROUPS.map(g => g[0]);
eq(groupNames.slice(0, 3).join('|'), '关卡与棋盘|节奏与提示|美术与场景', '前三组顺序符合标准');
eq(groupNames.slice(3).join('|'), '音效|手指 / 自动通关|录制|导出 AE 工程|导出 3D 动画（UE5 / C4D / Blender）|导出 H5 试玩广告|结束页(End Card)', '后续面板组顺序符合标准');
eq(DEFS.colorCount, 4, '默认 4 色');
eq(DEFS.traySlots, 3, '默认 3 槽');
eq(DEFS.handShow, true, '默认显示手指');
eq(DEFS.manualHand, true, '默认手动跟随');
eq(DEFS.hideCursor, true, '默认隐藏鼠标');
eq(DEFS.endCardHand, false, '默认结束页不显示手指');
eq(DEFS.export3dHand, true, '默认 3D 包含手指');
eq(DEFS.level, 'reference', '默认参考关卡');
eq(DEFS.aeNames, 'zh', '默认中文图层命名');
eq(DEFS.h5AutoPlay, false, 'H5 默认不自动播放');
eq(APP_ID, 'boulder-rescue-tool', 'APP_ID');
eq(STORE_KEY, 'boulderRescueTool.settings', 'localStorage key');
eq(SETTINGS_VERSION, 1, '设置版本 1');
const legacy = migrate({ version: 0, handImg: 'x.png', sfxVol: 0.3, endText: '旧标题', gameTime: 123, colorCount: 5 });
eq(legacy.handImage, 'x.png', '迁移 handImg → handImage');
eq(legacy.sfxVolume, 0.3, '迁移 sfxVol → sfxVolume');
eq(legacy.endTitle, '旧标题', '迁移 endText → endTitle');
eq(legacy.timeLimit, 123, '迁移 gameTime → timeLimit');
eq(legacy.colorCount, 5, '保留用户修改的 colorCount');
eq(legacy.traySlots, 3, '缺失键补默认值');
const env = migrate({ version: 1, settings: { colorCount: 3, seed: 99, bogus: 1 } });
eq(env.colorCount, 3, '读取 settings 信封内的值');
eq(env.seed, 99, '保留 seed');
check(!('bogus' in env), '丢弃未知键');
const badType = migrate({ settings: { cols: '八列', rows: 6 } });
eq(badType.cols, DEFS.cols, '类型不符时回退默认值');
const exp = JSON.parse(exportJSON({ ...DEFS, colorCount: 3 }));
eq(exp.app, APP_ID, '导出设置带 app');
eq(exp.version, SETTINGS_VERSION, '导出设置带 version');
eq(exp.settings.colorCount, 3, '导出设置带 settings');
check(COLORS.length === 5, '调色板 5 色定义完整');

summary('逻辑测试');
