// 3D 导出：真实浏览器生成 scene.glb / scene.fbx / scene3d.json / 音频，
// 再用 Blender 无头导入、重建材质/显隐/透明度、渲染抽帧并校验报告。
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  ROOT, BLENDER, serve, launch, newPage, waitGame, autoToEnd, nextDownload,
  unzip, readJson, writeJson, check, eq, near, summary, log, stage, ensureArt, imageStats,
} from './helpers.mjs';

log('巨石营救 · 3D 导出 / Blender 联调测试');
const artDir = await ensureArt('3d');
const projectDir = path.join(artDir, 'project');
const renderDir = path.join(artDir, 'render');
const latestFile = path.join(artDir, 'latest.json');
const server = await serve(ROOT);
const browser = await launch();
let page, context, errors;

const readGlb = (buf) => {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const magic = String.fromCharCode(...u8.slice(0, 4));
  const version = dv.getUint32(4, true);
  const length = dv.getUint32(8, true);
  let off = 12, json = null, binLen = 0;
  while (off + 8 <= u8.length) {
    const n = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    const data = u8.slice(off + 8, off + 8 + n);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(data));
    if (type === 0x004e4942) binLen = n;
    off += 8 + n + ((4 - (n % 4)) % 4);
  }
  return { magic, version, length, fileLength: u8.length, json, binLen };
};

async function imageDiff(aUrl, bUrl) {
  return page.evaluate(async ([ua, ub]) => {
    const load = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
    const [a, b] = await Promise.all([load(ua), load(ub)]);
    const c = document.createElement('canvas'); c.width = 180; c.height = 320;
    const g = c.getContext('2d', { willReadFrequently: true });
    const read = (im) => { g.clearRect(0, 0, 180, 320); g.drawImage(im, 0, 0, 180, 320); return g.getImageData(0, 0, 180, 320).data; };
    const da = read(a), db = read(b);
    let sum = 0, changed = 0;
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
      sum += d / 3;
      if (d > 18) changed++;
    }
    const n = da.length / 4;
    return { mae: sum / n, changed: changed / n };
  }, [aUrl, bUrl]);
}

