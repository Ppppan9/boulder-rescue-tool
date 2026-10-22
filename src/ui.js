// 巨石营救 · 控制面板（按 TOOLKIT_STANDARD 的分组顺序与控件语义生成）
// 顶部按钮与运行文案在 template.html / main.js 中固定；这里只负责设置项 DOM、同步与文件读取。
export function buildPanel({ panelBody, groups, S, onChange, onButton, onFile }) {
  const refs = new Map();
  const groupEls = new Map();
  let previewWrap = null;

  function addRow(parent, label) {
    const row = document.createElement('div');
    row.className = 'row';
    const l = document.createElement('label');
    l.textContent = label;
    row.appendChild(l);
    parent.appendChild(row);
    return row;
  }

  function makeGroup(name, items) {
    const d = document.createElement('details');
    d.open = name === '关卡与棋盘';
    const sm = document.createElement('summary');
    sm.textContent = name;
    d.appendChild(sm);
    const holder = document.createElement('div');
    d.appendChild(holder);

    for (const it of items) {
      const [key, label, type, def, a, b] = it;
      if (type === 'note') {
        const n = document.createElement('div');
        n.className = 'tip';
        n.textContent = label;
        holder.appendChild(n);
        refs.set(key, { type, el: n });
        continue;
      }
      if (type === 'button') {
        const row = document.createElement('div');
        row.className = 'row';
        const lb = document.createElement('label');
        lb.textContent = label;
        const btn = document.createElement('button');
        btn.textContent = typeof a === 'string' ? a : '执行';
        btn.addEventListener('click', () => onButton(key));
        row.appendChild(lb); row.appendChild(btn);
        holder.appendChild(row);
        refs.set(key, { type, el: btn, row });
        continue;
      }
      const row = addRow(holder, label);
      const r = { type, row, el: null, num: null, key };
      if (type === 'range') {
        const min = +a, max = +b, step = it[5] != null ? +it[5] : 1;
        const range = document.createElement('input');
        range.type = 'range'; range.min = min; range.max = max; range.step = step;
        const num = document.createElement('input');
        num.className = 'val'; num.type = 'number'; num.min = min; num.max = max; num.step = step;
        const commit = (v, fromNum) => {
          v = Math.max(min, Math.min(max, +v));
          if (!isFinite(v)) v = +def;
          S[key] = v;
          range.value = v;
          if (!fromNum) num.value = v;
          onChange(key, v, 'range');
        };
        range.addEventListener('input', () => commit(range.value, false));
        num.addEventListener('change', () => commit(num.value, true));
        row.appendChild(range); row.appendChild(num);
        r.el = range; r.num = num;
      } else if (type === 'color') {
        const input = document.createElement('input');
        input.type = 'color'; input.value = def;
        input.addEventListener('input', () => { S[key] = input.value; onChange(key, input.value, 'color'); });
        row.appendChild(input); r.el = input;
      } else if (type === 'bool') {
        row.classList.add('t-switch');
        const lbl = document.createElement('label');
        const sw = document.createElement('span'); sw.className = 'switch';
        const input = document.createElement('input'); input.type = 'checkbox'; input.className = 'switch-input';
        const slider = document.createElement('span'); slider.className = 'slider';
        sw.appendChild(input); sw.appendChild(slider);
        input.addEventListener('change', () => { S[key] = input.checked; onChange(key, input.checked, 'bool'); });
        lbl.appendChild(sw); row.appendChild(lbl);
        r.el = input;
      } else if (type === 'select') {
        const sel = document.createElement('select');
        for (const opt of (a || [])) {
          const o = document.createElement('option');
          o.value = opt[0]; o.textContent = opt[1];
          sel.appendChild(o);
        }
        sel.addEventListener('change', () => { S[key] = sel.value; onChange(key, sel.value, 'select'); });
        row.appendChild(sel); r.el = sel;
      } else if (type === 'text') {
        const input = document.createElement('input');
        input.type = 'text';
        input.addEventListener('input', () => { S[key] = input.value; onChange(key, input.value, 'text'); });
        row.appendChild(input); r.el = input;
      } else if (type === 'file') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = key === 'h5Icon' ? 'image/png,image/webp,image/jpeg' : 'image/png,image/webp';
        const hint = document.createElement('span');
        hint.className = 'file-hint';
        hint.textContent = '未更换';
        input.addEventListener('change', async () => {
          const f = input.files && input.files[0]; if (!f) return;
          try {
            const data = await readFile(f);
            S[key] = data;
            hint.textContent = f.name;
            onFile(key, data, f);
            onChange(key, data, 'file');
          } catch (e) { hint.textContent = '读取失败'; }
        });
        row.appendChild(input); row.appendChild(hint);
        r.el = input; r.hint = hint;
      }
      refs.set(key, r);
    }

    if (name === '手指 / 自动通关') {
      const wrap = document.createElement('div');
      wrap.className = 'row handprev';
      const l = document.createElement('label'); l.textContent = '指尖锚点预览（点击图片可微调）';
      const cv = document.createElement('canvas'); cv.id = 'handPrev'; cv.width = 150; cv.height = 190;
      wrap.appendChild(l); wrap.appendChild(cv);
      holder.appendChild(wrap);
      previewWrap = { cv };
    }

    groupEls.set(name, holder);
    panelBody.appendChild(d);
  }

  for (const [name, items] of groups) makeGroup(name, items);

  function sync() {
    for (const [key, r] of refs) {
      if (r.type === 'note' || r.type === 'button') continue;
      const v = S[key];
      if (r.type === 'range') { if (r.el) r.el.value = v; if (r.num) r.num.value = v; }
      else if (r.type === 'bool') r.el.checked = !!v;
      else if (r.type === 'file') { if (r.hint) r.hint.textContent = v && String(v).startsWith('data:') ? '已载入' : '未更换'; }
      else if (r.el) r.el.value = v == null ? '' : v;
    }
    updateDim();
  }

  function updateDim() {
    for (const [k, r] of refs) {
      const shape = ['shapeImg', 'shapeThreshold', 'shapeCover', 'shapeSeed'].includes(k);
      if (shape && r.row) r.row.classList.toggle('dimmed', S.level !== 'image');
      if (['h5DeviceW', 'h5DeviceH'].includes(k) && r.row) r.row.classList.toggle('dimmed', S.h5Device !== 'custom');
      if (k === 'h5Icon' && r.row) {/* icon works on all channels */}
    }
  }

  function setPreview(img, S2) {
    if (!previewWrap || !img) return;
    const { cv } = previewWrap, g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#171a20'; g.fillRect(0, 0, cv.width, cv.height);
    const sc = Math.min(cv.width / img.width, cv.height / img.height);
    const w = img.width * sc, h = img.height * sc, x = (cv.width - w) / 2, y = (cv.height - h) / 2;
    g.drawImage(img, x, y, w, h);
    const ax = x + (S2.handAnchorX || 0) * w, ay = y + (S2.handAnchorY || 0) * h;
    g.strokeStyle = '#ffd54a'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(ax - 10, ay); g.lineTo(ax + 10, ay); g.moveTo(ax, ay - 10); g.lineTo(ax, ay + 10); g.stroke();
    g.beginPath(); g.arc(ax, ay, 7, 0, Math.PI * 2); g.strokeStyle = 'rgba(255,213,74,.9)'; g.stroke();
    cv.onpointerdown = (ev) => {
      const rc = cv.getBoundingClientRect();
      const px = (ev.clientX - rc.left) / rc.width * cv.width;
      const py = (ev.clientY - rc.top) / rc.height * cv.height;
      S2.handAnchorX = Math.max(0, Math.min(1, (px - x) / w));
      S2.handAnchorY = Math.max(0, Math.min(1, (py - y) / h));
      onChange('handAnchorX', S2.handAnchorX, 'range');
      onChange('handAnchorY', S2.handAnchorY, 'range');
      sync(); setPreview(img, S2);
    };
  }

  function setButtonText(key, text, on) {
    const r = refs.get(key); if (!r || !r.el) return;
    r.el.textContent = text;
    if (on != null) r.el.classList.toggle('on', !!on);
  }

  return { sync, updateDim, setPreview, setButtonText, groupEls, refs };
}

function readFile(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}
