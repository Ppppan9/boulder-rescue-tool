# 巨石营救 · 3D 动画导出说明（Blender / UE5 / C4D / 三维软件通用）

本 ZIP 由「巨石营救核玩工具」在浏览器内直接生成，包含**真实的 glTF 与二进制 FBX**，不是占位文件。所有动画关键帧来自网页逐帧记录，与 AE 工程、H5 试玩同源。

## 文件

| 路径 | 内容 |
|---|---|
| `scene.glb` | 二进制 glTF，内嵌全部 PNG 贴图 + 逐帧 TRS 动画 + 透视相机 |
| `scene.fbx` | 二进制 FBX（Blender 预设：Y 轴向上、单位 ×100），内嵌贴图与动画 |
| `scene3d.json` | 场景元数据：景深、入出点、不透明度曲线、音频事件、相机参数 |
| `blender_import.py` | Blender 一键导入脚本：还原本透明度、可见性、音频、渲染设置 |
| `timeline.json` | 原始 AE 时间轴（逐图层关键帧与素材表） |
| `README_3D.md` | 本说明 |
| `audio/` | `mix.wav` 混合音轨、`sfx_*.wav` 逐事件音效 |

## 场景结构

- 720×1280 的画布被映射为宽 7.2、高 12.8 的世界单位（1 单位 = 100 px），相机在 z≈23.9 处、垂直视角 30°。
- 每个网页精灵是一块带透明贴图的平面，按类别放入不同景深：背景 −2.55、蓝石/滑轮 −1.7、被困角色 −1.3~−0.98、棋盘 −0.72、托盘 0.04、木板 0.15、六色螺丝 0.28、HUD 0.44~0.6、特效 0.72、结束页 0.9、白手套 2.35。
- 每个平面按景深做了投影补偿，静止相机下与网页画面在 z=0 平面对齐；在三维软件里环绕相机即可看到真实的层次与视差。
- 动画为逐帧烘焙（默认 30fps，可在工具里选 24/25/30/60）。图层入点/出点用父级 `*_vis` 空物体的 STEP 缩放关键帧实现显隐。
- 透明度曲线不写入 glTF/FBX 的材质动画通道（格式限制），统一放在 `scene3d.json` 的 `opacity` 里，由 Blender 脚本逐帧驱动；其它软件可用同名材质的手动关键帧还原。

## Blender（推荐，脚本已适配 4.x / 5.x）

```bash
# 直接导入并保存 .blend
blender --background --python blender_import.py -- --save

# 导入 + 导出 Blender 版 FBX（可选）
blender --background --python blender_import.py -- --save --fbx

# 渲染指定秒/帧（示例：0s、1.5s、第 90 帧）
blender --background --python blender_import.py -- --render 0s,1.5s,90 --out renders
```

也可以在 Blender 里：Scripting → 打开 `blender_import.py` → Run Script（脚本与 `scene.glb`、`scene3d.json` 放在同一目录）。

脚本会：设置帧率与 720×1280 分辨率 → 导入 glb → 还原相机/材质透明度/显隐 → 把 `audio/` 放进视频序列编辑器（混合音轨静音、逐事件音效可听）→ 可选保存或渲染。色彩管理固定为 Standard，避免 AgX 让画面偏灰。

## UE5

1. 直接拖入 `scene.fbx`，Import Uniform Scale 保持 1，勾选 Import Animations。
2. 材质会自动生成 Phong 材质；把每张贴图接到 **Emissive Color**，混合模式设为 Translucent，即可得到与网页一致的色彩（贴图本身就是最终像素）。
3. 音频在 `audio/`，按 `scene3d.json` 的 `audio[].t` 秒数摆放到 Sequencer。

## C4D / Maya / 3ds Max

导入 `scene.fbx`（Y 轴向上）；材质若显示偏暗，将贴图同时接到自发光/发光通道。帧率与时长见 `scene3d.json` 的 `fps`、`duration`。

## 注意

- `scene.fbx` 是浏览器内由 three.js 场景直接写出的二进制 FBX（约数 MB，贴图内嵌）；Blender 脚本里的 `--fbx` 只是可选的“二次导出”。
- 3D 包体积远大于 H5 包，只用于视频/买量素材制作，不要直接投放到试玩渠道。
- 如果在记录后修改了画布、关卡或外观参数，请重新自动通关以生成新的时间轴。
