// AE 导出：自动通关记录 → ZIP 下载 → 结构/图层/素材/音频校验，并保存快照供合成比对。
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  ART, ROOT, serve, launch, newPage, waitGame, autoToEnd, nextDownload, unzip,
  stage, check, eq, near, summary, log, ensureArt, saveDataUrl, readJson, writeJson,
} from './helpers.mjs';

log('巨石营救 · AE 导出测试');
const artDir = await ensureArt('ae');
const server = await serve(ROOT);
const browser = await launch();
let context, page;
try {
  stage('生成记录并导出 ZIP');
  ({ page, context } = await newPage(browser, { width: 1280, height: 900 }));
  await page.goto(server.origin + '/index.html', { waitUntil: 'load', timeout: 60000 });
  await waitGame(page);
  const st = await autoToEnd(page, { extra: { sfxMute: false } });
  check(st.won, '自动通关成功');
  check(st.recFrames > 60, '记录帧数足够', st.recFrames);
  eq(st.recSfx > 0, true, '记录包含音效事件');

  const zipPath = await nextDownload(page, () => page.evaluate(() => __game.exportAE()), artDir, 240000);
  check(/^boulder_ae_export_\d{8}_\d{6}\.zip$/.test(path.basename(zipPath)), 'ZIP 文件名符合规范', path.basename(zipPath));
  const projectDir = path.join(artDir, 'project');
  await unzip(zipPath, projectDir);
  const exported = await page.evaluate(() => ({
    stats: window.__lastAEExport && window.__lastAEExport.stats,
    files: window.__lastAEExport && window.__lastAEExport.files,
    name: window.__lastAEExport && window.__lastAEExport.name,
    snaps: (__game.lastAERec && __game.lastAERec.snaps || []).map((s, i) => ({ i, t: s.t })),
  }));
  eq(exported.name, path.basename(zipPath), '页面导出的 ZIP 名称与下载一致');
  check(exported.stats && exported.stats.layers > 50, '导出统计包含图层数', exported.stats && exported.stats.layers);
  log('  统计：' + JSON.stringify(exported.stats));

  stage('ZIP 必需文件');
  for (const rel of ['build_ae_project.jsx', 'timeline.json', 'README_AE.md']) {
    eq(fs.existsSync(path.join(projectDir, rel)), true, '存在 ' + rel);
  }
  const assetFiles = await fsp.readdir(path.join(projectDir, 'assets')).catch(() => []);
  check(assetFiles.length > 30, 'assets/ PNG 素材数量足够', assetFiles.length);
  check(assetFiles.some(f => /^background\.png$/.test(f)), '包含背景素材');
  check(assetFiles.some(f => /^hand\.png$/.test(f)), '包含固定图层手指素材 hand.png');
  check(assetFiles.some(f => /^end_card/.test(f)), '包含结束页素材');
  check(assetFiles.some(f => /^screw_/.test(f)), '包含螺丝素材');
  const audioFiles = await fsp.readdir(path.join(projectDir, 'audio')).catch(() => []);
  check(audioFiles.includes('mix.wav'), '包含混合音轨 audio/mix.wav');
  check(audioFiles.some(f => /^sfx_.+\.wav$/.test(f)), '包含逐事件音效', audioFiles.slice(0, 4).join(','));
  const mixBytes = fs.statSync(path.join(projectDir, 'audio', 'mix.wav')).size;
  check(mixBytes > 1000, '混合音轨 WAV 非空', mixBytes);
  const jsx = await fsp.readFile(path.join(projectDir, 'build_ae_project.jsx'), 'utf8');
  check(jsx.includes('__BOULDER_BUILD_STATS'), 'JSX 暴露 __BOULDER_BUILD_STATS');
  check(jsx.includes('timeline.json') && jsx.includes('addComp') && jsx.includes('ADBE Transform Group'), 'JSX 能读取时间轴并建立合成');
  check(jsx.includes('mainComp') && jsx.includes('saveAep'), 'JSX 支持 mainComp / 另存 aep');
  const readme = await fsp.readFile(path.join(projectDir, 'README_AE.md'), 'utf8');
  check(readme.includes('主合成_巨石营救') && readme.includes('手指'), 'README_AE 说明固定图层');

  stage('timeline 结构');
  const TL = await readJson(path.join(projectDir, 'timeline.json'));
  eq(TL.mainComp, 'main', 'mainComp = main');
  check(TL.meta && TL.meta.tool === 'boulder-rescue-tool', 'meta.tool 正确');
  eq(TL.meta.format, 1, 'timeline format = 1');
  check([24, 25, 30, 60].includes(TL.meta.fps), '帧率合法', TL.meta.fps);
  eq(TL.meta.width, 720, '合成宽度 720');
  eq(TL.meta.height, 1280, '合成高度 1280');
  check(TL.meta.duration > 1, '时长大于 1 秒', TL.meta.duration);
  check(TL.meta.stats && TL.meta.stats.layers > 50, 'meta.stats.layers 存在');
  eq(TL.meta.board.total, 42, 'meta.board.total = 42');
  eq(TL.meta.board.triples, 14, 'meta.board.triples = 14');
  eq(TL.meta.names, 'zh', '默认中文图层命名');
  check(Array.isArray(TL.folders) && TL.folders.some(f => f.name === '巨石营救_AE工程'), '包含中文工程文件夹');
  check(Array.isArray(TL.assets) && TL.assets.length > 30, 'assets 表非空');
  const assetIds = new Set(TL.assets.map(a => a.id));
  for (const a of TL.assets) {
    check(fs.existsSync(path.join(projectDir, a.file)), '素材文件存在：' + a.file);
    if (!fs.existsSync(path.join(projectDir, a.file))) break;
  }
  const comps = new Map(TL.comps.map(c => [c.id, c]));
  check(comps.has('main'), '存在 main 合成');
  check(comps.has('sfx'), '存在音效预合成 sfx');
  const main = comps.get('main');
  eq(main.name, '主合成_巨石营救', '主合成中文名');
  check(main.layers.length > 50, '主合成图层数量足够', main.layers.length);
  check(main.markers && main.markers.length > 0, '主合成含音效标记', main.markers && main.markers.length);
  check(main.duration === TL.meta.duration, '主合成时长与 meta 一致');
  check(main.layers.every(l => l.src && (l.src.asset || l.src.comp)), '每个图层都有有效源');
  const badSrc = main.layers.find(l => l.src.asset && !assetIds.has(l.src.asset));
  check(!badSrc, '图层素材引用均存在于 assets 表', badSrc && badSrc.name);

  stage('固定图层名 / 必备图层');
  const names = main.layers.map(l => l.name);
  for (const fixed of ['手指', '结束页', '免责声明', '背景']) {
    check(names.includes(fixed), '主合成包含固定图层「' + fixed + '」');
  }
  const handLayer = main.layers.find(l => l.name === '手指');
  check(handLayer && handLayer.src.asset === 'hand', '手指层引用 hand 素材');
  check(handLayer && handLayer.tr && handLayer.tr.position, '手指层有位置动画');
  const bgLayer = main.layers.find(l => l.name === '背景');
  check(bgLayer && bgLayer.src.asset === 'background', '背景层引用 background 素材');
  const endLayer = main.layers.find(l => l.name === '结束页');
  check(endLayer && endLayer.src.asset === 'end_card_win', '结束页层引用 end_card_win');
  check(main.layers.some(l => l.name === '免责声明'), '免责声明图层存在');
  const counts = {
    screws: names.filter(n => n.startsWith('螺丝_')).length,
    planks: names.filter(n => n.startsWith('木板_')).length,
    hero: names.filter(n => n.startsWith('矿工_')).length,
    sfx: comps.get('sfx').layers.length,
  };
  log('  图层统计：' + JSON.stringify(counts));
  check(counts.screws >= 42, '螺丝图层 ≥42', counts.screws);
  check(counts.planks >= 71, '木板图层 ≥71', counts.planks);
  check(counts.hero >= 6, '矿工部件图层 ≥6', counts.hero);
  check(counts.sfx > 0, '逐事件音效层存在', counts.sfx);
  check(TL.meta.stats.layers === main.layers.length + comps.get('sfx').layers.length, 'stats 图层总数与 comps 一致');
  check(TL.meta.stats.screws === 42 && TL.meta.stats.triples === 14, 'stats 关卡数据一致');
  check(TL.meta.stats.keys > 1000, '关键帧总数 >1000', TL.meta.stats.keys);

  stage('快照落盘（供 PSNR 比对）');
  const snapMeta = await page.evaluate(() => {
    const snaps = (__game.lastAERec && __game.lastAERec.snaps) || [];
    if (!snaps.length) return [];
    const picks = [0, Math.floor(snaps.length * .25), Math.floor(snaps.length * .5), Math.floor(snaps.length * .75), snaps.length - 1];
    return [...new Set(picks)].map(i => ({ i, t: snaps[i].t, url: snaps[i].url }));
  });
  check(snapMeta.length >= 3, '至少保存 3 张记录快照', snapMeta.length);
  const snapDir = path.join(projectDir, 'web-snaps');
  await fsp.mkdir(snapDir, { recursive: true });
  const snapList = [];
  for (const s of snapMeta) {
    const file = path.join(snapDir, `snap_${String(s.i).padStart(3, '0')}.png`);
    await saveDataUrl(s.url, file);
    snapList.push({ i: s.i, t: s.t, file: 'web-snaps/' + path.basename(file) });
  }
  await writeJson(path.join(projectDir, 'web-snaps.json'), { snaps: snapList, meta: TL.meta, stats: TL.meta.stats });
  await writeJson(path.join(artDir, 'latest.json'), {
    zip: zipPath, projectDir, timeline: 'timeline.json', snaps: 'web-snaps.json',
    stats: TL.meta.stats, exportedAt: new Date().toISOString(),
  });
  await saveDataUrl(await page.evaluate(() => __game.screenshot()), path.join(artDir, 'end.png'));
  check(true, 'AE 导出产物已写入 test/artifacts/ae');
} catch (e) {
  check(false, '测试异常：' + e.message);
  console.error(e);
} finally {
  if (context) await context.close().catch(() => {});
  await browser.close().catch(() => {});
  await server.close();
}
summary('AE 导出测试');
