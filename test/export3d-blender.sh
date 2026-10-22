#!/usr/bin/env bash
# 3D 导出 + Blender 无头导入/渲染联调。需要 Blender 5.x 与 Google Chrome。
set -euo pipefail
cd "$(dirname "$0")/.."
node test/export3d-export.mjs
