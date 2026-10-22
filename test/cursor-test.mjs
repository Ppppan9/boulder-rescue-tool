// 光标联动：手指出现时隐藏鼠标，手指关闭 / 手动跟随关闭 / 离开画布后恢复；
// 结束页手指、自动通关、hideCursor 开关以及控制面板不受影响。
import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT, serve, launch, newPage, waitGame, applyFast, check, eq, summary, log, saveDataUrl,
  ensureArt,
} from './helpers.mjs';

log('巨石营救 · 光标联动测试');
const artDir = await ensureArt('cursor');
const server = await serve(ROOT);
const browser = await launch();
let page, context, errors;

const cursorOf = (page, sel = '#stage') => page.locator(sel).evaluate(el => getComputedStyle(el).cursor);
const handVisible = (page) => page.evaluate(() => __game.handVisible);
const waitHand = (page, want, timeout = 4000) =>
  page.waitForFunction((v) => __game.handVisible === v, want, { timeout });
const waitCursor = (page, want, timeout = 4000) =>
  page.waitForFunction((v) => getComputedStyle(document.getElementById('stage')).cursor === v, want, { timeout });

try {
  ({ page, context, errors } = await newPage(browser, { width: 1280, height: 900 }));
  await page.goto(server.origin + '/index.html', { waitUntil: 'load', timeout: 60000 });
  await waitGame(page);
  const box = await page.locator('#stage').boundingBox();
  const toCss = (x, y) => ({ x: box.x + x / 720 * box.width, y: box.y + y / 1280 * box.height });
  const inside = toCss(360, 900);

  eq(await cursorOf(page), 'pointer', '初始画布光标为 pointer');
  eq(await handVisible(page), false, '初始指针不在画布，无手指');

  log('\n▶ 手动跟随');
  await page.mouse.move(inside.x, inside.y);
  await waitHand(page, true);
  await waitCursor(page, 'none');
  eq(await cursorOf(page), 'none', '手指出现时画布光标隐藏');
  const hd1 = await page.evaluate(() => __game.handDebug());
  check(hd1.inside && hd1.manual && hd1.show, '手动跟随状态正确', JSON.stringify(hd1));
  check(await page.evaluate(() => __game.items.some(i => i.id === 'hand')), '手指精灵参与绘制');

  await page.mouse.move(box.x - 30, box.y + 40);
  await waitHand(page, false);
  await waitCursor(page, 'pointer');
  eq(await cursorOf(page), 'pointer', '指针离开画布后恢复 pointer');

  log('\n▶ hideCursor 开关');
  await page.mouse.move(inside.x, inside.y);
  await waitHand(page, true);
  await waitCursor(page, 'none');
  await page.evaluate(async () => { await __game.apply({ hideCursor: false }); });
  await waitCursor(page, 'pointer');
  eq(await cursorOf(page), 'pointer', '关闭 hideCursor 后手指仍显示但光标恢复');
  eq(await handVisible(page), true, '关闭 hideCursor 不影响手指显示');

  await page.evaluate(async () => { await __game.apply({ hideCursor: true }); });
  await waitCursor(page, 'none');
  eq(await cursorOf(page), 'none', '重新开启 hideCursor 后再次隐藏');

  log('\n▶ 手指 / 手动跟随开关');
  await page.evaluate(async () => { await __game.apply({ handShow: false }); });
  await waitHand(page, false);
  await waitCursor(page, 'pointer');
  eq(await cursorOf(page), 'pointer', '关闭手指显示后光标恢复');
  eq(await page.evaluate(() => __game.items.some(i => i.id === 'hand')), false, '关闭手指后场景中无手指精灵');

  await page.evaluate(async () => { await __game.apply({ handShow: true, manualHand: false }); });
  await page.waitForTimeout(350);
  eq(await handVisible(page), false, '关闭手动跟随后指针在画布内也不显示手指');
  eq(await cursorOf(page), 'pointer', '关闭手动跟随后光标保持 pointer');
  const hd2 = await page.evaluate(() => __game.handDebug());
  eq(hd2.inside, true, '指针仍在画布内');

  log('\n▶ 自动通关');
  await applyFast(page, { manualHand: false, handShow: true, hideCursor: true });
  await page.evaluate(() => { __game.startAuto(); });
  await page.waitForFunction(() => __game.autoRunning, null, { timeout: 5000 });
  await page.mouse.move(box.x - 30, box.y + 40);
  await page.waitForTimeout(500);
  await waitHand(page, true);
  await waitCursor(page, 'none');
  eq(await handVisible(page), true, '自动通关时指针在画布外仍显示手指');
  eq(await cursorOf(page), 'none', '自动通关时画布光标隐藏');
  check(await page.evaluate(() => __game.items.some(i => i.id === 'hand')), '自动通关绘制手指');
  await page.evaluate(() => __game.stopAuto());
  await waitHand(page, false);
  await waitCursor(page, 'pointer');
  eq(await cursorOf(page), 'pointer', '停止自动通关后光标恢复');

  log('\n▶ 结束页');
  await page.evaluate(async () => {
    await __game.apply({ endCardHand: true, handShow: true, hideCursor: true, failDur: 200, endDelay: 30 });
  });
  await page.mouse.move(box.x - 30, box.y + 40);
  await page.evaluate(() => { __game.state.started = true; __game.state.timeLeft = 0.01; });
  await page.waitForFunction(() => __game.phase === 'end', null, { timeout: 8000 });
  await page.waitForTimeout(300);
  await waitHand(page, true);
  await waitCursor(page, 'none');
  eq(await handVisible(page), true, '结束页按开关显示手指');
  eq(await cursorOf(page), 'none', '结束页手指出现时画布光标隐藏');
  const hdEnd = await page.evaluate(() => __game.handDebug());
  eq(hdEnd.endShown, true, '结束页状态正确');
  check(await page.evaluate(() => __game.items.some(i => i.id === 'hand')), '结束页绘制手指');
  await saveDataUrl(await page.evaluate(() => __game.screenshot()), path.join(artDir, 'cursor-endcard-hand.png'));

  await page.evaluate(async () => { await __game.apply({ endCardHand: false }); });
  await waitHand(page, false);
  await waitCursor(page, 'pointer');
  eq(await cursorOf(page), 'pointer', '结束页关闭手指后光标恢复');

  log('\n▶ 控制面板');
  const panelInfo = await page.evaluate(() => {
    const panel = document.getElementById('panel');
    const btn = document.getElementById('btnAuto');
    const body = document.body;
    return {
      panel: getComputedStyle(panel).cursor,
      button: getComputedStyle(btn).cursor,
      body: getComputedStyle(body).cursor,
      canvas: getComputedStyle(document.getElementById('stage')).cursor,
    };
  });
  check(panelInfo.panel !== 'none' && panelInfo.body !== 'none', '控制面板与页面光标不被隐藏', JSON.stringify(panelInfo));
  check(panelInfo.canvas === 'pointer', '画布在无手指时为 pointer', panelInfo.canvas);
  check(panelInfo.button !== 'none', '顶部按钮光标不被隐藏', panelInfo.button);
  await page.locator('#panel').hover();
  await page.waitForTimeout(150);
  check((await cursorOf(page, '#panel')) !== 'none', '鼠标移到面板时面板光标正常');

  log('\n▶ 重开后复位');
  await page.evaluate(async () => {
    await __game.apply({ endCardHand: true, handShow: true, manualHand: true, hideCursor: true });
  });
  await page.evaluate(() => __game.reset());
  await page.mouse.move(inside.x, inside.y);
  await waitHand(page, true);
  await waitCursor(page, 'none');
  eq(await cursorOf(page), 'none', '重开并移入画布后手指与光标联动正常');
  await page.evaluate(async () => { await __game.apply({ handShow: false }); });
  await waitHand(page, false);
  await waitCursor(page, 'pointer');
  await page.mouse.move(box.x - 30, box.y + 40);
  check(errors.length === 0, '全程无 console/page 错误', errors.slice(0, 3).join(' | '));
  check(fs.existsSync(path.join(artDir, 'cursor-endcard-hand.png')), '光标测试截图已生成');
} catch (e) {
  check(false, '测试异常：' + e.message);
  console.error(e);
} finally {
  if (context) await context.close().catch(() => {});
  await browser.close().catch(() => {});
  await server.close();
}
summary('光标联动测试');
