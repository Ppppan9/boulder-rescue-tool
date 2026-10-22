// AE JSX 脚本离线 mock：用最小 ExtendScript 对象模型运行 build_ae_project.jsx，
// 验证脚本能真正建立合成/图层/关键帧，并读取 __BOULDER_BUILD_STATS。
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ART, stage, check, eq, summary, log, readJson } from './helpers.mjs';

log('巨石营救 · AE JSX 脚本测试');
const artDir = path.join(ART, 'ae');
const projectDir = path.join(artDir, 'project');
if (!fs.existsSync(path.join(projectDir, 'timeline.json'))) {
  console.error('缺少 AE 导出产物，请先运行 node test/ae-export.mjs');
  process.exit(1);
}

const TL = await readJson(path.join(projectDir, 'timeline.json'));
const alerts = [];
const imported = [];
const createdComps = [];
const saved = [];

class Prop {
  constructor(value) { this.value = value; this.numKeys = 0; this.keys = []; this.interp = []; this.dimensionsSeparated = false; }
  setValue(v) { this.value = v; this.numKeys = 0; this.keys = []; }
  setValuesAtTimes(t, v) { this.keys = t.map((time, i) => [time, v[i]]); this.numKeys = t.length; this.value = v[v.length - 1]; }
  setInterpolationTypeAtKey(k, a, b) { this.interp[k] = [a, b]; }
  setValueAtTime(t, v) { this.keys.push([t, v]); this.numKeys = this.keys.length; }
}
class MarkerProp extends Prop {
  setValueAtTime(t, v) { this.keys.push([t, v]); this.numKeys = this.keys.length; this.value = v; }
}
class TransformGroup {
  constructor() {
    this.props = {
      'ADBE Anchor Point': new Prop([0, 0]),
      'ADBE Position': new Prop([360, 640]),
      'ADBE Position_0': new Prop(360),
      'ADBE Position_1': new Prop(640),
      'ADBE Scale': new Prop([100, 100]),
      'ADBE Rotate Z': new Prop(0),
      'ADBE Opacity': new Prop(100),
    };
  }
  property(name) { return this.props[name] || (this.props[name] = new Prop(0)); }
}
class AudioGroup {
  constructor() { this.levels = new Prop([0, 0]); }
  property(name) { if (name === 'ADBE Audio Levels') return this.levels; return new Prop(0); }
}
class Layer {
  constructor(source, name, comp) {
    this.source = source; this.name = name || (source && source.name) || 'Layer';
    this.comp = comp; this.startTime = 0; this.inPoint = 0; this.outPoint = comp.duration;
    this.label = 0; this.blendingMode = 'normal'; this.audioEnabled = true; this.comment = '';
    this.transform = new TransformGroup(); this.marker = new MarkerProp(); this.audio = new AudioGroup();
    this.parent = null;
  }
  property(name) {
    if (name === 'ADBE Transform Group') return this.transform;
    if (name === 'ADBE Marker') return this.marker;
    if (name === 'ADBE Audio Group') return this.audio;
    return new Prop(0);
  }
}
class Comp {
  constructor(name, w, h, duration, fps) {
    this.name = name; this.width = w; this.height = h; this.duration = duration; this.fps = fps;
    this.bgColor = [0, 0, 0]; this.parentFolder = null;
    this.layers = []; this.markerProperty = new MarkerProp(); this.typeName = 'Composition';
    this.layers.add = (item) => { const l = new Layer(item, item && item.name, this); this.layers.push(l); return l; };
    this.layers.addSolid = (solid, name, w2, h2) => { const l = new Layer({ name }, name, this); this.layers.push(l); return l; };
    createdComps.push(this);
  }
  openInViewer() { this.opened = true; }
}
class Folder {
  constructor(name) { this.name = name; this.parentFolder = null; this.typeName = 'Folder'; }
}
class Item {
  constructor(name) { this.name = name; this.parentFolder = null; this.typeName = 'Footage'; }
}
class FileMock {
  constructor(p) {
    this.fsName = String(p); this.name = path.basename(this.fsName);
    this.parent = { fsName: path.dirname(this.fsName) };
    this.exists = fs.existsSync(this.fsName); this.encoding = 'UTF-8'; this._text = '';
  }
  open() { try { this._text = fs.readFileSync(this.fsName, 'utf8'); return true; } catch { return false; } }
  read() { return this._text; }
  close() { this._open = false; }
}
class Project {
  constructor() { this.items = []; }
}
const makeProject = () => {
  const proj = {
    items: {
      addFolder(name) { const f = new Folder(name); proj._items.push(f); return f; },
      addComp(name, w, h, pa, duration, fps) { const c = new Comp(name, w, h, duration, fps); proj._items.push(c); return c; },
    },
    importFile(io) {
      const f = io.file; imported.push(f.fsName);
      const it = new Item(f.name); proj._items.push(it); return it;
    },
    _items: [],
    save(file) { saved.push(file.fsName); },
  };
  return proj;
};
const app = {
  project: makeProject(),
  newProject() { app.project = makeProject(); app.newProjectCalls = (app.newProjectCalls || 0) + 1; },
  beginUndoGroup() {}, endUndoGroup() {},
};
app.project = makeProject();

