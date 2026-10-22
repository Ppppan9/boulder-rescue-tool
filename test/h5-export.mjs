// H5 试玩导出：8 渠道结构、体积、无手指、CTA、结束页、响应式视口矩阵。
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  ROOT, ART, serve, launch, newPage, waitGame, applyFast, nextDownload, unzip,
  stage, check, eq, near, summary, log, ensureArt, imageStats, saveDataUrl, readJson,
} from './helpers.mjs';

const CHANNELS = ['applovin', 'facebook', 'google', 'mintegral', 'moloco', 'tiktok', 'unity', 'generic'];
const LIMITS = { facebook: 2 };
const VIEWPORTS = [
  { name: 'iPhone SE', width: 375, height: 667 },
  { name: 'iPhone 12/13', width: 390, height: 844 },
  { name: 'iPhone 14 Pro Max', width: 430, height: 932 },
  { name: 'iPad Mini', width: 768, height: 1024 },
  { name: 'iPad Pro 13', width: 1032, height: 1376 },
  { name: 'Galaxy Z Fold 5 cover', width: 344, height: 882 },
  { name: 'Nest Hub / landscape tablet', width: 1024, height: 600 },
];
function externalScriptsOf(html) {
  const out = [];
  const re = /<script\b([^>]*)>[\s\S]*?<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(m[1]);
    if (src) out.push(src[1]);
  }
  return out;
}
const MRAID_STUB = `
window.mraid = {
  __state: 'default', __viewable: true, __calls: 0,
  getState: function(){ return this.__state; },
  isViewable: function(){ return this.__viewable; },
  addEventListener: function(ev, cb){ if(ev === 'ready') setTimeout(cb, 0); if(ev === 'viewableChange') this.__vis = cb; },
  removeEventListener: function(){},
  open: function(url){ this.__calls++; window.__ctaCalls = (window.__ctaCalls||0)+1; window.__ctaUrl = url; },
  ready: true
};
`;

