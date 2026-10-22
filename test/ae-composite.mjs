// AE 时间轴回放 → 与浏览器记录快照做 PSNR 比对，验证 AE 合成与网页逐像素一致。
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  ROOT, ART, serve, launch, newPage, stage, check, summary, log, readJson, saveDataUrl,
} from './helpers.mjs';

log('巨石营救 · AE 合成 PSNR 测试');
const artDir = path.join(ART, 'ae');
const latestFile = path.join(artDir, 'latest.json');
if (!fs.existsSync(latestFile)) {
  console.error('缺少 AE 导出产物，请先运行 node test/ae-export.mjs');
  process.exit(1);
}
const latest = await readJson(latestFile);
const projectDir = path.resolve(latest.projectDir);
const snapMeta = await readJson(path.join(projectDir, latest.snaps || 'web-snaps.json'));
const relProject = path.relative(ROOT, projectDir).split(path.sep).join('/');
const server = await serve(ROOT);
const browser = await launch();
let context, page;
try {
  stage('加载 timeline 并合成');
  ({ page, context } = await newPage(browser, { width: 900, height: 1500 }));
  const url = server.origin + '/test/ae-composite.html?project=' + encodeURIComponent(relProject);
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  const ready = await page.evaluate(() => window.__ready);
  log('  ' + JSON.stringify(ready));
  check(ready.images > 20, '合成器加载了全部 PNG 素材', ready.images);
  check(ready.layers > 50, '主合成图层可用', ready.layers);

  stage('逐快照 PSNR');
  const results = [];
  for (const s of snapMeta.snaps) {
    const comp = await page.evaluate((t) => window.__render(t), s.t);
    const compFile = path.join(projectDir, 'composites', 'comp_' + String(s.i).padStart(3, '0') + '.png');
    await saveDataUrl(comp, compFile);
    const snapUrl = server.origin + '/' + path.relative(ROOT, path.join(projectDir, s.file)).split(path.sep).join('/');
    const r = await page.evaluate(async ({ a, b }) => window.__psnr(a, b), { a: comp, b: snapUrl });
    results.push({ ...s, ...r });
    log(`  t=${s.t.toFixed(2)}s  PSNR=${r.psnr.toFixed(2)} dB  MAE=${r.mae.toFixed(2)}  差>24比例=${(r.badRatio * 100).toFixed(2)}%`);
  }
  check(results.length >= 3, '至少比对 3 个时刻', results.length);
  const avg = results.reduce((a, r) => a + r.psnr, 0) / results.length;
  const min = Math.min(...results.map(r => r.psnr));
  log('  平均 PSNR=' + avg.toFixed(2) + ' dB，最低=' + min.toFixed(2) + ' dB');
  check(avg >= 20, '平均 PSNR ≥20 dB', avg.toFixed(2));
  check(min >= 16, '最低 PSNR ≥16 dB', min.toFixed(2));
  check(results.every(r => r.mae < 14), '平均像素误差 <14', results.map(r => r.mae.toFixed(1)).join(','));
  check(results.every(r => r.badRatio < 0.3), '大误差像素比例 <30%', results.map(r => (r.badRatio * 100).toFixed(1) + '%').join(','));
  await fsp.writeFile(path.join(artDir, 'psnr.json'), JSON.stringify({ results, avg, min }, null, 2));
  stage('对比图落盘');
  check(fs.existsSync(path.join(projectDir, 'composites')), true, '合成帧已保存到 composites/');
  // 合成中段画面供人工检查
  const mid = snapMeta.snaps[Math.floor(snapMeta.snaps.length / 2)];
  await saveDataUrl(await page.evaluate((t) => window.__render(t), mid.t), path.join(artDir, 'composite-mid.png'));
} catch (e) {
  check(false, '测试异常：' + e.message);
  console.error(e);
} finally {
  if (context) await context.close().catch(() => {});
  await browser.close().catch(() => {});
  await server.close();
}
summary('AE 合成 PSNR 测试');
