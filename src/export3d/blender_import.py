# -*- coding: utf-8 -*-
"""巨石营救 · 3D 动画导入脚本（Blender 4.x / 5.x）

用法（任选其一）：
  1) Blender → Scripting → 打开本文件 → Run Script（本文件需与 scene.glb、scene3d.json 同目录）
  2) 命令行：blender --background --python blender_import.py -- [--fbx] [--save] [--render 0s,45,120] [--out DIR] [--engine CYCLES|EEVEE] [--verify]

做的事：导入 scene.glb → 设置帧率/帧范围与 720×1280 分辨率 → 相机改为页面同款 30° 透视 →
把所有贴图平面改为“自发光 + 透明”材质（与网页颜色逐像素一致）→ 用 scene3d.json 的 opacity 曲线
烘到材质 Alpha → 用节点的 in/out 重做 STEP 显隐 → audio/*.wav 放进视频序列编辑器
（混合音轨静音、逐事件音效可听）→ 可选保存 .blend / 导出 Blender 版 scene.fbx / 渲染检查帧。
"""
import bpy, json, os, sys, math, struct, re

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() and __file__ else os.getcwd()
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(name, default=None):
    if name in argv:
        i = argv.index(name)
        return argv[i + 1] if i + 1 < len(argv) and not argv[i + 1].startswith("--") else True
    return default
DIR = arg("--dir", HERE)
OUT = arg("--out", DIR)
DO_FBX = bool(arg("--fbx", False))
DO_SAVE = bool(arg("--save", False))
ENGINE = arg("--engine", "EEVEE")
RENDER = arg("--render", None)
VERIFY = bool(arg("--verify", False))

meta = json.load(open(os.path.join(DIR, "scene3d.json"), encoding="utf-8"))
glb_path = os.path.join(DIR, "scene.glb")
problems = []

def read_gltf_json(path):
    with open(path, "rb") as f:
        data = f.read()
    if data[:4] != b"glTF":
        raise RuntimeError("scene.glb 不是有效的二进制 glTF")
    n = struct.unpack_from("<I", data, 12)[0]
    return json.loads(data[20:20 + n].decode("utf-8"))
G = read_gltf_json(glb_path)
GMAT = {m.get("name"): m for m in G.get("materials", [])}
GMESH = {m.get("name"): m for m in G.get("meshes", [])}

scene = bpy.context.scene
# 清空默认场景
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
fps = int(meta["fps"])
scene.render.fps = fps
scene.render.fps_base = 1.0
bpy.ops.import_scene.gltf(filepath=glb_path)

def action_fcurves(action, slot=None):
    """Blender 4.x 的 action.fcurves；Blender 5.x 的 layers/strips/channelbags。"""
    if action is None:
        return []
    legacy = getattr(action, "fcurves", None)
    if legacy is not None:
        try:
            return list(legacy)
        except Exception:
            pass
    out = []
    for layer in getattr(action, "layers", []):
        for strip in getattr(layer, "strips", []):
            bags = []
            if slot is not None and hasattr(strip, "channelbag"):
                try:
                    cb = strip.channelbag(slot)
                    bags = [cb] if cb else []
                except Exception:
                    bags = []
            if not bags:
                bags = list(getattr(strip, "channelbags", []))
            for bag in bags:
                if slot is not None and getattr(bag, "slot_handle", None) is not None:
                    if bag.slot_handle != getattr(slot, "handle", None):
                        continue
                out.extend(list(getattr(bag, "fcurves", [])))
    return out

def obj_slot_bags(o):
    """返回只属于该对象 action slot 的 fcurve 容器（兼容旧版 action.fcurves）。"""
    ad = getattr(o, "animation_data", None)
    if not ad or not ad.action:
        return []
    act = ad.action
    slot = getattr(ad, "action_slot", None)
    legacy = getattr(act, "fcurves", None)
    if legacy is not None:
        try:
            legacy[0]
            return [legacy]
        except Exception:
            pass
    out = []
    for layer in getattr(act, "layers", []):
        for strip in getattr(layer, "strips", []):
            bags = []
            if slot is not None and hasattr(strip, "channelbag"):
                try:
                    cb = strip.channelbag(slot)
                    bags = [cb] if cb else []
                except Exception:
                    bags = []
            if not bags:
                bags = list(getattr(strip, "channelbags", []))
            for bag in bags:
                if slot is not None and getattr(bag, "slot_handle", None) is not None:
                    if bag.slot_handle != getattr(slot, "handle", None):
                        continue
                out.append(bag)
    return out

def obj_fcurves(o):
    out = []
    for bag in obj_slot_bags(o):
        out.extend(list(getattr(bag, "fcurves", [])))
    return out

