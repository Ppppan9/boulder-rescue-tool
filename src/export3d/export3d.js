// 巨石营救 · 3D 动画导出（浏览器内生成真实 glTF + FBX）
// 复用 AE 逐帧时间轴：每个 AE 图层 → 一块带贴图的平面，按元素类别放到不同景深，
// 形成一台可环绕观看的 2.5D 矿坑立体景箱；glTF/FBX 内含逐帧 TRS 动画与相机。
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { FBXExporter } from '@comfyorg/fbx-exporter-three';
import { makeZip } from '../ae/zip.js';
import PY_TEXT from './blender_import.py';
import README_TEXT from './README_3D.md';

const PX = 100;                 // 100 画布像素 = 1 世界单位
const CW = 720, CH = 1280;
const FOV = 30;                 // 垂直视角（与 Blender 脚本 camera.yfov 一致）
const CAM_D = (CH / 2 / PX) / Math.tan(FOV * Math.PI / 360);
const TOOL_ID = 'boulder-rescue-tool';

const r4 = v => Math.round(v * 10000) / 10000;
// 平面在 z 深度处要保持屏幕上与 z=0 一致的大小/位置，需要乘这个系数
const depthK = z => (CAM_D - z) / CAM_D;

// 每类元素的景深（世界单位，0 为 AE 主平面）。数值越大越靠近相机。
function depthOf(asset, name) {
  if (asset === 'background') return -2.55;
  if (asset === 'acid' || asset === 'bubble') return -2.25;
  if (asset === 'board') return -0.72;
  if (asset === 'slab') return -1.72;
  if (asset === 'pulley' || asset === 'weight' || asset === 'rope') return -1.58;
  if (asset === 'platform') return -1.24;
  if (asset.startsWith('hero_')) {
    if (asset === 'hero_shadow') return -1.30;
    if (asset === 'hero_leg_l') return -1.20;
    if (asset === 'hero_leg_r') return -1.18;
    if (asset === 'hero_body') return -1.13;
    if (asset === 'hero_arm_l') return -1.08;
    if (asset === 'hero_arm_r') return -1.04;
    if (asset === 'hero_head') return -0.98;
    return -1.1;
  }
  if (asset === 'tray') return 0.04;
  if (asset.startsWith('plank_')) return 0.15;
  if (asset.startsWith('screw_')) return 0.28;
  if (asset.startsWith('timer_') || asset.startsWith('digit_')) return 0.44;
  if (asset === 'caption') return 0.48;
  if (asset === 'disclaimer') return 0.50;
  if (asset === 'hint_ring') return 0.56;
  if (asset === 'match_ring' || asset === 'plus_time') return 0.60;
  if (['spark', 'spark_white', 'chip0', 'chip1', 'dust', 'flash_fail', 'flash_win', 'win_rays', 'escape_glow'].includes(asset)) return 0.72;
  if (asset.startsWith('end_')) return 0.92;
  if (asset === 'end_card_win' || asset === 'end_card_fail') return 0.88;
  if (asset === 'hand') return 2.35;
  return 0.2;
}

function safeName(raw, used) {
  let base = String(raw || 'Layer').replace(/[^\w\u4e00-\u9fa5.-]+/g, '_').replace(/^_+|_+$/g, '');
  if (!base) base = 'Layer';
  if (base.length > 46) base = base.slice(0, 46);
  let name = base, n = 2;
  while (used.has(name)) { name = base + '_' + n; n++; }
  used.add(name);
  return name;
}

function prop(P, fallback) {
  if (P == null) return { t: [0], v: [fallback] };
  if (Array.isArray(P) || typeof P === 'number') return { t: [0], v: [P] };
  if (P.t && P.t.length && P.v && P.v.length) return { t: P.t, v: P.v };
  return { t: [0], v: [fallback] };
}

function valuesAt(prop, i, fallback) {
  const v = prop.v[Math.min(i, prop.v.length - 1)];
  return Array.isArray(v) ? v : (v == null ? fallback : v);
}

function hasMotion(P) {
  if (!P || Array.isArray(P) || typeof P === 'number') return false;
  if (!P.t || P.t.length < 2) return false;
  const first = JSON.stringify(P.v[0]);
  return P.v.some(v => JSON.stringify(v) !== first);
}

function flatPositions(pr, z) {
  const out = [];
  for (let i = 0; i < pr.t.length; i++) {
    const v = valuesAt(pr, i, [0, 0]);
    const k = depthK(z);                 // 让不同景深的平面在相机里仍对齐网页坐标
    out.push((v[0] - CW / 2) / PX * k, (CH / 2 - v[1]) / PX * k, z);
  }
  return out;
}