log('巨石营救 · H5 试玩导出测试');
const artDir = await ensureArt('h5');
const server = await serve(ROOT);
const browser = await launch();
let context, page;
try {
  stage('从编辑器导出全部渠道');
  ({ page, context } = await newPage(browser, { width: 1280, height: 900 }));
  await page.goto(server.origin + '/index.html', { waitUntil: 'load', timeout: 60000 });
  await waitGame(page);
  await applyFast(page, {
    h5Format: CHANNELS.join(','),
    h5AutoPlay: false,
    h5CtaText: '立即下载',
    h5StoreUrl: 'https://example.com/store',
    h5GameName: '巨石营救',
    h5MaxMb: 4.5,
    endCard: true,
    endDelay: 50,
  });
  const zipPath = await nextDownload(page, () => page.evaluate(() => __game.exportH5()), artDir, 180000);
  check(/^boulder-rescue-tool_h5_playable_\d{8}_\d{6}\.zip$/.test(path.basename(zipPath)), 'H5 ZIP 文件名规范', path.basename(zipPath));
  const exportInfo = await page.evaluate(() => {
    const r = window.__lastH5Export;
    return r && { formats: r.formats, sizes: r.sizes, totalBytes: r.totalBytes, warn: r.warn || null, name: r.name };
  });
  check(!!exportInfo, '页面记录了 H5 导出信息');
  eq(exportInfo.formats.join(','), CHANNELS.join(','), '导出全部 8 个渠道');
  eq(exportInfo.name, path.basename(zipPath), '页面 ZIP 名与下载一致');
  check(!exportInfo.warn, '无体积告警', exportInfo.warn);
  log('  体积：' + Object.entries(exportInfo.sizes).map(([k, v]) => k + '=' + (v / 1024).toFixed(0) + 'KB').join(' '));
  const unzipped = path.join(artDir, 'unzipped');
  await unzip(zipPath, unzipped);
  eq(fs.existsSync(path.join(unzipped, 'README_H5.md')), true, 'ZIP 含 README_H5.md');
  const readme = await fsp.readFile(path.join(unzipped, 'README_H5.md'), 'utf8');
  for (const ch of CHANNELS) {
    const f = path.join(unzipped, ch, 'index.html');
    eq(fs.existsSync(f), true, '渠道目录存在：' + ch);
    const size = fs.statSync(f).size;
    const lim = LIMITS[ch] || 5;
    check(size <= lim * 1048576, ch + ' 单文件 ≤' + lim + 'MB', (size / 1048576).toFixed(2) + 'MB');
    const html = await fsp.readFile(f, 'utf8');
    check(html.includes('window.__PLAYABLE__='), ch + ' 注入 __PLAYABLE__');
    check(html.includes('id="h5-cta"') || html.includes("id=\\\"h5-cta\\\"") || html.includes('h5-cta'), ch + ' 含 CTA 外壳');
    check(!/window\.__game\.settings\.handShow\s*=\s*true/.test(html), ch + ' 未强制开启手指');
    check(!html.includes('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAYAAAA'), ch + ' 默认手指 dataURL 已剥离');
    const externalScripts = externalScriptsOf(html);
    const bad = externalScripts.filter(src => !/^mraid\.js$/.test(src));
    check(bad.length === 0, ch + ' 无外部脚本依赖', bad.join(','));
    if (ch === 'moloco') check(!/mraid\.js/.test(html), 'Moloco 不包含 mraid.js');
    if (ch === 'applovin') check(/mraid\.js/.test(html), 'AppLovin 包含 mraid.js');
    if (ch === 'facebook') check(/FbPlayableAd/.test(html), 'Meta 使用 FbPlayableAd.onCTAClick');
    if (ch === 'google') check(/ExitApi/.test(html), 'Google 使用 ExitApi.exit');
    if (ch === 'mintegral') check(/window\.install/.test(html), 'Mintegral 使用 window.install');
    if (ch === 'tiktok') check(/openAppStore/.test(html), 'TikTok 使用 openAppStore');
    check(html.includes('https://example.com/store'), ch + ' CTA 使用设置中的商店地址');
    check(readme.includes(ch), 'README 列出 ' + ch);
  }
  await fsp.writeFile(path.join(artDir, 'export.json'), JSON.stringify({ zipPath, exportInfo, unzipped }, null, 2));

  stage('各渠道启动 / 无手指 / CTA');
  const results = [];
  for (const ch of CHANNELS) {
    ({ context, page } = await newPage(browser, { width: 390, height: 844 }));
    await context.addInitScript(MRAID_STUB);
    await context.addInitScript(() => {
      window.__ctaCalls = 0;
      window.open = (u) => { window.__ctaCalls++; window.__ctaUrl = u; return null; };
      window.ExitApi = { exit: () => { window.__ctaCalls++; } };
      window.FbPlayableAd = { onCTAClick: () => { window.__ctaCalls++; } };
      window.install = () => { window.__ctaCalls++; };
      window.openAppStore = () => { window.__ctaCalls++; };
    });
    await context.route('**/mraid.js', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: MRAID_STUB }));
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') pageErrors.push(m.text()); });
    const url = server.origin + '/test/artifacts/h5/unzipped/' + ch + '/index.html';
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => window.__game && window.__game.level && document.getElementById('h5-cta'), null, { timeout: 30000 });
    await page.waitForTimeout(700);
    const info = await page.evaluate(() => ({
      panel: getComputedStyle(document.getElementById('panel')).display,
      playable: !!window.__PLAYABLE__,
      format: window.__PLAYABLE__ && window.__PLAYABLE__.format,
      autoPlay: window.__PLAYABLE__ && window.__PLAYABLE__.autoPlay,
      autoRunning: __game.autoRunning,
      settings: { handShow: __game.settings.handShow, manualHand: __game.settings.manualHand, hideCursor: __game.settings.hideCursor, handImage: __game.settings.handImage, endCardHand: __game.settings.endCardHand },
      hasHandAsset: !!__game.assets.hand,
      handItems: __game.items.filter(i => i.id === 'hand').length,
      cta: (() => { const b = document.querySelector('#h5-cta button'); return b ? b.textContent.trim() : ''; })(),
      layout: window.__h5StageLayout,
      canvas: (() => { const r = document.getElementById('stage').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })(),
      vw: window.innerWidth, vh: window.innerHeight,
      ended: window.__h5Ended && window.__h5Ended(),
    }));
    check(pageErrors.length === 0, ch + ' 启动无错误', pageErrors.slice(0, 2).join(' | '));
    eq(info.format, ch, ch + ' __PLAYABLE__.format 正确');
    eq(info.autoPlay, false, ch + ' 默认不自动播放');
    eq(info.autoRunning, false, ch + ' 启动后未自动通关');
    eq(info.panel, 'none', ch + ' 隐藏编辑器面板');
    eq(info.cta, '立即下载', ch + ' CTA 文案正确');
    eq(info.settings.handShow, false, ch + ' handShow=false');
    eq(info.settings.manualHand, false, ch + ' manualHand=false');
    eq(info.settings.hideCursor, false, ch + ' hideCursor=false');
    eq(info.settings.endCardHand, false, ch + ' endCardHand=false');
    eq(info.settings.handImage, '', ch + ' handImage 已清空');
    eq(info.hasHandAsset, false, ch + ' 无手指素材');
    eq(info.handItems, 0, ch + ' 画面无手指图层');
    check(info.layout && info.layout.scale > 0, ch + ' 生成舞台布局', info.layout && info.layout.scale);
    if (info.layout) {
      near(info.layout.cssW / info.layout.cssH, 720 / 1280, 0.01, ch + ' 舞台保持 9:16');
      check(info.layout.cssW <= info.layout.availW + 1 && info.layout.cssH <= info.layout.availH + 1, ch + ' 舞台 contain 在可用区域', JSON.stringify(info.layout));
      check(info.canvas.x >= -1 && info.canvas.y >= -1 && info.canvas.x + info.canvas.w <= info.vw + 1 && info.canvas.y + info.canvas.h <= info.vh + 1, ch + ' 画布在视口内', JSON.stringify(info.canvas));
    }
    eq(await page.locator('#stage').evaluate(el => getComputedStyle(el).cursor), 'pointer', ch + ' 不隐藏光标');
    const shot = await page.evaluate(() => __game.screenshot());
    const stats = await imageStats(page, shot);
    check(stats.mean > 20 && stats.colors > 40, ch + ' 画面非黑', JSON.stringify(stats));
    if (ch === 'generic') await saveDataUrl(shot, path.join(artDir, 'generic-390x844.png'));
    // 手动点击一颗螺丝
    const cb = await page.locator('#stage').boundingBox();
    await page.mouse.click(cb.x + cb.width * 280 / 720, cb.y + cb.height * 630 / 1280);
    await page.waitForTimeout(300);
    const picked = await page.evaluate(() => __game.state.picked);
    check(picked >= 1, ch + ' 真实点击可拆螺丝', picked);
    // CTA
    await page.locator('#h5-cta button').click();
    await page.waitForTimeout(150);
    const calls = await page.evaluate(() => ({ calls: window.__ctaCalls || 0, mraid: window.mraid && window.mraid.__calls, url: window.__ctaUrl || window.mraid && window.mraid.__url }));
    check(calls.calls >= 1, ch + ' CTA 触发安装/跳转', JSON.stringify(calls));
    results.push({ ch, layout: info.layout, errors: pageErrors.length, ctaCalls: calls.calls });
    await context.close();
    context = null;
  }

  stage('结束页 → 点击继续下载（generic）');
  ({ context, page } = await newPage(browser, { width: 390, height: 844 }));
  await context.addInitScript(MRAID_STUB);
  await context.addInitScript(() => {
    window.__ctaCalls = 0;
    window.open = (u) => { window.__ctaCalls++; window.__ctaUrl = u; return null; };
    window.ExitApi = { exit: () => { window.__ctaCalls++; } };
    window.FbPlayableAd = { onCTAClick: () => { window.__ctaCalls++; } };
    window.install = () => { window.__ctaCalls++; };
    window.openAppStore = () => { window.__ctaCalls++; };
  });
  await page.goto(server.origin + '/test/artifacts/h5/unzipped/generic/index.html', { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.level, null, { timeout: 30000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => __game.startAuto());
  await page.waitForFunction(() => __game.state && (__game.state.won || __game.state.lost) && !__game.autoRunning, null, { timeout: 90000 });
  await page.waitForFunction(() => window.__h5Ended && window.__h5Ended(), null, { timeout: 20000 });
  await page.waitForTimeout(800);
  const ended = await page.evaluate(() => ({
    ended: __h5Ended(), won: __game.state.won, phase: __game.phase,
    cls: document.documentElement.classList.contains('h5-ended'), calls: window.__ctaCalls || 0,
    ctaVisible: getComputedStyle(document.getElementById('h5-cta')).display !== 'none',
  }));
  eq(ended.won, true, 'H5 内自动通关成功');
  eq(ended.ended, true, '__h5Ended() 为 true');
  eq(ended.cls, true, '结束态加上 h5-ended 高亮');
  eq(ended.ctaVisible, true, '结束页 CTA 仍可见');
  const gbox = await page.locator('#stage').boundingBox();
  await page.mouse.click(gbox.x + gbox.width / 2, gbox.y + gbox.height / 2);
  await page.waitForTimeout(300);
  const callsAfter = await page.evaluate(() => window.__ctaCalls || 0);
  check(callsAfter > ended.calls, '结束页点击舞台触发下载', ended.calls + ' → ' + callsAfter);
  await saveDataUrl(await page.evaluate(() => __game.screenshot()), path.join(artDir, 'generic-ended.png'));
  await context.close();

  stage('响应式视口矩阵');
  ({ context, page } = await newPage(browser, { width: 390, height: 844 }));
  await page.goto(server.origin + '/test/artifacts/h5/unzipped/generic/index.html', { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.level && window.__h5StageLayout, null, { timeout: 30000 });
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.evaluate(() => window.__h5FitStage());
    await page.waitForTimeout(80);
    const L = await page.evaluate(() => {
      const l = window.__h5StageLayout;
      const st = document.getElementById('stage').getBoundingClientRect();
      const cta = document.getElementById('h5-cta').getBoundingClientRect();
      return { ...l, stage: { x: st.x, y: st.y, w: st.width, h: st.height, bottom: st.bottom, right: st.right }, cta: { top: cta.top, h: cta.height }, scrollW: document.documentElement.scrollWidth, vw: window.innerWidth };
    });
    check(L.cssW > 10 && L.cssH > 10, vp.name + ' 舞台尺寸有效', L.cssW + 'x' + L.cssH);
    near(L.cssW / L.cssH, 9 / 16, 0.012, vp.name + ' 比例 9:16');
    check(L.stage.x >= -1 && L.stage.y >= -1 && L.stage.right <= L.vw + 1, vp.name + ' 水平不溢出', JSON.stringify(L.stage));
    check(L.stage.bottom <= L.cta.top + 1, vp.name + ' 画布不被 CTA 遮挡', L.stage.bottom + ' <= ' + L.cta.top);
    check(L.scrollW <= L.vw + 1, vp.name + ' 无横向滚动', L.scrollW + '/' + L.vw);
    check(L.cssW <= L.availW + 1 && L.cssH <= L.availH + 1, vp.name + ' contain 可用区', JSON.stringify({ cssW: L.cssW, cssH: L.cssH, availW: L.availW, availH: L.availH }));
    log(`  ${vp.name}: ${L.cssW}×${L.cssH} (avail ${Math.round(L.availW)}×${Math.round(L.availH)})`);
  }
  await saveDataUrl(await page.evaluate(() => __game.screenshot()), path.join(artDir, 'generic-landscape.png'));
  await fsp.writeFile(path.join(artDir, 'channels.json'), JSON.stringify(results, null, 2));
} catch (e) {
  check(false, '测试异常：' + e.message);
  console.error(e);
} finally {
  if (context) await context.close().catch(() => {});
  await browser.close().catch(() => {});
  await server.close();
}
summary('H5 试玩导出测试');