def drop_fcurves(o, data_path):
    """删除指定通道，但保留同一 action 中的位置/旋转动画。"""
    for bag in obj_slot_bags(o):
        for fc in list(getattr(bag, "fcurves", [])):
            if fc.data_path == data_path:
                try:
                    bag.fcurves.remove(fc)
                except Exception:
                    pass

def action_range():
    lo, hi = 1e9, -1e9
    for a in bpy.data.actions:
        r = a.frame_range
        lo, hi = min(lo, r[0]), max(hi, r[1])
    if lo > hi:
        return 0.0, 0.0
    return lo, hi
lo, hi = action_range()
OFF = int(round(lo)) if lo < 1e8 else 0
scene.frame_start = OFF
scene.frame_end = OFF + int(meta.get("frameEnd") or (meta["duration"] * fps))
scene.frame_set(OFF)

# ---------- 相机 ----------
cam = bpy.data.objects.get(meta.get("camera", {}).get("name"))
if cam is None:
    cam = next((o for o in bpy.data.objects if o.type == "CAMERA"), None)
C = meta.get("camera", {})
if cam:
    scene.camera = cam
    cam.data.type = "PERSP"
    cam.data.sensor_fit = "VERTICAL"
    cam.data.angle_y = math.radians(C.get("yfov", 30))
    cam.data.clip_start = C.get("near", 0.05)
    cam.data.clip_end = C.get("far", 120)
else:
    problems.append("没有找到相机")

scene.render.resolution_x = int(meta["width"])
scene.render.resolution_y = int(meta["height"])
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"
scene.view_settings.exposure = 0
scene.view_settings.gamma = 1
if scene.world is None:
    scene.world = bpy.data.worlds.new("World")
scene.world.use_nodes = True
bg = scene.world.node_tree.nodes.get("Background")
W = meta.get("world", {})
if bg:
    bg.inputs[0].default_value = (0.002, 0.0015, 0.003, 1)
    bg.inputs[1].default_value = 0.35

# 贴图 / 颜色因子
def hex_lin(h):
    v = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in v]

def first_image(mat):
    if not mat.use_nodes:
        return None
    for n in mat.node_tree.nodes:
        if n.type == "TEX_IMAGE" and n.image:
            return n.image
    return None
INFO = {}
def info(mat):
    if mat.name not in INFO:
        g = GMAT.get(mat.name, {})
        p = g.get("pbrMetallicRoughness", {})
        fac = p.get("baseColorFactor", [1, 1, 1, 1])
        INFO[mat.name] = (fac, g.get("alphaMode", "OPAQUE"), g.get("alphaCutoff", 0.5), first_image(mat))
    return INFO[mat.name]

def principled(mat):
    """FBX 用：Principled BSDF，自发光=贴图，Alpha=贴图 alpha × 不透明度"""
    fac, mode, cutoff, img = info(mat)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    N, L = nt.nodes, nt.links
    out = N.new("ShaderNodeOutputMaterial"); out.location = (700, 0)
    b = N.new("ShaderNodeBsdfPrincipled"); b.location = (300, 0)
    b.inputs["Base Color"].default_value = (fac[0], fac[1], fac[2], 1)
    b.inputs["Alpha"].default_value = fac[3]
    b.inputs["Roughness"].default_value = 1.0
    b.inputs["Emission Strength"].default_value = 1.0
    b.inputs["Emission Color"].default_value = (fac[0], fac[1], fac[2], 1)
    if img:
        tex = N.new("ShaderNodeTexImage"); tex.image = img; tex.location = (-200, 0)
        L.new(tex.outputs[0], b.inputs["Base Color"])
        L.new(tex.outputs[0], b.inputs["Emission Color"])
        if mode != "OPAQUE":
            L.new(tex.outputs[1], b.inputs["Alpha"])
    L.new(b.outputs[0], out.inputs[0])

