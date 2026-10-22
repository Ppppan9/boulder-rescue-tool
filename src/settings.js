// 巨石营救 · 设置定义（通用键名与 TOOLKIT_STANDARD 保持一致；工具专有参数放在前面的专有分组）
import { DEFAULT_HAND } from './default_hand.js';
import { h5DeviceSelectOptions } from './h5/index.js';

export const SETTINGS_VERSION = 1;
export const STORE_KEY = 'boulderRescueTool.settings';
export const APP_ID = 'boulder-rescue-tool';

// [key, 标签, 类型, 默认, min/max/step 或选项, ...] 类型: range/color/bool/select/text/file/button
export const GROUPS = [
  ['关卡与棋盘', [
    ['level', '关卡', 'select', 'reference', [['reference', '参考关卡（7×6 螺丝迷宫）'], ['random', '随机生成（保证可解）'], ['image', '导入透明图形生成']]],
    ['seed', '随机种子', 'range', 1, 1, 9999, 1],
    ['cols', '列数', 'range', 7, 4, 8, 1],
    ['rows', '行数', 'range', 6, 3, 8, 1],
    ['colorCount', '螺丝颜色数', 'range', 4, 3, 5, 1],
    ['traySlots', '托盘槽位', 'range', 3, 3, 5, 1],
    ['timeLimit', '倒计时(秒)', 'range', 90, 30, 240, 5],
    ['matchBonus', '三消加时(秒)', 'range', 3, 0, 15, 1],
    ['failOnJam', '托盘卡死即失败', 'bool', true],
    ['ruleNote', '规则：点击螺丝放进托盘，3 颗同色自动消除；托盘塞满异色即失败', 'note'],
    ['shapeImg', '上传透明 PNG/WebP（alpha 区域变成螺丝棋盘）', 'file', ''],
    ['shapeThreshold', 'Alpha 阈值', 'range', 0.5, 0.05, 0.95, 0.01],
    ['shapeCover', '格子覆盖比例', 'range', 0.5, 0.1, 0.9, 0.01],
    ['shapeSeed', '图形关卡种子', 'range', 1, 1, 9999, 1],
  ]],
  ['节奏与提示', [
    ['takeoffDur', '拧起 → 飞入托盘(ms)', 'range', 460, 120, 1200, 10],
    ['tripleDur', '同色三消动画(ms)', 'range', 560, 180, 1500, 10],
    ['plankFallDur', '木板坠落(ms)', 'range', 520, 120, 1600, 10],
    ['riseDur', '平台上升(ms)', 'range', 720, 150, 2200, 10],
    ['failDur', '失败塌方(ms)', 'range', 1000, 300, 2600, 10],
    ['winDur', '通关演出(ms)', 'range', 1500, 400, 4000, 10],
    ['hintShow', '闲置时高亮下一步螺丝', 'bool', true],
    ['hintDelay', '闲置多久出现提示(ms)', 'range', 6000, 1500, 20000, 500],
    ['captionShow', '顶部字幕', 'bool', true],
    ['captionText', '字幕文字', 'text', '拆光螺丝 救出矿工'],
    ['captionY', '字幕 Y', 'range', 56, 20, 180, 1],
    ['discShow', '显示底部免责声明', 'bool', true],
    ['discText', '免责声明文字', 'text', '广告创意演示：实际玩法与奖励以游戏内为准'],
    ['discY', '免责声明距底(px)', 'range', 10, 0, 160, 1],
    ['discSize', '免责声明字号', 'range', 18, 10, 34, 1],
  ]],
  ['美术与场景', [
    ['brickColor', '砖墙主色', 'color', '#5b3b3b'],
    ['brickDark', '砖墙暗色', 'color', '#332125'],
    ['rockColor', '巨石青色', 'color', '#2d6575'],
    ['rockLight', '巨石亮色', 'color', '#61aab2'],
    ['acidColor', '酸液绿色', 'color', '#7ee33f'],
    ['woodColor', '木板亮色', 'color', '#b07f4a'],
    ['woodDark', '木板暗色', 'color', '#65401f'],
    ['trayColor', '托盘粉色', 'color', '#d94f7d'],
    ['metalColor', '金属高光', 'color', '#cfd3d8'],
    ['glowColor', '强调光色', 'color', '#ffd54a'],
    ['bgGrain', '背景噪点', 'range', 0.55, 0, 1, 0.01],
    ['vignette', '暗角强度', 'range', 0.55, 0, 1, 0.01],
    ['screwSize', '螺丝大小倍率', 'range', 1, 0.7, 1.35, 0.01],
    ['plankW', '木板宽度(px)', 'range', 18, 12, 34, 1],
    ['platformLift', '平台上升高度(px)', 'range', 100, 0, 200, 1],
    ['showMiner', '显示矿工', 'bool', true],
    ['rockFall', '消除时落石特效', 'bool', true],
  ]],
  ['音效', [
    ['sfxMute', '静音', 'bool', false],
    ['sfxVolume', '总音量', 'range', 0.8, 0, 1.5, 0.01],
    ['sfxPick', '拧螺丝 / 入槽', 'bool', true],
    ['sfxMatch', '三消提示音', 'bool', true],
    ['sfxPlank', '木板坠落', 'bool', true],
    ['sfxRumble', '落石 / 酸液', 'bool', true],
    ['sfxTick', '倒计时滴答', 'bool', true],
    ['sfxWin', '通关号角', 'bool', true],
    ['sfxFail', '失败低鸣', 'bool', true],
  ]],
  ['手指 / 自动通关', [
    ['autoSpeed', '整体速度倍率', 'range', 1, 0.25, 6, 0.05],
    ['moveMin', '移动耗时最小(ms)', 'range', 380, 50, 2000, 10],
    ['moveMax', '移动耗时最大(ms)', 'range', 700, 50, 3000, 10],
    ['delayMin', '点击间隔最小(ms)', 'range', 120, 0, 2000, 10],
    ['delayMax', '点击间隔最大(ms)', 'range', 420, 0, 4000, 10],
    ['thinkChance', '“思考停顿”概率', 'range', 0.12, 0, 0.6, 0.01],
    ['thinkMax', '思考停顿最长(ms)', 'range', 900, 0, 4000, 50],
    ['jitter', '落点随机抖动(px)', 'range', 10, 0, 40, 1],
    ['handSize', '手指大小(画面宽比例)', 'range', 0.42, 0.1, 0.9, 0.01],
    ['handAnchorX', '指尖锚点 X(0~1)', 'range', 0.22039473684210525, 0, 1, 0.005],
    ['handAnchorY', '指尖锚点 Y(0~1)', 'range', 0.03667763157894737, 0, 1, 0.005],
    ['handRotation', '手指旋转(度)', 'range', 6, -60, 60, 1],
    ['handFlip', '手指水平翻转', 'bool', false],
    ['handImage', '上传手指图片(透明PNG；默认=麻将工具同款手指)', 'file', DEFAULT_HAND],
    ['pressDepth', '按压幅度（按下时手指缩小比例）', 'range', 0.08, 0, 0.3, 0.01],
    ['pressEnabled', '点击按下效果', 'bool', true],
    ['tapRipple', '点击处显示波纹圈', 'bool', false],
    ['handShow', '显示手指', 'bool', true],
    ['manualHand', '手动游玩时手指跟随指针', 'bool', true],
    ['hideCursor', '手指出现时隐藏鼠标', 'bool', true],
    ['autoStartDelay', '自动通关开始前等待(ms)', 'range', 500, 0, 5000, 50],
  ]],
  ['录制', [
    ['recFps', '帧率', 'range', 30, 15, 60, 1],
    ['recFormat', '格式', 'select', 'auto', [['auto', '自动(优先 MP4)'], ['mp4', 'MP4'], ['webm', 'WebM']]],
    ['recBitrate', '码率(Mbps)', 'range', 8, 1, 30, 0.5],
    ['autoRec', '自动通关开始时自动录制（默认关）', 'bool', false],
    ['autoStop', '自动通关通关后停止录制并下载（仅在正在录制时）', 'bool', true],
    ['tailSec', '通关后继续录制(秒)', 'range', 2.5, 0, 10, 0.1],
  ]],
  ['导出 AE 工程', [
    ['_aeToggle', '记录 AE 时间轴（自动通关/手动游玩都可）', 'button', 'aeToggle', '● 开始记录'],
    ['_aeExport', '重新导出上一次记录', 'button', 'aeExport', '⬇ 导出 ZIP'],
    ['aeWithRec', '录制视频时同步记录，停止录制后自动导出', 'bool', true],
    ['aeFps', 'AE 合成帧率', 'select', '30', [['24', '24'], ['25', '25'], ['30', '30'], ['60', '60']]],
    ['aeSize', 'AE 合成尺寸', 'select', 'canvas', [['canvas', '同画布分辨率'], ['720x1280', '720×1280'], ['1080x1920', '1080×1920']]],
    ['aeSampling', '关键帧方式', 'select', 'reduce', [['reduce', '精简关键帧（线性插值，误差 <0.3px）'], ['bake', '逐帧烘焙（每帧一个关键帧）']]],
    ['aeNames', '图层命名', 'select', 'zh', [['zh', '中文'], ['en', 'English']]],
    ['aeAudio', '音频', 'select', 'both', [['both', '混合音轨 + 逐事件音效层'], ['mixed', '仅混合音轨'], ['events', '仅逐事件音效层'], ['none', '不导出音频']]],
    ['aeSaveAep', '脚本跑完后提示另存为 .aep', 'bool', true],
  ]],
  ['导出 3D 动画（UE5 / C4D / Blender）', [
    ['_export3d', '生成 glTF/FBX 场景 + Blender 脚本 + 音频', 'button', 'export3d', '导出 3D 动画 (glTF/FBX/Blender)'],
    ['export3dFps', '3D 动画帧率', 'select', '30', [['24', '24'], ['25', '25'], ['30', '30'], ['60', '60']]],
    ['export3dHand', '包含手指（贴图平面；结束页是否显示仍按“结束页显示手指”）', 'bool', true],
  ]],
  ['导出 H5 试玩广告', [
    ['_exportH5', '导出当前设置为自包含 H5 试玩（无编辑器面板，仅游戏+CTA）', 'button', 'exportH5', '⬇ 导出 H5 试玩 ZIP'],
    ['h5Format', '渠道格式', 'select', 'applovin,facebook,google,mintegral,moloco,tiktok,unity,generic', [['applovin,facebook,google,mintegral,moloco,tiktok,unity,generic', '全部（AppLovin+Facebook+Google+Mintegral+Moloco+TikTok+Unity+Generic）'], ['tiktok,generic', 'TikTok + Generic'], ['applovin', '仅 AppLovin（MRAID）'], ['facebook', '仅 Facebook/Meta（≤2MB）'], ['google', '仅 Google Ads'], ['mintegral', '仅 Mintegral'], ['moloco', '仅 Moloco'], ['tiktok', '仅 TikTok/Pangle'], ['unity', '仅 Unity Ads（MRAID）'], ['generic', '仅 Generic 离线']]],
    ['h5Orientation', '试玩方向', 'select', '1', [['0', '双端 (0)'], ['1', '竖屏 (1)'], ['2', '横屏 (2)']]],
    ['h5Device', '预览机型', 'select', 'adaptive', h5DeviceSelectOptions()],
    ['h5DeviceW', '预览宽度(px)', 'range', 390, 240, 1440, 1],
    ['h5DeviceH', '预览高度(px)', 'range', 844, 400, 2560, 1],
    ['h5CtaText', 'CTA 按钮文案', 'text', '立即下载'],
    ['h5StoreUrl', '应用商店 / 落地页 URL', 'text', 'https://play.google.com/store/apps/details?id=com.example.game'],
    ['h5GameName', '游戏名（可选）', 'text', '巨石营救'],
    ['h5Icon', '应用图标（可选，透明PNG）', 'file', ''],
    ['h5MaxMb', '体积告警阈值(MB)', 'range', 4.5, 1, 20, 0.5],
    ['h5AutoPlay', '打开试玩后自动通关演示', 'bool', false],
  ]],
  ['结束页(End Card)', [
    ['endCard', '显示结束页', 'bool', true],
    ['endCardHand', '结束页显示手指（自动通关点按钮）', 'bool', false],
    ['endDelay', '通关后出现延迟(ms)', 'range', 900, 0, 5000, 50],
    ['endTitle', '标题', 'text', '拆光螺丝，逃出矿坑'],
    ['endSub', '副标题', 'text', '三消同色螺丝 · 拯救被困矿工'],
    ['ctaText', '按钮文字（编辑器内）', 'text', '立即游玩'],
  ]],
];