async function textureFromPng(data) {
  const blob = new Blob([data], { type: 'image/png' });
  const bitmap = await createImageBitmap(blob);
  const tex = new THREE.Texture(bitmap);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = true;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function rgbaFromHex(hex, alpha = 1) {
  const c = new THREE.Color(hex || '#000000');
  return [c.r, c.g, c.b, alpha];
}

export async function export3DAnimation({ rec, S, recorder, canvas } = {}) {
  if (!rec || !rec.frames || rec.frames < 2) {
    throw new Error('没有可导出的记录：请先自动通关或开启 AE 记录后手动游玩');
  }
  const fps = Math.max(1, +(S.export3dFps || 30));
  const So = {
    aeFps: String(fps), aeSampling: 'bake', aeNames: 'en',
    aeAudio: 'both', aeSize: 'canvas',
  };
  // 复用 AE 记录器的采样/命名/音频与 PNG 导出，保证屏幕、AE、3D 三份结果同源。
  const ae = await recorder.exportZip(rec, So);
  const TL = ae.timeline;
  const D = TL.meta.duration;
  const frameEnd = Math.max(1, Math.round(D * fps));
  const files = ae.fileList || [];
  const fileMap = new Map(files.map(f => [f.name, f]));

  const imageAssets = TL.assets.filter(a => /\.png$/i.test(a.file));
  const used = new Set();
  const scene = new THREE.Scene();
  scene.name = 'BoulderRescue_3D';
  scene.background = new THREE.Color('#070509');

  const camera = new THREE.PerspectiveCamera(FOV, CW / CH, 0.05, 120);
  camera.name = 'Camera_Boulder';
  camera.position.set(0, 0, CAM_D);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  scene.add(camera);

  const sun = new THREE.DirectionalLight('#ffe6bd', 1.6);
  sun.name = 'Sun_Key';
  sun.position.set(3.4, 6.2, 9.5);
  scene.add(sun);
  const fill = new THREE.HemisphereLight('#ffdca8', '#16202a', 0.75);
  fill.name = 'Ambient_Fill';
  scene.add(fill);

  // 远景底板：相机在 Blender 里稍微环绕时不至于看到虚空。
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 34),
    new THREE.MeshBasicMaterial({ color: '#070509', depthWrite: false }),
  );
  backdrop.name = 'Stage_Backdrop';
  backdrop.position.set(0, 0, -3.1);
  scene.add(backdrop);

  const textures = new Map();
  const bitmaps = [];
  await Promise.all(imageAssets.map(async a => {
    const f = fileMap.get(a.file);
    if (!f) throw new Error('缺少 3D 贴图：' + a.file);
    const tex = await textureFromPng(f.data);
    tex.name = a.id;
    textures.set(a.id, tex);
    bitmaps.push(tex.image);
  }));

  const clips = [];
  const nodes = [];
  const opacity = {};
  const statsLayers = [];
  const meshes = [];

  const mainComp = TL.comps.find(c => c.id === TL.mainComp) || TL.comps[TL.comps.length - 1];
  for (const layer of mainComp.layers) {
    if (!layer.src || !layer.src.asset) continue;
    const assetId = layer.src.asset;
    const assetMeta = TL.assets.find(a => a.id === assetId);
    if (!assetMeta || !textures.has(assetId)) continue;         // 音频层等
    if (!S.export3dHand && (assetId === 'hand' || String(assetId).includes('ripple'))) continue;
    const tex = textures.get(assetId);
    const img = tex.image;
    const z = depthOf(assetId, layer.name);
    const k = depthK(z);
    const visName = safeName(layer.name + '_vis', used);
    const meshName = safeName(layer.name, used);
    const matName = safeName('mat_' + meshName, used);

    const an = prop(layer.tr.anchor, [img.width / 2, img.height / 2]);
    const a0 = valuesAt(an, 0, [img.width / 2, img.height / 2]);
    const ax = Math.max(0, Math.min(1, a0[0] / img.width));
    const ay = Math.max(0, Math.min(1, a0[1] / img.height));
    const geo = new THREE.PlaneGeometry(img.width / PX, img.height / PX);
    // AE 图层位置对应锚点；把几何体平移到锚点，缩放/旋转才会围绕同一点发生
    geo.translate((0.5 - ax) * img.width / PX, (ay - 0.5) * img.height / PX, 0);
    const mat = new THREE.MeshBasicMaterial({
      map: tex, name: matName, transparent: true, opacity: 1, alphaTest: 0.004,
      side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = meshName;
    mesh.frustumCulled = false;
    mesh.userData = { asset: assetId, z, in: layer.in, out: layer.out, boulder: TOOL_ID };
    const vis = new THREE.Group();
    vis.name = visName;
    vis.position.set(0, 0, z);
    vis.add(mesh);
    scene.add(vis);
    meshes.push(mesh);

    const pos = prop(layer.tr.position, [CW / 2, CH / 2]);
    const sc = prop(layer.tr.scale, [100, 100]);
    const rot = prop(layer.tr.rotation, 0);
    const op = prop(layer.tr.opacity, 100);

    const pos0 = flatPositions(pos, z);
    vis.position.set(pos0[0], pos0[1], z);
    const s0 = valuesAt(sc, 0, [100, 100]);
    mesh.scale.set(s0[0] / 100 * k, s0[1] / 100 * k, 1);
    const r0 = valuesAt(rot, 0, 0) * Math.PI / 180;
    mesh.rotation.set(0, 0, -r0);
    mat.opacity = Math.max(0, Math.min(1, valuesAt(op, 0, 100) / 100));

    const tracks = [];
    if (hasMotion(pos)) {
      tracks.push(new THREE.VectorKeyframeTrack(visName + '.position', pos.t, flatPositions(pos, z)));
    }
    if (hasMotion(sc)) {
      const vals = [];
      for (let i = 0; i < sc.t.length; i++) {
        const s = valuesAt(sc, i, [100, 100]);
        vals.push(s[0] / 100 * k, s[1] / 100 * k, 1);
      }
      tracks.push(new THREE.VectorKeyframeTrack(meshName + '.scale', sc.t, vals));
    }
    if (hasMotion(rot)) {
      const times = [], vals = [];
      for (let i = 0; i < rot.t.length; i++) {
        const rr = -valuesAt(rot, i, 0) * Math.PI / 180;
        times.push(rot.t[i]);
        vals.push(0, 0, Math.sin(rr / 2), Math.cos(rr / 2));
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(meshName + '.quaternion', times, vals));
    }

    // 显隐：AE 的入点/出点 → 父级 scale 的 STEP 关键帧（FBX/glTF 都能携带）。
    const inT = typeof layer.in === 'number' ? layer.in : 0;
    const outT = typeof layer.out === 'number' ? layer.out : D;
    if (inT > 0.0005 || outT < D - 0.0005) {
      const start = inT > 0.0005 ? 0 : 1;
      const times = [0], vals = [start, start, start];
      if (inT > 0.0005) { times.push(inT); vals.push(1, 1, 1); }
      if (outT < D - 0.0005) { times.push(outT); vals.push(0, 0, 0); }
      const vt = new THREE.VectorKeyframeTrack(visName + '.scale', times, vals);
      vt.setInterpolation(THREE.InterpolateDiscrete);
      tracks.push(vt);
      vis.scale.setScalar(inT > 0.0005 ? 0 : 1);
    }

    // 不透明度：glTF/FBX 动画通道不含材质，写入 scene3d.json，由 Blender 脚本逐帧驱动。
    if (op.t.length && (op.t.length > 1 || valuesAt(op, 0, 100) < 99.9)) {
      const curve = [];
      let last = null;
      for (let i = 0; i < op.t.length; i++) {
        const v = r4(Math.max(0, Math.min(100, valuesAt(op, i, 100))) / 100);
        if (last == null || Math.abs(v - last) > 0.0005) { curve.push([r4(op.t[i]), v]); last = v; }
      }
      if (curve.length) opacity[meshName] = curve;
    }

    if (tracks.length) clips.push(...tracks);
    statsLayers.push(meshName);
    nodes.push({
      name: visName, mesh: meshName, material: matName, asset: assetId,
      z: r4(z), in: r4(inT), out: r4(outT), w: img.width, h: img.height,
      depthScale: r4(k),
    });
  }

  const clip = new THREE.AnimationClip('BoulderRescue_Main', D, clips);
  scene.animations = [clip];

  // ---------- glTF / GLB ----------
  const gltf = new GLTFExporter();
  const glbBuf = await gltf.parseAsync(scene, {
    binary: true, animations: [clip], embedImages: true,
    maxTextureSize: 2048, onlyVisible: false, trs: false,
  });
  const glb = new Uint8Array(glbBuf);

  // ---------- FBX（真实二进制文件；Blender 预设：Y 轴向上、单位 ×100） ----------
  const fbx = new FBXExporter();
  const fbxRaw = await fbx.parseAsync(scene, {
    preset: 'blender', fps, embedTextures: true,
    animations: [clip], includeAnimations: true, onlyVisible: false,
    // Blender 5.1 的 FBX 导入器读取灯光时会因 CyclesLightSettings.cast_shadow 报错；
    // 贴图本身就是最终像素、以自发光还原，FBX 里无需灯光，跳过以免阻断导入。
    objectFilter: (o) => !o.isLight,
    creator: 'boulder-rescue-tool / three.js',
  });
  const fbxBytes = fbxRaw instanceof Uint8Array ? fbxRaw : new Uint8Array(fbxRaw);

  const d = new Date(), p2 = x => String(x).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;

  // ---------- 音频 ----------
  const audioFiles = [];
  const seeAudio = Array.from(fileMap.values()).filter(f => /^audio\/.+\.wav$/i.test(f.name));
  for (const f of seeAudio) audioFiles.push(f);
  const tracked = audioFiles.map(f => ({ t: 0, file: f.name, db: 0 }));
  const audioEvents = (rec.sfx || []).map(e => ({
    t: r4(e.t), file: `audio/sfx_${e.name}.wav`, db: 0,
  })).filter(e => seeAudio.some(f => f.name === e.file));
  const mixFile = seeAudio.find(f => f.name === 'audio/mix.wav');

  const meta = {
    format: 'export3d/1',
    tool: TOOL_ID,
    created: d.toISOString(),
    fps, width: CW, height: CH, duration: r4(D),
    frames: frameEnd + 1, frameStart: 0, frameEnd,
    units: '1 unit = 100 canvas px',
    exports: {
      glb: 'scene.glb', fbx: 'scene.fbx',
      blender: 'blender_import.py', readme: 'README_3D.md',
    },
    camera: {
      name: camera.name, type: 'perspective', yfov: FOV,
      near: 0.05, far: 120, aspect: r4(CW / CH),
      position: [0, 0, r4(CAM_D)], rotation: [0, 0, 0], lookAt: [0, 0, 0],
      note: '各平面按景深做了投影补偿；在 z=0 处画面与网页 720×1280 逐像素对齐',
    },
    world: {
      background: '#070509',
      ambient: { sky: '#ffdca8', ground: '#16202a', intensity: 0.75 },
      sun: { color: '#ffe6bd', intensity: 1.6, position: [3.4, 6.2, 9.5] },
    },
    nodes,
    visibility: '*_vis 节点 scale=1 显示 / 0 隐藏（STEP）；手指仅在 endCardHand / export3dHand 允许时出现',
    opacity,
    audio: audioEvents,
    mix: mixFile ? { file: 'audio/mix.wav', gain: 1 } : null,
    audioFiles: tracked,
    source: {
      aeTimeline: 'timeline.json', aeFps: TL.meta.fps, aeWidth: TL.meta.width, aeHeight: TL.meta.height,
      sampling: 'bake', names: 'en',
    },
    stats: {
      planes: nodes.length, animatedNodes: Object.keys(opacity).length,
      tracks: clips.length, frames: frameEnd, duration: r4(D),
      fps, audio: audioEvents.length, camera: camera.name,
      glbBytes: glb.length, fbxBytes: fbxBytes.length,
    },
    note: '平面朝 +Z，单位为 1=100px；可见性/不透明度由 Blender 脚本按本文件还原。',
  };
  const scene3d = JSON.stringify(meta, null, 2);
  const timelineText = JSON.stringify(TL);

  const enc = new TextEncoder();
  const filesOut = [
    { name: 'scene.glb', data: glb },
    { name: 'scene.fbx', data: fbxBytes },
    { name: 'scene3d.json', data: enc.encode(scene3d) },
    { name: 'blender_import.py', data: enc.encode(PY_TEXT) },
    { name: 'README_3D.md', data: enc.encode(README_TEXT) },
    { name: 'timeline.json', data: enc.encode(timelineText) },
    ...audioFiles,
  ];
  const blob = makeZip(filesOut);

  const result = {
    blob,
    name: `boulder_3d_export_${stamp}.zip`,
    meta,
    timeline: TL,
    stats: {
      layers: nodes.length,
      frames: frameEnd,
      duration: r4(D),
      tracks: clips.length,
      glbBytes: glb.length,
      fbxBytes: fbxBytes.length,
      zipBytes: blob.size,
      audio: audioEvents.length,
      fps,
      camera: camera.name,
    },
    fileList: filesOut,
    scene,
  };

  // 让测试/二次导出仍能拿到场景；真正的资源在 zip 中，不在这里下载贴图。
  return result;
}