def rebuild(mat):
    """Blender 预览/渲染用：自发光 + 透明，完全绕过灯光，颜色与网页一致"""
    fac, mode, cutoff, img = info(mat)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    N, L = nt.nodes, nt.links
    out = N.new("ShaderNodeOutputMaterial"); out.location = (900, 0)
    em = N.new("ShaderNodeEmission"); em.location = (520, 140)
    tr = N.new("ShaderNodeBsdfTransparent"); tr.location = (520, -120)
    mix = N.new("ShaderNodeMixShader"); mix.location = (720, 0)
    color = N.new("ShaderNodeRGB"); color.location = (-360, 220)
    color.outputs[0].default_value = (fac[0], fac[1], fac[2], 1)
    op = N.new("ShaderNodeValue"); op.name = op.label = "Opacity"; op.location = (-360, -260)
    op.outputs[0].default_value = fac[3]
    alpha = op.outputs[0]
    if img:
        tex = N.new("ShaderNodeTexImage"); tex.image = img; tex.location = (-560, 80)
        tex.interpolation = "Linear"; tex.extension = "CLIP"
        mul = N.new("ShaderNodeMix"); mul.data_type = "RGBA"; mul.blend_type = "MULTIPLY"
        mul.location = (-120, 180); mul.inputs[0].default_value = 1.0
        L.new(color.outputs[0], mul.inputs[6])
        L.new(tex.outputs[0], mul.inputs[7])
        L.new(mul.outputs[2], em.inputs[0])
        am = N.new("ShaderNodeMath"); am.operation = "MULTIPLY"; am.location = (-120, -220)
        L.new(tex.outputs[1], am.inputs[0]); L.new(op.outputs[0], am.inputs[1])
        alpha = am.outputs[0]
    else:
        L.new(color.outputs[0], em.inputs[0])
    em.inputs[1].default_value = 1.0
    if mode == "MASK":
        st = N.new("ShaderNodeMath"); st.operation = "GREATER_THAN"; st.location = (300, -260)
        st.inputs[1].default_value = cutoff - 1e-4
        L.new(alpha, st.inputs[0]); alpha = st.outputs[0]
    if mode == "OPAQUE":
        L.new(em.outputs[0], out.inputs[0])
    else:
        L.new(alpha, mix.inputs[0]); L.new(tr.outputs[0], mix.inputs[1]); L.new(em.outputs[0], mix.inputs[2])
        L.new(mix.outputs[0], out.inputs[0])
    try:
        mat.surface_render_method = "BLENDED" if mode == "BLEND" else "DITHERED"
    except Exception:
        try:
            mat.blend_method = "BLEND" if mode == "BLEND" else ("CLIP" if mode == "MASK" else "OPAQUE")
        except Exception:
            pass
    return op

MATS = [m for m in bpy.data.materials if m.users]
for m in MATS:
    info(m)
os.makedirs(OUT, exist_ok=True)

# FBX（可选的 Blender 二次导出）要在改成自发光材质之前做
if DO_FBX:
    for m in MATS:
        principled(m)
    fbx = os.path.join(OUT, "scene.fbx")
    bpy.ops.export_scene.fbx(
        filepath=fbx, use_selection=False, object_types={"MESH", "CAMERA", "EMPTY", "LIGHT"},
        bake_anim=True, bake_anim_use_all_bones=False, bake_anim_use_nla_strips=False,
        bake_anim_use_all_actions=False, bake_anim_force_startend_keying=True,
        bake_anim_step=1.0, bake_anim_simplify_factor=1.0, path_mode="COPY",
        embed_textures=True, axis_forward="-Z", axis_up="Y", apply_unit_scale=True,
        add_leaf_bones=False, colors_type="SRGB",
    )

# 其余材质 → 自发光 + 透明
opacity_node = {}
for m in MATS:
    opacity_node[m.name] = rebuild(m)

def srgb_to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

NODE = {n["name"]: n for n in meta.get("nodes", [])}
n_op = 0
for mesh_name, keys in meta.get("opacity", {}).items():
    o = bpy.data.objects.get(mesh_name)
    if not o:
        # glTF 导入器可能给重名对象加后缀；按前缀兜底
        cand = [x for x in bpy.data.objects if x.name.startswith(mesh_name[:48])]
        o = cand[0] if cand else None
    if not o or not o.active_material:
        continue
    v = opacity_node.get(o.active_material.name)
    if not v:
        continue
    for t, a in keys:
        v.outputs[0].default_value = a
        v.outputs[0].keyframe_insert("default_value", frame=OFF + t * fps)
    n_op += 1

# 显隐：节点 in/out → 父级 *_vis 的 STEP 缩放
n_vis = 0
for name, n in NODE.items():
    o = bpy.data.objects.get(name)
    if not o or o.type != "EMPTY":
        continue
    in_t = float(n.get("in", 0))
    out_t = float(n.get("out", meta["duration"]))
    # 只替换 scale 通道；glTF 的位置动画（手指移动、螺丝飞行、木板坠落）必须保留。
    drop_fcurves(o, "scale")
    times = [(OFF, 1.0 if in_t <= 0.0005 else 0.0)]
    if in_t > 0.0005:
        times.append((OFF + in_t * fps, 1.0))
    if out_t < meta["duration"] - 0.0005:
        times.append((OFF + out_t * fps, 0.0))
    for fr, v in times:
        o.scale = (v, v, v)
        o.keyframe_insert("scale", frame=fr)
    for fc in obj_fcurves(o):
        if fc.data_path == "scale":
            for kp in fc.keyframe_points:
                kp.interpolation = "CONSTANT"
    n_vis += 1

# ---------- 音频 ----------
seq = scene.sequence_editor_create()
container = getattr(seq, "strips", None)
if container is None:
    container = getattr(seq, "sequences", None)