const sandbox = {
  File: FileMock,
  ImportOptions: class { constructor(f) { this.file = f; this.importAs = null; } canImportAs() { return true; } },
  ImportAsType: { FOOTAGE: 'footage' },
  KeyframeInterpolationType: { LINEAR: 1, HOLD: 2 },
  BlendingMode: { ADD: 'add' },
  MarkerValue: class { constructor(comment) { this.comment = comment; } },
  app,
  alert: (msg) => alerts.push(String(msg)),
  confirm: () => true,
  $: { fileName: path.join(projectDir, 'build_ae_project.jsx'), global: {} },
  console,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

stage('运行 build_ae_project.jsx');
const jsx = fs.readFileSync(path.join(projectDir, 'build_ae_project.jsx'), 'utf8');
let runError = null;
try { vm.runInContext(jsx, sandbox, { filename: 'build_ae_project.jsx', timeout: 60000 }); }
catch (e) { runError = e; }
check(!runError, 'JSX 在 mock 环境中无异常运行', runError && runError.message);
check(alerts.length > 0, 'JSX 输出了完成提示', alerts.length);
const alertText = alerts.join('\n');
log('  JSX 提示：' + alertText.slice(0, 1800));
check(/完成！/.test(alertText), '提示包含「完成！」', alertText.slice(0, 120));
check(!/缺少素材/.test(alertText), '没有缺少素材');
check(!/警告/.test(alertText), '没有图层/导入警告', alertText.split('\n').filter(l => /警告/.test(l)).join(' | '));

stage('合成 / 图层结构');
const main = createdComps.find(c => c.name === '主合成_巨石营救');
check(!!main, '创建主合成_巨石营救');
const sfx = createdComps.find(c => c.name === '音效_逐事件');
check(!!sfx, '创建音效_逐事件预合成');
const mainDef = TL.comps.find(c => c.id === 'main');
const sfxDef = TL.comps.find(c => c.id === 'sfx');
if (main) {
  eq(main.width, 720, '主合成宽 720');
  eq(main.height, 1280, '主合成高 1280');
  eq(main.fps, TL.meta.fps, '主合成帧率与 timeline 一致');
  eq(main.layers.length, mainDef.layers.length, '主合成图层数量与 timeline 一致');
  const names = main.layers.map(l => l.name);
  for (const fixed of ['手指', '结束页', '免责声明', '背景']) check(names.includes(fixed), 'mock 图层包含「' + fixed + '」');
  eq(main.layers[0].name, mainDef.layers[0].name, '第一层（最底）与 timeline 一致');
  eq(main.layers[main.layers.length - 1].name, mainDef.layers[mainDef.layers.length - 1].name, '最后一层（最上）与 timeline 一致');
  check(main.markerProperty.numKeys > 0, '主合成音效标记已建立', main.markerProperty.numKeys);
  const animated = main.layers.filter(l => l.transform.props['ADBE Position'].numKeys > 1 || l.transform.props['ADBE Position_0'].numKeys > 1);
  check(animated.length > 20, '多数图层建立了位置关键帧', animated.length);
  const scaled = main.layers.filter(l => l.transform.props['ADBE Scale'].numKeys > 1 || l.transform.props['ADBE Scale'].numKeys === 0 && Array.isArray(l.transform.props['ADBE Scale'].value));
  check(scaled.length > 20, '图层缩放属性已设置', scaled.length);
  const withOpacity = main.layers.filter(l => l.transform.props['ADBE Opacity'].numKeys > 1 || typeof l.transform.props['ADBE Opacity'].value === 'number');
  check(withOpacity.length > 20, '图层不透明度属性已设置', withOpacity.length);
  const separated = main.layers.filter(l => l.transform.props['ADBE Position'] && l.transform.props['ADBE Position'].dimensionsSeparated);
  check(separated.length > 10, '位置拆分为 X/Y 维度避免贝塞尔走样', separated.length);
} else {
  check(false, '主合成缺失，后续图层断言跳过');
}
if (sfx) {
  eq(sfx.layers.length, sfxDef.layers.length, '音效预合成图层数与 timeline 一致');
  check(sfx.layers.length > 0, '音效预合成含逐事件层', sfx.layers.length);
  const audioEvents = sfx.layers.every(l => l.startTime >= 0 && l.startTime <= TL.meta.duration + 0.1);
  check(audioEvents, '音效层时间在合成时长内');
}
eq(imported.length, TL.assets.length, '所有素材均被导入');
check(imported.every(f => fs.existsSync(f)), '导入路径均真实存在');
check(saved.length === 1 && /\.aep$/.test(saved[0]), 'confirm 后另存 .aep', saved.join(','));
check(app.newProjectCalls === 1, '脚本新建工程一次');
const stats = sandbox.$.global.__BOULDER_BUILD_STATS;
check(stats, '读取到 __BOULDER_BUILD_STATS');
if (stats) {
  log('  JSX 统计：' + JSON.stringify(stats));
  eq(stats.layers, mainDef.layers.length + sfxDef.layers.length, 'JSX 统计图层数一致');
  check(stats.keys > 1000, 'JSX 统计关键帧 >1000', stats.keys);
  check(stats.markers > 0, 'JSX 统计标记 >0', stats.markers);
}
summary('AE JSX 脚本测试');
