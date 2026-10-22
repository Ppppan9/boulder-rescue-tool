// 核心联调：UI 顺序、手动点击、手指、自动通关、结束页、录制、截图。
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  ROOT, ART, serve, launch, newPage, waitGame, autoToEnd, applyFast,
  stage, check, eq, near, summary, log, imageStats, saveDataUrl, ensureArt,
} from './helpers.mjs';

log('巨石营救 · 核心联调测试');
const artDir = await ensureArt('core');
const server = await serve(ROOT);
const browser = await launch();
let page, context, errors;
try {
  stage('启动与面板结构');
  ({ page, context, errors } = await newPage(browser, { width: 1280, height: 900 }));
  await page.goto(server.origin + '/index.html', { waitUntil: 'load', timeout: 60000 });
  await waitGame(page);
  eq(errors.length, 0, '启动无 console/page 错误', errors.join(' | '));

  const buttons = await page.$$eval('#panelHead .btns button', els => els.map(b => b.textContent.trim()));
  eq(buttons.join('|'), [
    '▶ 自动通关', '⏺ 开始录制', '↻ 重新开始', '🎲 换一局', '🖼 导入图形关卡',
    '📷 截图', '导出设置', '导入设置', '恢复默认',
  ].join('|'), '顶部按钮顺序与文案符合标准');
  const groups = await page.$$eval('#panelBody details > summary', els => els.map(e => e.textContent.trim()));
  eq(groups.join('|'), [
    '关卡与棋盘', '节奏与提示', '美术与场景', '音效', '手指 / 自动通关', '录制',
    '导出 AE 工程', '导出 3D 动画（UE5 / C4D / Blender）', '导出 H5 试玩广告', '结束页(End Card)',
  ].join('|'), '面板分组顺序符合标准');
  eq(await page.locator('#panel').isVisible(), true, '编辑器显示控制面板');
  eq(await page.locator('#stage').evaluate(el => getComputedStyle(el).cursor), 'pointer', '初始光标为 pointer');

  stage('参考关卡与画面');
  const levelInfo = await page.evaluate(() => ({
    cols: __game.level.cols, rows: __game.level.rows, total: __game.level.total,
    triples: __game.level.triples, colors: __game.level.colors.length,
    planks: __game.level.planks.length, assets: Object.keys(__game.assets).length,
  }));
  eq(levelInfo.total, 42, '参考关卡 42 颗螺丝');
  eq(levelInfo.triples, 14, '参考关卡 14 组三消');
  eq(levelInfo.cols + 'x' + levelInfo.rows, '7x6', '参考关卡 7×6');
  check(levelInfo.planks === 71, '71 块木板', levelInfo.planks);
  check(levelInfo.assets > 60, '精灵素材数量充足', levelInfo.assets);
  const handDebug = await page.evaluate(() => __game.handDebug());
  check(handDebug.hand && handDebug.hw > 100 && handDebug.hh > 100, '默认手指素材已加载', JSON.stringify(handDebug));
  eq(handDebug.show, true, '默认显示手指');
  eq(handDebug.manual, true, '默认手动跟随');
  let shot = await page.evaluate(() => __game.screenshot());
  let stats = await imageStats(page, shot);
  check(stats.mean > 20 && stats.litRatio > 0.25 && stats.colors > 40, '初始画面非黑且颜色丰富', JSON.stringify(stats));
  await fsp.mkdir(path.join(ART, 'core'), { recursive: true });
  await saveDataUrl(shot, path.join(artDir, '01-initial.png'));

  stage('手动点击 + 手指跟随');
  const box = await page.locator('#stage').boundingBox();
  const toCss = (x, y) => ({ x: box.x + x / 720 * box.width, y: box.y + y / 1280 * box.height });
  const p0 = toCss(280, 630); // 参考关卡 (0,0) 节点
  await page.mouse.move(p0.x, p0.y);
  await page.waitForTimeout(180);
  eq(await page.locator('#stage').evaluate(el => getComputedStyle(el).cursor), 'none', '手指出现时隐藏鼠标光标');
  let hd = await page.evaluate(() => __game.handDebug());
  check(hd.inside, '指针进入画布', JSON.stringify(hd));
  const hasHandItem = await page.evaluate(() => __game.items.some(i => i.id === 'hand' && i.asset === 'hand'));
  check(hasHandItem, '画面中存在独立手指精灵');
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.up();
  await page.waitForTimeout(260);
  let state = await page.evaluate(() => ({ picked: __game.state.picked, removed: __game.state.removed.size, tray: __game.state.tray.length }));
  eq(state.picked, 1, '真实鼠标点击拆下第一颗螺丝');
  eq(state.removed, 1, '已拆螺丝计数 1');
  eq(state.tray, 1, '螺丝进入托盘');
  await page.mouse.move(5, 5);
  await page.waitForTimeout(120);
  eq(await page.locator('#stage').evaluate(el => getComputedStyle(el).cursor), 'pointer', '手指离开后恢复 pointer');

  stage('自动通关（手指 + 结束页 + 时间轴）');
  await page.evaluate(() => __game.reset());
  await applyFast(page, { autoStartDelay: 600, sfxMute: false });
  await page.evaluate(() => { __game.setAE(8); __game.startAuto(); });
  await page.waitForFunction(() => __game.autoRunning, null, { timeout: 5000 });
  eq((await page.locator('#btnAuto').textContent()).trim(), '■ 停止', '自动通关时按钮变为停止');
  await page.waitForTimeout(900);
  hd = await page.evaluate(() => __game.handDebug());
  check(hd.auto && hd.hand, '自动通关时手指启用', JSON.stringify(hd));
  const autoState = await page.evaluate(() => ({
    visible: __game.handVisible, hand: __game.items.some(i => i.id === 'hand'),
    picked: __game.state.picked, rec: !!__game.recorder.rec,
  }));
  check(autoState.visible && autoState.hand, '自动通关过程中绘制手指', JSON.stringify(autoState));
  check(autoState.rec, '自动通关时同步记录 AE 时间轴');
  check(autoState.picked > 0, '自动通关已开始拆螺丝', autoState.picked);
  shot = await page.evaluate(() => __game.screenshot());
  await saveDataUrl(shot, path.join(artDir, '02-auto-play.png'));
  stats = await imageStats(page, shot);
  check(stats.mean > 20 && stats.colors > 40, '自动游玩画面非黑', JSON.stringify(stats));

  await page.waitForFunction(() => {
    const g = __game;
    return g.state && (g.state.won || g.state.lost) && !g.autoRunning;
  }, null, { timeout: 120000 });
  await page.waitForFunction(() => __game.phase === 'end', null, { timeout: 15000 });
  await page.waitForTimeout(400);
  const won = await page.evaluate(() => ({
    won: __game.state.won, lost: __game.state.lost, removed: __game.state.removed.size,
    picked: __game.state.picked, cleared: __game.state.cleared, phase: __game.phase,
    autoText: document.getElementById('btnAuto').textContent.trim(),
    handVisible: __game.handVisible,
    recFrames: __game.lastAERec ? __game.lastAERec.frames : 0,
    recTracks: __game.lastAERec ? __game.lastAERec.tracks.size : 0,
    recSfx: __game.lastAERec ? __game.lastAERec.sfx.length : 0,
    recSnaps: __game.lastAERec ? __game.lastAERec.snaps.length : 0,
    endItems: __game.items.filter(i => i.id.startsWith('end_') || i.asset.startsWith('end_')).map(i => i.id),
  }));
  eq(won.won, true, '自动通关成功');
  eq(won.lost, false, '自动通关未失败');
  eq(won.removed, 42, '拆光 42 颗螺丝');
  eq(won.picked, 42, '共点击 42 次');
  eq(won.cleared, 14, '共完成 14 次三消');
  eq(won.phase, 'end', '结束页已出现');
  eq(won.autoText, '▶ 自动通关', '自动结束后按钮复原');
  eq(won.handVisible, true, '结束页按开关显示手指');
  check(won.recFrames > 60, 'AE 记录帧数足够', won.recFrames);
  check(won.recTracks > 20, 'AE 记录图层轨道足够', won.recTracks);
  check(won.recSfx > 0, 'AE 记录包含音效事件', won.recSfx);
  check(won.recSnaps > 0, 'AE 记录包含画面快照', won.recSnaps);
  check(won.endItems.length > 0, '结束页元素存在', won.endItems.join(','));
  shot = await page.evaluate(() => __game.screenshot());
  await saveDataUrl(shot, path.join(artDir, '03-end-card.png'));
  stats = await imageStats(page, shot);
  check(stats.mean > 15 && stats.colors > 25, '结束页画面非黑', JSON.stringify(stats));

  stage('结束页点击重开');
  const cta = toCss(360, 800);
  await page.mouse.click(cta.x, cta.y);
  await page.waitForTimeout(400);
  const restarted = await page.evaluate(() => ({ phase: __game.phase, removed: __game.state.removed.size, end: __game.handDebug().endShown }));
  eq(restarted.phase, 'play', '点击结束页 CTA 区域重新开局');
  eq(restarted.removed, 0, '重开后螺丝复位');
  eq(restarted.end, false, '重开后结束页隐藏');

  stage('截图落盘');
  // 再跑一段到中局，保存给文档/仓库使用的当前画面截图
  await page.evaluate(() => { __game.startAuto(); });
  await page.waitForFunction(() => __game.state.picked >= 7, null, { timeout: 30000 });
  await page.waitForTimeout(120);
  const canvasShot = await page.evaluate(() => __game.screenshot());
  await saveDataUrl(canvasShot, path.join(ROOT, 'screenshots', 'current-canvas.png'));
  await saveDataUrl(canvasShot, path.join(artDir, 'current-canvas.png'));
  stats = await imageStats(page, canvasShot);
  check(stats.mean > 20 && stats.colors > 40, '中局截图画面有效', JSON.stringify(stats));
  eq(fs.existsSync(path.join(ROOT, 'screenshots', 'current-canvas.png')), true, 'screenshots/current-canvas.png 已生成');
  await page.evaluate(() => __game.stopAuto());
  await page.waitForTimeout(300);
  check(errors.length === 0, '全程无 console/page 错误', errors.slice(0, 3).join(' | '));
} catch (e) {
  check(false, '测试异常：' + e.message);
  console.error(e);
} finally {
  if (context) await context.close().catch(() => {});
  await browser.close().catch(() => {});
  await server.close();
}
summary('核心联调测试');