export const DEFS = {};
for (const [, items] of GROUPS) for (const it of items) if (it[2] !== 'button' && it[2] !== 'note') DEFS[it[0]] = it[3];

// migrate：只补默认值、把仍等于旧默认值的项换成新默认、旧键→新键；不覆盖用户改过的值
export function migrate(obj) {
  if (!obj || typeof obj !== 'object') return { ...DEFS };
  const s = { ...(obj.settings || obj) };
  let v = obj.version || 0;
  if (v < 1) {
    // v0：早期草稿键名统一
    const mv = (o, n) => { if (o in s) { if (!(n in s)) s[n] = s[o]; delete s[o]; } };
    mv('handImg', 'handImage'); mv('sfxVol', 'sfxVolume'); mv('endText', 'endTitle'); mv('gameTime', 'timeLimit');
    v = 1;
  }
  const out = { ...DEFS };
  for (const k in DEFS) {
    if (k in s && typeof s[k] === typeof DEFS[k]) out[k] = s[k];
    else if (k in s && DEFS[k] === null) out[k] = s[k];
  }
  return out;
}

export function loadSettings() {
  try { const raw = localStorage.getItem(STORE_KEY); if (raw) return migrate(JSON.parse(raw)); } catch (e) { /* ignore */ }
  return { ...DEFS };
}
export function saveSettings(S) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ version: SETTINGS_VERSION, settings: S })); }
  catch (e) { console.warn('保存设置失败（图片可能过大）', e); }
}
export function exportJSON(S) { return JSON.stringify({ app: APP_ID, version: SETTINGS_VERSION, settings: S }, null, 2); }