try {
  ({ page, context, errors } = await newPage(browser, { width: 1280, height: 900 }));
  await page.goto(server.origin + '/index.html', { waitUntil: 'load', timeout: 60000 });
  await waitGame(page);

  stage('自动通关并录制');
  const run = await autoToEnd(page, {
    timeout: 180000,
    extra: { sfxMute: false, handShow: true, endCardHand: true, endCard: true, export3dHand: true, export3dFps: 30 },
  });
  eq(run.won, true, '自动通关成功');
  eq(run.recFrames > 60, true, '录制帧数足够');
  check(run.recSfx > 0, '录制包含音效事件', run.recSfx);

  stage('浏览器生成 3D ZIP');
  const zip = await nextDownload(page, () => page.evaluate(() => __game.export3D()), artDir, 300000);
  check(/^boulder_3d_export_\d{8}_\d{6}\.zip$/.test(path.basename(zip)), 'ZIP 命名符合规范', path.basename(zip));
  check(fs.existsSync(zip), 'ZIP 已落盘');
  const zipSize = (await fsp.stat(zip)).size;
  check(zipSize > 120000, 'ZIP 体积非空', zipSize);
  const out = await unzip(zip, projectDir);
  const entries = (await fsp.readdir(out)).sort();
  for (const f of ['scene.glb', 'scene.fbx', 'scene3d.json', 'blender_import.py', 'README_3D.md', 'timeline.json']) {
    check(entries.includes(f), 'ZIP 包含 ' + f);
  }
  check(fs.existsSync(path.join(out, 'audio', 'mix.wav')), 'ZIP 包含 audio/mix.wav');
  const audioFiles = await fsp.readdir(path.join(out, 'audio'));
  check(audioFiles.filter(f => /^sfx_.+\.wav$/.test(f)).length > 0, 'ZIP 包含独立音效 wav', audioFiles.join(','));

  stage('scene3d.json');
  const meta = await readJson(path.join(out, 'scene3d.json'));
  eq(meta.format, 'export3d/1', 'format 为 export3d/1');
  eq(meta.tool, 'boulder-rescue-tool', 'tool 标识正确');
  eq(meta.width, 720, '宽度 720');
  eq(meta.height, 1280, '高度 1280');
  eq(meta.fps, 30, '帧率 30');
  check(meta.duration > 1, '时长有效', meta.duration);
  check(meta.frames === meta.frameEnd + 1, '帧数 = frameEnd + 1', meta.frames + '/' + meta.frameEnd);
  check(meta.frameStart === 0, '起始帧为 0');
  eq(meta.camera.name, 'Camera_Boulder', '相机名称');
  near(meta.camera.yfov, 30, .01, '相机垂直视角 30°');
  check(Array.isArray(meta.nodes) && meta.nodes.length > 60, '节点数量足够', meta.nodes && meta.nodes.length);
  check(Array.isArray(meta.audio) && meta.audio.length > 0, '音频事件存在', meta.audio && meta.audio.length);
  eq(meta.mix.file, 'audio/mix.wav', '混音轨指向 audio/mix.wav');
  check(meta.audioFiles.some(f => f.file === 'audio/mix.wav'), 'audioFiles 含混音轨');
  check(meta.stats.planes === meta.nodes.length, 'stats.planes 与节点数一致');
  check(meta.stats.tracks > 20, '动画轨道数足够', meta.stats.tracks);
  check(meta.stats.frames === meta.frameEnd, 'stats.frames 正确');
  check(meta.stats.glbBytes > 100000, 'GLB 体积记录有效', meta.stats.glbBytes);
  check(meta.stats.fbxBytes > 100000, 'FBX 体积记录有效', meta.stats.fbxBytes);
  check(meta.stats.fps === 30, 'stats.fps 正确');
  check(meta.stats.audio > 0, 'stats.audio 正确', meta.stats.audio);
  eq(meta.stats.camera, 'Camera_Boulder', 'stats.camera 正确');
  const nodeNames = new Set(meta.nodes.map(n => n.name));
  const meshNames = new Set(meta.nodes.map(n => n.mesh));
  eq(meshNames.size, meta.nodes.length, '网格名称唯一');
  eq(nodeNames.size, meta.nodes.length, '节点名称唯一');
  check(meta.nodes.every(n => n.name && n.mesh && n.material && n.asset && Number.isFinite(n.z) && Number.isFinite(n.in) && Number.isFinite(n.out) && n.w > 0 && n.h > 0), '节点字段完整');
  check(meta.nodes.every(n => n.in >= 0 && n.out <= meta.duration + 1e-6 && n.out >= n.in), '节点入出点有效');
  check(meta.nodes.some(n => n.asset === 'background'), '包含背景节点');
  check(meta.nodes.some(n => n.asset === 'board'), '包含棋盘节点');
  check(meta.nodes.some(n => n.asset.startsWith('screw_')), '包含螺丝节点');
  check(meta.nodes.some(n => n.asset.startsWith('plank_')), '包含木板节点');
  check(meta.nodes.some(n => n.asset === 'hand'), '包含手指节点（export3dHand=true）');
  check(meta.nodes.some(n => n.asset.startsWith('end_card')), '包含结束页节点');
  check(Object.keys(meta.opacity).length > 5, '不透明度曲线存在', Object.keys(meta.opacity).length);
  for (const [name, curve] of Object.entries(meta.opacity)) {
    check(meshNames.has(name), '不透明度曲线对应网格 ' + name);
    check(Array.isArray(curve) && curve.length >= 1 && curve.every((k, i) => Array.isArray(k) && Number.isFinite(k[0]) && k[1] >= 0 && k[1] <= 1 && (i === 0 || k[0] >= curve[i - 1][0])), '不透明度曲线格式 ' + name);
  }
  check(typeof meta.visibility === 'string' && meta.visibility.includes('*_vis'), '显隐说明包含 *_vis');
  check(meta.audio.every(e => Number.isFinite(e.t) && e.t >= 0 && e.t <= meta.duration && fs.existsSync(path.join(out, e.file))), '音效事件文件存在');
  await writeJson(latestFile, { zip: path.basename(zip), zipSize, meta: {
    format: meta.format, tool: meta.tool, fps: meta.fps, frames: meta.frames, duration: meta.duration,
    nodes: meta.nodes.length, tracks: meta.stats.tracks, audio: meta.audio.length,
    glbBytes: meta.stats.glbBytes, fbxBytes: meta.stats.fbxBytes, zipBytes: meta.stats.zipBytes,
  } });

  stage('GLB / FBX 二进制');
  const glbBuf = await fsp.readFile(path.join(out, 'scene.glb'));
  const glb = readGlb(glbBuf);
  eq(glb.magic, 'glTF', 'GLB 魔数正确');
  eq(glb.version, 2, 'GLB 版本 2');
  eq(glb.length, glb.fileLength, 'GLB 头部长度与文件一致');
  check(glb.binLen > 10000, 'GLB BIN 块非空', glb.binLen);
  check(glb.json && glb.json.asset && /^2\./.test(glb.json.asset.version), 'GLB asset.version 为 2.x');
  check(glb.json.meshes && glb.json.meshes.length >= meta.nodes.length, 'GLB 网格数覆盖全部图层', glb.json.meshes && glb.json.meshes.length);
  check(glb.json.animations && glb.json.animations.length >= 1, 'GLB 含动画');
  check(glb.json.animations[0].channels.length === meta.stats.tracks, 'GLB 动画通道数与导出记录一致', glb.json.animations[0].channels.length + '/' + meta.stats.tracks);
  check(glb.json.images && glb.json.images.length > 20, 'GLB 贴图数量足够', glb.json.images && glb.json.images.length);
  check(glb.json.images.every(im => im.bufferView != null && !im.uri), 'GLB 贴图内嵌');
  check(glb.json.nodes && glb.json.nodes.length > meta.nodes.length, 'GLB 节点树包含载体节点');
  check(glb.json.materials && glb.json.materials.length >= meta.nodes.length, 'GLB 材质数覆盖全部图层', glb.json.materials && glb.json.materials.length);

  const fbxBuf = await fsp.readFile(path.join(out, 'scene.fbx'));
  const fbxMagic = fbxBuf.slice(0, 21).toString('utf8');
  check(fbxMagic === 'Kaydara FBX Binary  \x00', 'FBX 二进制魔数正确', JSON.stringify(fbxMagic));
  const fbxVersion = fbxBuf.readUInt32LE(23);
  check(fbxVersion >= 7100 && fbxVersion <= 7600, 'FBX 版本有效', fbxVersion);
  check(fbxBuf.length > 100000, 'FBX 体积非空', fbxBuf.length);
  eq(meta.stats.glbBytes, glbBuf.length, 'GLB 体积记录与实际文件一致');
  eq(meta.stats.fbxBytes, fbxBuf.length, 'FBX 体积记录与实际文件一致');
  check(fbxBuf.includes(Buffer.from('boulder-rescue-tool')), 'FBX 内含工具标识');
  check(fbxBuf.includes(Buffer.from('Camera_Boulder')), 'FBX 内含相机名称');
  check(fbxBuf.includes(Buffer.from(meta.nodes[0].mesh)), 'FBX 内含图层网格名称');

  stage('timeline.json 与 AE 同源');
  const tl = await readJson(path.join(out, 'timeline.json'));
  check(tl.meta && Math.abs(tl.meta.duration - meta.duration) < 0.002, 'timeline 与 scene3d 时长一致', tl.meta && tl.meta.duration + '/' + meta.duration);
  check(tl.meta.width === 720 && tl.meta.height === 1280, 'timeline 画布尺寸正确');
  check(Array.isArray(tl.assets) && tl.assets.length > 20, 'timeline 素材列表完整', tl.assets && tl.assets.length);
  check(Array.isArray(tl.comps) && tl.comps.length > 0, 'timeline 合成列表存在');
  check(tl.comps.some(c => c.id === tl.mainComp), 'timeline 主合成存在');
  const assetIds = new Set(tl.assets.map(a => a.id));
  check(meta.nodes.every(n => assetIds.has(n.asset)), '所有 3D 节点素材来自 timeline');
  check(tl.meta.duration > 1 && tl.meta.fps > 0, 'timeline meta 有效');
  check(meta.source && meta.source.aeTimeline === 'timeline.json', 'meta.source 指向 timeline.json');

  stage('Blender 无头导入');
  check(fs.existsSync(BLENDER), '找到 Blender', BLENDER);
  const renderTimes = [0.6, +(meta.duration * 0.35).toFixed(2), +(meta.duration * 0.8).toFixed(2)];
  const renderArg = renderTimes.map(t => t + 's').join(',');
  await fsp.rm(renderDir, { recursive: true, force: true });
  await fsp.mkdir(renderDir, { recursive: true });
  const py = path.join(out, 'blender_import.py');
  let bl = spawnSync(BLENDER, [
    '--background', '--factory-startup', '--python', py, '--',
    '--dir', out, '--out', renderDir, '--render', renderArg, '--verify',
  ], { encoding: 'utf8', timeout: 600000, maxBuffer: 1024 * 1024 * 64 });
  const blOut = (bl.stdout || '') + '\n' + (bl.stderr || '');
  await fsp.writeFile(path.join(artDir, 'blender.log'), blOut);
  eq(bl.status, 0, 'Blender 导入/渲染退出码为 0');
  const line = blOut.split(/\r?\n/).reverse().find(l => l.includes('EXPORT3D_REPORT '));
  check(!!line, 'Blender 输出导出报告');
  let report = null;
  if (line) {
    try { report = JSON.parse(line.slice(line.indexOf('EXPORT3D_REPORT ') + 'EXPORT3D_REPORT '.length)); } catch (e) { check(false, 'Blender 报告可解析：' + e.message); }
  }
  if (report) {
    await writeJson(path.join(artDir, 'blender-report.json'), report);
    check(report.objects > 60, '导入对象数足够', report.objects);
    check(report.meshes >= meta.nodes.length, 'Blender 网格数覆盖 scene3d 图层', report.meshes);
    check(report.meshes > 60, 'Blender 网格数 > 60', report.meshes);
    check(report.empties > 60, 'Blender 可见性空节点存在', report.empties);
    check(report.cameras === 1, 'Blender 相机数量 1', report.cameras);
    check(report.camera === 'Camera_Boulder', 'Blender 活动相机正确', report.camera);
    check(report.actions >= 1, 'Blender 动作存在', report.actions);
    check(report.keyframes > 100, 'Blender 关键帧数量足够', report.keyframes);
    check(report.opacity_curves > 5, 'Blender 重建透明度曲线', report.opacity_curves);
    check(report.vis_overrides > 10, 'Blender 重建 STEP 显隐', report.vis_overrides);
    check(report.sound_strips > 3, 'Blender 音轨条数足够', report.sound_strips);
    check(report.resolution[0] === 720 && report.resolution[1] === 1280, 'Blender 分辨率 720×1280');
    check(!report.problems || report.problems.length === 0, 'Blender 校验无问题', (report.problems || []).join(' | '));
    check(Array.isArray(report.renders) && report.renders.length === renderTimes.length, 'Blender 渲染帧数正确', report.renders && report.renders.length);
  }

  stage('渲染帧检查');
  const renderFiles = (await fsp.readdir(renderDir)).filter(f => /^render_.+\.png$/.test(f)).sort();
  eq(renderFiles.length, renderTimes.length, '渲染 PNG 数量正确');
  const shots = [];
  for (const f of renderFiles) {
    const url = server.origin + '/test/artifacts/3d/render/' + f;
    const st = await imageStats(page, url);
    shots.push({ file: f, ...st });
    check(st.mean > 8, f + ' 非黑', JSON.stringify(st));
    check(st.litRatio > .1, f + ' 有足够亮部', JSON.stringify(st));
    check(st.colors > 20, f + ' 颜色丰富', JSON.stringify(st));
    const p = path.join(artDir, 'render-' + f);
    await fsp.copyFile(path.join(renderDir, f), p);
  }
  if (shots.length >= 2) {
    const diff = await imageDiff(
      server.origin + '/test/artifacts/3d/render/' + renderFiles[0],
      server.origin + '/test/artifacts/3d/render/' + renderFiles[renderFiles.length - 1],
    );
    check(diff.changed > .05, '不同时间点渲染画面不同', JSON.stringify(diff));
    await writeJson(path.join(artDir, 'render-diff.json'), diff);
  }

  stage('Blender 读取浏览器 FBX');
  const fbxCheckPy = path.join(artDir, 'fbx_check.py');
  await fsp.writeFile(fbxCheckPy, `# -*- coding: utf-8 -*-
import bpy, json, sys, os
path = sys.argv[sys.argv.index('--') + 1]
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.fbx(filepath=path, use_anim=True, automatic_bone_orientation=False)
rep = {
  'objects': len(bpy.data.objects),
  'meshes': sum(1 for o in bpy.data.objects if o.type == 'MESH'),
  'empties': sum(1 for o in bpy.data.objects if o.type == 'EMPTY'),
  'cameras': sum(1 for o in bpy.data.objects if o.type == 'CAMERA'),
  'actions': len(bpy.data.actions),
  'has_camera': any(o.name.startswith('Camera_Boulder') for o in bpy.data.objects if o.type == 'CAMERA'),
  'has_hand': any('Hand' in o.name or '手' in o.name for o in bpy.data.objects),
}
print('FBX_REPORT ' + json.dumps(rep))
`);
  let fb = spawnSync(BLENDER, ['--background', '--factory-startup', '--python', fbxCheckPy, '--', path.join(out, 'scene.fbx')], {
    encoding: 'utf8', timeout: 600000, maxBuffer: 1024 * 1024 * 32,
  });
  const fbOut = (fb.stdout || '') + '\n' + (fb.stderr || '');
  await fsp.writeFile(path.join(artDir, 'blender-fbx.log'), fbOut);
  eq(fb.status, 0, 'Blender 读取 FBX 退出码为 0');
  const fbxLine = fbOut.split(/\r?\n/).reverse().find(l => l.includes('FBX_REPORT '));
  check(!!fbxLine, 'Blender 输出 FBX 报告');
  if (fbxLine) {
    const fr = JSON.parse(fbxLine.slice(fbxLine.indexOf('FBX_REPORT ') + 'FBX_REPORT '.length));
    await writeJson(path.join(artDir, 'blender-fbx-report.json'), fr);
    check(fr.meshes > 60, 'FBX 导入网格数足够', fr.meshes);
    check(fr.objects > 60, 'FBX 导入对象数足够', fr.objects);
    check(fr.actions >= 1, 'FBX 含动画动作', fr.actions);
    check(fr.has_camera, 'FBX 含相机');
    check(fr.has_hand, 'FBX 含手指图层');
  }

  check(errors.length === 0, '全程无 console/page 错误', errors.slice(0, 3).join(' | '));
} catch (e) {
  check(false, '测试异常：' + e.message);
  console.error(e);
} finally {
  if (context) await context.close().catch(() => {});
  await browser.close().catch(() => {});
  await server.close();
}
summary('3D 导出 / Blender 联调测试');