n_snd = 0
def add_sound(name, path, channel, frame, mute=False, db=0.0):
    global n_snd
    if not os.path.exists(path):
        problems.append("音频缺失：" + path)
        return
    try:
        s = container.new_sound(name=name, filepath=path, channel=channel, frame_start=int(frame))
    except Exception:
        try:
            s = container.new_sound(name, path, channel, int(frame))
        except Exception as e:
            problems.append("音频轨创建失败：%s (%s)" % (name, e))
            return
    try:
        s.mute = mute
        s.volume = 10 ** (db / 20.0)
    except Exception:
        pass
    n_snd += 1

if meta.get("mix"):
    add_sound("mix", os.path.join(DIR, meta["mix"]["file"]), 1, OFF, mute=True)
for i, e in enumerate(meta.get("audio", [])):
    add_sound("sfx_%03d" % (i + 1), os.path.join(DIR, e["file"]), 2 + (i % 6),
              OFF + int(round(e["t"] * fps)), mute=False, db=e.get("db", 0))
try:
    scene.render.ffmpeg.audio_codec = "AAC"
except Exception:
    pass

# ---------- 渲染设置 ----------
if str(ENGINE).upper().startswith("CYCLES"):
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = int(arg("--samples", 16))
    scene.cycles.use_denoising = False
    scene.cycles.max_bounces = 0
    scene.cycles.transparent_max_bounces = 64
else:
    for e in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try:
            scene.render.engine = e
            break
        except Exception:
            pass
scene.render.film_transparent = False
scene.render.image_settings.file_format = "PNG"

report = {
    "objects": len(bpy.data.objects),
    "meshes": sum(1 for o in bpy.data.objects if o.type == "MESH"),
    "empties": sum(1 for o in bpy.data.objects if o.type == "EMPTY"),
    "cameras": sum(1 for o in bpy.data.objects if o.type == "CAMERA"),
    "actions": len(bpy.data.actions),
    "fcurves": sum(len(action_fcurves(a)) for a in bpy.data.actions),
    "keyframes": sum(len(fc.keyframe_points) for a in bpy.data.actions for fc in action_fcurves(a)),
    "frame_range": [scene.frame_start, scene.frame_end],
    "action_range": [lo, hi],
    "offset": OFF,
    "fps": fps,
    "sound_strips": n_snd,
    "lights": sum(1 for o in bpy.data.objects if o.type == "LIGHT"),
    "materials": len(MATS),
    "opacity_curves": n_op,
    "vis_overrides": n_vis,
    "screws": sum(1 for o in bpy.data.objects if re.match(r"^Screw_", o.name)),
    "planks": sum(1 for o in bpy.data.objects if re.match(r"^Plank_", o.name)),
    "miner_parts": sum(1 for o in bpy.data.objects if re.match(r"^Miner_", o.name)),
    "camera": scene.camera.name if scene.camera else None,
    "resolution": [scene.render.resolution_x, scene.render.resolution_y],
    "engine": scene.render.engine,
}
if report["meshes"] < 12:
    problems.append("网格数量异常：%d" % report["meshes"])
if not scene.camera:
    problems.append("场景没有活动相机")
if report["keyframes"] < 100:
    problems.append("关键帧数量异常：%d" % report["keyframes"])
for m in MATS:
    fac, mode, cutoff, img = info(m)
    if not img and not m.name.lower().startswith("mat_stage"):
        users = [o.name for o in bpy.data.objects
                 if o.type == "MESH" and o.active_material and o.active_material.name == m.name]
        # 纯色背板（Stage_Backdrop）与无用户的空材质不算缺贴图
        if not users or all(n.startswith("Stage_Backdrop") for n in users):
            continue
        problems.append("材质缺少贴图：" + m.name)
if problems:
    report["problems"] = problems

os.makedirs(OUT, exist_ok=True)
if RENDER:
    report["renders"] = []
    for tok in str(RENDER).split(","):
        tok = tok.strip()
        if not tok:
            continue
        tsec = float(tok[:-1]) if tok.endswith("s") else None
        fr = OFF + tsec * fps if tsec is not None else OFF + float(tok)
        fi = int(math.floor(fr))
        sub = fr - fi
        scene.frame_set(fi, subframe=sub)
        scene.render.filepath = os.path.join(OUT, "render_%s.png" % tok.replace(".", "_"))
        bpy.ops.render.render(write_still=True)
        report["renders"].append(scene.render.filepath)
if DO_SAVE:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "scene.blend"))
    report["blend"] = os.path.join(OUT, "scene.blend")
if DO_FBX:
    report["fbx"] = os.path.join(OUT, "scene.fbx")
    report["fbx_size"] = os.path.getsize(report["fbx"]) if os.path.exists(report["fbx"]) else 0

print("EXPORT3D_REPORT " + json.dumps(report))
if VERIFY and problems:
    raise RuntimeError("3D 校验失败：" + "; ".join(problems))
