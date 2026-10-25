/*
 * PhotoChang 修图工具 —— 主程序
 * Scratch 内置画图工具风格：左侧工具栏 + 调色板，中央画布，底部状态栏。
 */
(function () {
  'use strict';
  const PC = window.PC;
  const color = PC.color;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const TOOL_META = {
    select: { name: '选择 / 移动', key: 'V' },
    pencil: { name: '铅笔', key: 'P' },
    brush: { name: '画笔', key: 'B' },
    eraser: { name: '橡皮擦', key: 'E' },
    fill: { name: '填充', key: 'F' },
    line: { name: '直线', key: 'L' },
    rect: { name: '矩形', key: 'R' },
    ellipse: { name: '椭圆', key: 'C' },
    text: { name: '文字', key: 'T' },
    eyedropper: { name: '吸管取色', key: 'I' }
  };

  const state = {
    tool: 'brush',
    color: { r: 0, g: 0, b: 0, a: 1 },
    size: 4,
    shapeMode: 'fill',
    stroke: 1,
    font: 'sans-serif',
    fontSize: 16,
    textAlign: 'left',
    zoom: 1,
    panX: 0,
    panY: 0,
    drawing: false,
    strokePoints: [],
    shape: null,
    selection: null,
    marquee: null,
    textEditing: null,
    clipboard: null,
    spaceDown: false,
    panning: false,
    adjustBase: null,
    fileName: 'photochang.png',
    dirty: false
  };

  /* ---------------- 元素 ---------------- */

  const art = $('#art');
  const overlay = $('#overlay');
  const stage = $('#stage');
  const viewport = $('#viewport');
  const statusTool = $('#status-tool');
  const statusCanvas = $('#status-canvas');
  const statusPos = $('#status-pos');
  const statusSelection = $('#status-selection');
  const zoomRange = $('#zoom-range');
  const zoomLabel = $('#zoom-label');
  const adjustPanel = $('#adjust-panel');
  const textCapture = $('#text-capture');
  const fileInput = $('#file-input');
  const menuLayer = $('#menu-layer');

  const engine = new PC.Engine(art);
  const history = new PC.History(engine, { limit: 40 });
  const overlayCtx = overlay.getContext('2d');

  /* ---------------- 初始化 ---------------- */

  function setCanvasSize(w, h, keepContent) {
    engine.resize(w, h, keepContent);
    overlay.width = engine.width;
    overlay.height = engine.height;
    state.selection = null;
    state.marquee = null;
    state.textEditing = null;
    history.reset(history.capture());
    fitToWindow();
    updateStatus();
  }

  function init() {
    setCanvasSize(480, 360, false);
    setTool('brush');

    // 工具按钮
    $$('.tool-btn').forEach((btn) => {
      btn.dataset.shortcut = TOOL_META[btn.dataset.tool].key;
      btn.addEventListener('click', () => setTool(btn.dataset.tool));
    });

    // 工具选项
    $('#opt-size').addEventListener('input', (e) => {
      state.size = +e.target.value;
      $('#opt-size-value').textContent = state.size;
    });
    $('#opt-stroke').addEventListener('input', (e) => {
      state.stroke = +e.target.value;
      $('#opt-stroke-value').textContent = state.stroke;
    });
    $$('#opt-shape-mode button').forEach((btn) => {
      btn.addEventListener('click', () => {
        $$('#opt-shape-mode button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.shapeMode = btn.dataset.mode;
      });
    });
    $('#opt-font').addEventListener('change', (e) => { state.font = e.target.value; });
    $('#opt-fontsize').addEventListener('input', (e) => {
      state.fontSize = +e.target.value;
      $('#opt-fontsize-value').textContent = state.fontSize;
    });
    $$('#opt-text-align button').forEach((btn) => {
      btn.addEventListener('click', () => {
        $$('#opt-text-align button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.textAlign = btn.dataset.align;
      });
    });
    $('#opt-select-all').addEventListener('click', selectAll);
    $('#opt-select-none').addEventListener('click', clearSelection);

    // 画布交互
    art.addEventListener('pointerdown', onPointerDown);
    art.addEventListener('pointermove', onPointerMove);
    art.addEventListener('pointerup', onPointerUp);
    art.addEventListener('pointercancel', onPointerUp);
    viewport.addEventListener('pointerdown', onViewportDown);
    viewport.addEventListener('wheel', onWheel, { passive: false });
    viewport.addEventListener('contextmenu', (e) => e.preventDefault());

    // 缩放控件
    $('#zoom-in').addEventListener('click', () => zoomBy(1.25));
    $('#zoom-out').addEventListener('click', () => zoomBy(1 / 1.25));
    $('#zoom-fit').addEventListener('click', fitToWindow);
    $('#zoom-actual').addEventListener('click', () => setZoom(1));
    zoomRange.addEventListener('input', () => setZoom(sliderToZoom(+zoomRange.value)));

    // 顶部按钮
    $('#btn-new').addEventListener('click', () => showNewCanvasDialog());
    $('#btn-open').addEventListener('click', openImage);
    $('#btn-save').addEventListener('click', savePng);
    fileInput.addEventListener('change', onFilePicked);

    // 调整面板
    ['brightness', 'contrast', 'saturation', 'hue'].forEach((key) => {
      const input = $('#adj-' + key);
      input.addEventListener('input', () => {
        $('#val-' + key).textContent = input.value;
        applyAdjustLive();
      });
      input.addEventListener('change', () => {
        applyAdjustLive();
        commitAdjust();
      });
    });
    $('#adj-grayscale').addEventListener('click', () => applySpecial('grayscale'));
    $('#adj-invert').addEventListener('click', () => applySpecial('invert'));
    $('#adj-reset').addEventListener('click', resetAdjust);
    $('#btn-adjust-close').addEventListener('click', () => adjustPanel.classList.add('closed'));

    // 文字输入捕获（支持中文输入法）
    textCapture.addEventListener('input', () => {
      if (!state.textEditing) return;
      state.textEditing.text = textCapture.value;
      renderOverlay();
    });
    textCapture.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commitText();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelText();
      }
    });

    buildMenus();
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', () => { applyStage(); });
    window.addEventListener('beforeunload', (e) => {
      if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
    });

    // 选区蚂蚁线动画
    setInterval(() => { if (state.selection) renderOverlay(); }, 140);
  }

  /* ---------------- 工具 ---------------- */

  function setTool(tool) {
    if (!TOOL_META[tool]) return;
    state.tool = tool;
    $$('.tool-btn').forEach((b) => b.classList.toggle('active', b.dataset.tool === tool));
    $$('.option-row').forEach((row) => {
      const list = (row.dataset.for || '').split(/\s+/);
      row.classList.toggle('hidden', list.indexOf(tool) === -1);
    });
    statusTool.textContent = TOOL_META[tool].name;
    art.style.cursor = tool === 'eyedropper' ? 'crosshair' : (tool === 'select' ? 'default' : 'crosshair');
    if (tool !== 'text') cancelText();
  }

  function strokeOptions() {
    return {
      size: state.tool === 'pencil' ? 1 : state.size,
      color: state.color,
      erase: state.tool === 'eraser'
    };
  }

  /* ---------------- 坐标 / 视图 ---------------- */

  function artPoint(e) {
    const rect = art.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (engine.width / rect.width),
      y: (e.clientY - rect.top) * (engine.height / rect.height)
    };
  }

  function applyStage() {
    stage.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
    zoomLabel.textContent = Math.round(state.zoom * 100) + '%';
    zoomRange.value = zoomToSlider(state.zoom);
  }

  function setZoom(z, clientX, clientY) {
    const rect = viewport.getBoundingClientRect();
    const sx = clientX == null ? rect.width / 2 : clientX - rect.left;
    const sy = clientY == null ? rect.height / 2 : clientY - rect.top;
    const ax = (sx - state.panX) / state.zoom;
    const ay = (sy - state.panY) / state.zoom;
    state.zoom = PC.clamp(z, 0.06, 32);
    state.panX = sx - ax * state.zoom;
    state.panY = sy - ay * state.zoom;
    applyStage();
  }

  function zoomBy(factor) {
    setZoom(state.zoom * factor);
  }

  function fitToWindow() {
    const rect = viewport.getBoundingClientRect();
    const pad = 60;
    const z = Math.min((rect.width - pad) / engine.width, (rect.height - pad) / engine.height);
    state.zoom = PC.clamp(z, 0.06, 32);
    state.panX = (rect.width - engine.width * state.zoom) / 2;
    state.panY = (rect.height - engine.height * state.zoom) / 2;
    applyStage();
  }

  function sliderToZoom(v) {
    if (v <= 50) return 0.06 * Math.pow(1 / 0.06, v / 50);
    return Math.pow(32, (v - 50) / 50);
  }

  function zoomToSlider(z) {
    if (z <= 1) return Math.round((Math.log(z / 0.06) / Math.log(1 / 0.06)) * 50);
    return Math.round(50 + (Math.log(z) / Math.log(32)) * 50);
  }

  function onWheel(e) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      setZoom(state.zoom * Math.exp(-e.deltaY * 0.0022), e.clientX, e.clientY);
    } else {
      state.panX -= e.deltaX;
      state.panY -= e.deltaY;
      applyStage();
    }
  }

  /* ---------------- 绘制交互 ---------------- */

  function onViewportDown(e) {
    // 正在编辑文字时，点击别处先提交
    if (state.textEditing && e.target !== art) {
      commitText();
      return;
    }
    if (state.spaceDown || e.button === 1) {
      state.panning = true;
      state.panStart = { x: e.clientX, y: e.clientY, px: state.panX, py: state.panY };
      viewport.setPointerCapture(e.pointerId);
      viewport.addEventListener('pointermove', onPanMove);
      viewport.addEventListener('pointerup', onPanEnd);
    }
  }

  function onPanMove(e) {
    if (!state.panning) return;
    state.panX = state.panStart.px + (e.clientX - state.panStart.x);
    state.panY = state.panStart.py + (e.clientY - state.panStart.y);
    applyStage();
  }

  function onPanEnd() {
    state.panning = false;
    viewport.removeEventListener('pointermove', onPanMove);
    viewport.removeEventListener('pointerup', onPanEnd);
  }

  function onPointerDown(e) {
    if (e.button !== 0 || state.spaceDown || state.panning) return;
    art.setPointerCapture(e.pointerId);
    const p = artPoint(e);
    const px = Math.floor(p.x);
    const py = Math.floor(p.y);

    switch (state.tool) {
      case 'pencil':
      case 'brush':
      case 'eraser':
        state.drawing = true;
        state.strokePoints = [{ x: px, y: py }];
        engine.stroke(state.strokePoints, strokeOptions());
        break;

      case 'fill': {
        if (engine.floodFill(px, py, state.color)) commit();
        break;
      }

      case 'eyedropper': {
        pickColorAt(px, py);
        break;
      }

      case 'line':
      case 'rect':
      case 'ellipse':
        state.shape = { tool: state.tool, x0: px, y0: py, x1: px, y1: py };
        break;

      case 'text':
        startText(px, py);
        break;

      case 'select':
        onSelectDown(px, py);
        break;
    }
    updateStatus(p);
  }

  function onPointerMove(e) {
    const p = artPoint(e);
    updateStatus(p);
    if (state.panning) return;
    if (!state.drawing && !state.shape && !state.marquee && !(state.selection && state.moving)) return;

    const px = Math.floor(p.x);
    const py = Math.floor(p.y);

    if (state.drawing) {
      state.strokePoints.push({ x: px, y: py });
      engine.stroke([state.strokePoints[state.strokePoints.length - 2], state.strokePoints[state.strokePoints.length - 1]], strokeOptions());
    } else if (state.shape) {
      state.shape.x1 = px;
      state.shape.y1 = py;
      renderOverlay();
    } else if (state.marquee) {
      state.marquee.x1 = px;
      state.marquee.y1 = py;
      renderOverlay();
    } else if (state.selection && state.moving) {
      state.selection.x = state.selection.moveX + (px - state.selection.grabX);
      state.selection.y = state.selection.moveY + (py - state.selection.grabY);
      renderOverlay();
    }
  }

  function onPointerUp(e) {
    if (state.drawing) {
      state.drawing = false;
      state.strokePoints = [];
      commit();
    } else if (state.shape) {
      drawShapeToEngine(state.shape);
      state.shape = null;
      renderOverlay();
      commit();
    } else if (state.marquee) {
      finishMarquee();
    } else if (state.selection && state.moving) {
      state.selection.moving = false;
      commitSelection();
    }
  }

  /* ---------------- 形状 ---------------- */

  function constrainedShape(shape, e) {
    const out = Object.assign({}, shape);
    const dx = out.x1 - out.x0;
    const dy = out.y1 - out.y0;
    if (e && e.shiftKey) {
      if (out.tool === 'line') {
        const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
        const len = Math.hypot(dx, dy);
        out.x1 = out.x0 + Math.cos(angle) * len;
        out.y1 = out.y0 + Math.sin(angle) * len;
      } else {
        const size = Math.max(Math.abs(dx), Math.abs(dy));
        out.x1 = out.x0 + Math.sign(dx || 1) * size;
        out.y1 = out.y0 + Math.sign(dy || 1) * size;
      }
    }
    return out;
  }

  function shapeRect(shape) {
    const x = Math.min(shape.x0, shape.x1);
    const y = Math.min(shape.y0, shape.y1);
    const w = Math.abs(shape.x1 - shape.x0);
    const h = Math.abs(shape.y1 - shape.y0);
    return { x: x, y: y, w: w, h: h };
  }

  function drawShapeToEngine(shape) {
    const r = shapeRect(shape);
    if (r.w === 0 && r.h === 0) return;
    if (shape.tool === 'line') {
      engine.drawLine(shape.x0, shape.y0, shape.x1, shape.y1, state.color, state.stroke);
    } else if (shape.tool === 'rect') {
      engine.drawRect(r.x, r.y, r.w, r.h, state.color, state.shapeMode === 'fill', state.stroke);
    } else if (shape.tool === 'ellipse') {
      engine.drawEllipse(r.x, r.y, r.w, r.h, state.color, state.shapeMode === 'fill', state.stroke);
    }
  }

  function drawShapePreview(ctx, shape) {
    const r = shapeRect(shape);
    ctx.save();
    ctx.fillStyle = color.rgbaToCss(state.color);
    ctx.strokeStyle = color.rgbaToCss(state.color);
    ctx.lineWidth = Math.max(1, state.stroke);
    if (shape.tool === 'line') {
      ctx.beginPath();
      ctx.moveTo(shape.x0, shape.y0);
      ctx.lineTo(shape.x1, shape.y1);
      ctx.stroke();
    } else if (shape.tool === 'rect') {
      if (state.shapeMode === 'fill') ctx.fillRect(r.x, r.y, r.w, r.h);
      else ctx.strokeRect(r.x, r.y, r.w, r.h);
    } else if (shape.tool === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, Math.max(0.5, r.w / 2), Math.max(0.5, r.h / 2), 0, 0, Math.PI * 2);
      if (state.shapeMode === 'fill') ctx.fill();
      else ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------------- 文字 ---------------- */

  function startText(x, y) {
    state.textEditing = { x: x, y: y, text: '' };
    textCapture.value = '';
    textCapture.focus();
    renderOverlay();
  }

  function cancelText() {
    if (!state.textEditing) return;
    state.textEditing = null;
    renderOverlay();
    textCapture.blur();
  }

  function commitText() {
    const editing = state.textEditing;
    if (!editing) return;
    state.textEditing = null;
    textCapture.blur();
    if (editing.text.trim()) {
      const pos = textOrigin(editing.text, editing.x, editing.y);
      engine.drawText(editing.text, pos.x, pos.y, {
        size: state.fontSize,
        family: state.font,
        align: 'left',
        color: state.color
      });
      commit();
    }
    renderOverlay();
  }

  function textOrigin(text, x, y) {
    const ctx = overlayCtx;
    ctx.save();
    ctx.font = `${state.fontSize}px ${state.font}`;
    const w = ctx.measureText(text).width;
    ctx.restore();
    let dx = 0;
    if (state.textAlign === 'center') dx = -w / 2;
    else if (state.textAlign === 'right') dx = -w;
    return { x: x + dx, y: y };
  }

  function drawTextPreview(ctx) {
    const editing = state.textEditing;
    if (!editing || !editing.text) return;
    const pos = textOrigin(editing.text, editing.x, editing.y);
    ctx.save();
    ctx.font = `${state.fontSize}px ${state.font}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = color.rgbaToCss(state.color);
    ctx.fillText(editing.text, pos.x, pos.y);
    ctx.strokeStyle = 'rgba(76,151,255,.9)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(pos.x - 2, pos.y - 2, ctx.measureText(editing.text).width + 4, state.fontSize * 1.25 + 4);
    ctx.setLineDash([]);
    ctx.restore();
  }

  /* ---------------- 选区 ---------------- */

  function onSelectDown(px, py) {
    const sel = state.selection;
    if (sel && px >= sel.x && px < sel.x + sel.w && py >= sel.y && py < sel.y + sel.h) {
      state.selection.moving = true;
      state.selection.grabX = px;
      state.selection.grabY = py;
      state.selection.moveX = sel.x;
      state.selection.moveY = sel.y;
      return;
    }
    state.marquee = { x0: px, y0: py, x1: px, y1: py };
    renderOverlay();
  }

  function finishMarquee() {
    const m = state.marquee;
    state.marquee = null;
    if (!m) return;
    const x = Math.min(m.x0, m.x1);
    const y = Math.min(m.y0, m.y1);
    const w = Math.abs(m.x1 - m.x0);
    const h = Math.abs(m.y1 - m.y0);
    if (w < 1 || h < 1) {
      clearSelection();
      renderOverlay();
      return;
    }
    const copy = document.createElement('canvas');
    copy.width = w;
    copy.height = h;
    copy.getContext('2d').drawImage(art, x, y, w, h, 0, 0, w, h);
    engine.ctx.clearRect(x, y, w, h);
    state.selection = { x: x, y: y, w: w, h: h, pixels: copy, moving: false };
    history.push(history.capture());
    updateStatus();
    renderOverlay();
  }

  function commitSelection() {
    const sel = state.selection;
    if (!sel) return;
    engine.ctx.drawImage(sel.pixels, sel.x, sel.y);
    state.selection = null;
    commit();
    renderOverlay();
    updateStatus();
  }

  function clearSelection() {
    if (!state.selection) return;
    engine.ctx.drawImage(state.selection.pixels, state.selection.x, state.selection.y);
    state.selection = null;
    commit();
    renderOverlay();
    updateStatus();
  }

  function selectAll() {
    const sel = state.selection;
    if (sel) engine.ctx.drawImage(sel.pixels, sel.x, sel.y);
    const copy = document.createElement('canvas');
    copy.width = engine.width;
    copy.height = engine.height;
    copy.getContext('2d').drawImage(art, 0, 0);
    engine.ctx.clearRect(0, 0, engine.width, engine.height);
    state.selection = { x: 0, y: 0, w: engine.width, h: engine.height, pixels: copy, moving: false };
    history.push(history.capture());
    renderOverlay();
    updateStatus();
  }

  function copySelection() {
    if (!state.selection) return false;
    const sel = state.selection;
    const copy = document.createElement('canvas');
    copy.width = sel.w;
    copy.height = sel.h;
    copy.getContext('2d').drawImage(sel.pixels, 0, 0);
    state.clipboard = copy;
    return true;
  }

  function cutSelection() {
    if (!copySelection()) return;
    state.selection = null;
    commit();
    renderOverlay();
  }

  function paste() {
    const clip = state.clipboard;
    if (!clip) return;
    const x = Math.round((engine.width - clip.width) / 2);
    const y = Math.round((engine.height - clip.height) / 2);
    engine.ctx.drawImage(clip, x, y);
    commit();
  }

  function deleteSelection() {
    if (!state.selection) return;
    const sel = state.selection;
    engine.ctx.clearRect(sel.x, sel.y, sel.w, sel.h);
    state.selection = null;
    commit();
    renderOverlay();
    updateStatus();
  }

  function renderOverlay() {
    overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
    if (state.textEditing) {
      drawTextPreview(overlayCtx);
      return;
    }
    if (state.selection) {
      const sel = state.selection;
      overlayCtx.drawImage(sel.pixels, sel.x, sel.y);
      overlayCtx.save();
      overlayCtx.strokeStyle = '#ffffff';
      overlayCtx.lineWidth = 1;
      overlayCtx.setLineDash([4, 4]);
      overlayCtx.lineDashOffset = -(Date.now() / 90) % 8;
      overlayCtx.strokeRect(sel.x + 0.5, sel.y + 0.5, sel.w - 1, sel.h - 1);
      overlayCtx.strokeStyle = '#333333';
      overlayCtx.lineDashOffset = -((Date.now() / 90) % 8) + 4;
      overlayCtx.strokeRect(sel.x + 0.5, sel.y + 0.5, sel.w - 1, sel.h - 1);
      overlayCtx.restore();
      return;
    }
    if (state.marquee) {
      const m = state.marquee;
      const x = Math.min(m.x0, m.x1);
      const y = Math.min(m.y0, m.y1);
      const w = Math.abs(m.x1 - m.x0);
      const h = Math.abs(m.y1 - m.y0);
      overlayCtx.save();
      overlayCtx.strokeStyle = '#4c97ff';
      overlayCtx.lineWidth = 1;
      overlayCtx.setLineDash([4, 3]);
      overlayCtx.strokeRect(x + 0.5, y + 0.5, w, h);
      overlayCtx.restore();
      return;
    }
    if (state.shape) {
      drawShapePreview(overlayCtx, state.shape);
    }
  }

  /* ---------------- 拾色 ---------------- */

  function pickColorAt(x, y) {
    if (x < 0 || y < 0 || x >= engine.width || y >= engine.height) return;
    const d = engine.ctx.getImageData(x, y, 1, 1).data;
    const palette = window.__palette;
    if (palette) palette.setColor({ r: d[0], g: d[1], b: d[2], a: d[3] / 255 }, true);
  }

  /* ---------------- 历史 ---------------- */

  function commit() {
    history.push(history.capture());
    state.dirty = true;
    updateStatus();
  }

  function undo() {
    const snap = history.undo();
    if (!snap) return;
    engine.restoreCanvas(snap.canvas);
    state.selection = null;
    state.dirty = true;
    renderOverlay();
    updateStatus();
  }

  function redo() {
    const snap = history.redo();
    if (!snap) return;
    engine.restoreCanvas(snap.canvas);
    state.selection = null;
    state.dirty = true;
    renderOverlay();
    updateStatus();
  }

  /* ---------------- 色彩调整 ---------------- */

  function adjustValues() {
    return {
      brightness: +$('#adj-brightness').value,
      contrast: +$('#adj-contrast').value,
      saturation: +$('#adj-saturation').value,
      hueShift: +$('#adj-hue').value
    };
  }

  function applyAdjustLive() {
    if (!state.adjustBase) state.adjustBase = engine.snapshotCanvas();
    engine.restoreCanvas(state.adjustBase);
    const v = adjustValues();
    if (v.brightness || v.contrast || v.saturation || v.hueShift) engine.adjust(v);
    state.dirty = true;
  }

  function commitAdjust() {
    if (!state.adjustBase) return;
    state.adjustBase = null;
    commit();
  }

  function applySpecial(kind) {
    engine.adjust(kind === 'grayscale' ? { grayscale: true } : { invert: true });
    commit();
  }

  function nudgeAdjust(key, delta) {
    const target = $('#adj-' + key);
    target.value = PC.clamp(+target.value + delta, +target.min, +target.max);
    $('#val-' + key).textContent = target.value;
    state.adjustBase = engine.snapshotCanvas();
    applyAdjustLive();
    commitAdjust();
    adjustPanel.classList.remove('closed');
  }

  function resetAdjust() {
    ['brightness', 'contrast', 'saturation', 'hue'].forEach((key) => {
      $('#adj-' + key).value = 0;
      $('#val-' + key).textContent = '0';
    });
    state.adjustBase = engine.snapshotCanvas();
    applyAdjustLive();
    commitAdjust();
  }

  /* ---------------- 文件 ---------------- */

  function showNewCanvasDialog() {
    const presets = [
      [480, 360], [640, 480], [800, 600], [1024, 768], [1280, 720], [1920, 1080]
    ];
    const wrap = document.createElement('div');
    wrap.className = 'dialog-backdrop';
    wrap.innerHTML =
      '<div class="dialog">' +
      '<div class="dialog-title">新建画布</div>' +
      '<div class="dialog-presets" id="dlg-presets">' +
      presets.map((p) => '<button data-w="' + p[0] + '" data-h="' + p[1] + '">' + p[0] + ' × ' + p[1] + '</button>').join('') +
      '</div>' +
      '<div class="dialog-row"><label>宽度</label><input type="number" id="dlg-w" value="480" min="1" max="4096"><label>高度</label><input type="number" id="dlg-h" value="360" min="1" max="4096"></div>' +
      '<div class="dialog-actions"><button id="dlg-cancel">取消</button><button class="primary-btn" id="dlg-ok">确定</button></div>' +
      '</div>';
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.querySelectorAll('#dlg-presets button').forEach((b) => {
      b.addEventListener('click', () => {
        $('#dlg-w').value = b.dataset.w;
        $('#dlg-h').value = b.dataset.h;
      });
    });
    wrap.querySelector('#dlg-cancel').addEventListener('click', close);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    wrap.querySelector('#dlg-ok').addEventListener('click', () => {
      const w = PC.clamp(+$('#dlg-w').value || 480, 1, 4096);
      const h = PC.clamp(+$('#dlg-h').value || 360, 1, 4096);
      setCanvasSize(w, h);
      state.dirty = false;
      close();
    });
  }

  function openImage() {
    if (window.photoChangNative && window.photoChangNative.openImage) {
      window.photoChangNative.openImage().then((res) => {
        if (res && res.dataUrl) loadImageFromDataUrl(res.dataUrl, res.name);
      });
    } else {
      fileInput.value = '';
      fileInput.click();
    }
  }

  function onFilePicked() {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => loadImageFromDataUrl(reader.result, file.name);
    reader.readAsDataURL(file);
  }

  function loadImageFromDataUrl(dataUrl, name) {
    const img = new Image();
    img.onload = () => {
      engine.resize(img.width, img.height);
      overlay.width = engine.width;
      overlay.height = engine.height;
      engine.ctx.drawImage(img, 0, 0);
      state.selection = null;
      history.reset(history.capture());
      state.fileName = (name || 'image').replace(/\.[^.]+$/, '') + '.png';
      state.dirty = false;
      fitToWindow();
      updateStatus();
    };
    img.src = dataUrl;
  }

  function savePng() {
    art.toBlob((blob) => {
      if (!blob) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        if (window.photoChangNative && window.photoChangNative.savePng) {
          window.photoChangNative.savePng(state.fileName, dataUrl).then((saved) => {
            if (saved) {
              state.dirty = false;
              alert('已保存：' + saved);
            }
          });
        } else {
          const a = document.createElement('a');
          a.href = dataUrl;
          a.download = state.fileName;
          a.click();
        }
      };
      reader.readAsDataURL(blob);
    }, 'image/png');
  }

  function clearCanvas() {
    engine.clear();
    state.selection = null;
    renderOverlay();
    commit();
  }

  /* ---------------- 菜单 ---------------- */

  const MENUS = [
    {
      title: '文件',
      items: [
        { label: '新建画布…', shortcut: 'Ctrl+N', action: () => showNewCanvasDialog() },
        { label: '打开图片…', shortcut: 'Ctrl+O', action: () => openImage() },
        { label: '保存 PNG…', shortcut: 'Ctrl+S', action: () => savePng() },
        { sep: true },
        { label: '关闭程序', action: () => window.close() }
      ]
    },
    {
      title: '编辑',
      items: [
        { label: '撤销', shortcut: 'Ctrl+Z', action: undo, enabled: () => history.canUndo() },
        { label: '重做', shortcut: 'Ctrl+Y', action: redo, enabled: () => history.canRedo() },
        { sep: true },
        { label: '剪切', shortcut: 'Ctrl+X', action: cutSelection, enabled: () => !!state.selection },
        { label: '复制', shortcut: 'Ctrl+C', action: copySelection, enabled: () => !!state.selection },
        { label: '粘贴', shortcut: 'Ctrl+V', action: paste, enabled: () => !!state.clipboard },
        { label: '删除选区', shortcut: 'Delete', action: deleteSelection, enabled: () => !!state.selection },
        { sep: true },
        { label: '全选', shortcut: 'Ctrl+A', action: selectAll },
        { label: '清空画布', action: clearCanvas }
      ]
    },
    {
      title: '视图',
      items: [
        { label: '放大', shortcut: 'Ctrl+=', action: () => zoomBy(1.25) },
        { label: '缩小', shortcut: 'Ctrl+-', action: () => zoomBy(1 / 1.25) },
        { label: '实际大小', shortcut: 'Ctrl+0', action: () => setZoom(1) },
        { label: '适应窗口', shortcut: 'Ctrl+9', action: fitToWindow },
        { sep: true },
        { label: '色彩调整面板', action: () => adjustPanel.classList.toggle('closed') }
      ]
    },
    {
      title: '调整',
      items: [
        { label: '亮度 +10', action: () => nudgeAdjust('brightness', 10) },
        { label: '亮度 -10', action: () => nudgeAdjust('brightness', -10) },
        { label: '对比度 +10', action: () => nudgeAdjust('contrast', 10) },
        { label: '饱和度 +10', action: () => nudgeAdjust('saturation', 10) },
        { sep: true },
        { label: '灰度', action: () => applySpecial('grayscale') },
        { label: '反色', action: () => applySpecial('invert') },
        { label: '重置调整', action: resetAdjust }
      ]
    },
    {
      title: '帮助',
      items: [
        { label: '快捷键一览', action: showShortcuts },
        { label: '关于 PhotoChang', action: showAbout }
      ]
    }
  ];

  function buildMenus() {
    const nav = $('#menus');
    nav.innerHTML = '';
    MENUS.forEach((menu) => {
      const title = document.createElement('div');
      title.className = 'menu-title';
      title.textContent = menu.title;
      title.addEventListener('click', (e) => {
        e.stopPropagation();
        openMenu(title, menu);
      });
      nav.appendChild(title);
    });
    menuLayer.addEventListener('pointerdown', (e) => {
      if (e.target === menuLayer) closeMenu();
    });
  }

  function openMenu(anchor, menu) {
    closeMenu();
    const popup = document.createElement('div');
    popup.className = 'menu-popup';
    menu.items.forEach((item) => {
      if (item.sep) {
        const sep = document.createElement('div');
        sep.className = 'menu-sep';
        popup.appendChild(sep);
        return;
      }
      const el = document.createElement('div');
      el.className = 'menu-item';
      if (item.enabled && !item.enabled()) el.classList.add('disabled');
      el.innerHTML = '<span>' + item.label + '</span>' + (item.shortcut ? '<span class="menu-shortcut">' + item.shortcut + '</span>' : '');
      el.addEventListener('click', () => {
        closeMenu();
        item.action();
      });
      popup.appendChild(el);
    });
    menuLayer.innerHTML = '';
    menuLayer.appendChild(popup);
    menuLayer.classList.add('open');
    const rect = anchor.getBoundingClientRect();
    popup.style.left = rect.left + 'px';
    popup.style.top = rect.bottom + 'px';
    anchor.classList.add('open');
    menuLayer._anchor = anchor;
  }

  function closeMenu() {
    menuLayer.classList.remove('open');
    menuLayer.innerHTML = '';
    if (menuLayer._anchor) menuLayer._anchor.classList.remove('open');
    menuLayer._anchor = null;
  }

  function showShortcuts() {
    const rows = [
      ['V / P / B / E', '选择、铅笔、画笔、橡皮'],
      ['F / L / R / C', '填充、直线、矩形、椭圆'],
      ['T / I', '文字、吸管取色'],
      ['Ctrl+Z / Ctrl+Y', '撤销 / 重做'],
      ['Ctrl+N / O / S', '新建 / 打开 / 保存'],
      ['Ctrl+C / X / V', '复制 / 剪切 / 粘贴'],
      ['Ctrl+A / Delete', '全选 / 删除选区'],
      ['Ctrl+= / - / 0 / 9', '放大 / 缩小 / 1:1 / 适应窗口'],
      ['[ / ]', '减小 / 增大画笔'],
      ['空格 + 拖动', '平移画布'],
      ['Shift + 拖动', '正方形 / 正圆 / 直线角度']
    ];
    openDialog('快捷键', '<table class="shortcut-table">' + rows.map((r) =>
      '<tr><td class="sk">' + r[0] + '</td><td>' + r[1] + '</td></tr>').join('') + '</table>');
  }

  function showAbout() {
    openDialog('关于', '<p><b>PhotoChang 修图工具</b></p><p>一个 Scratch 内置画图工具风格的位图修图编辑器。</p>' +
      '<p>支持选择 / 移动、铅笔、画笔、橡皮、填充、直线、矩形、椭圆、文字与吸管取色，' +
      '并附带亮度、对比度、饱和度、色相等色彩调整。</p>');
  }

  function openDialog(title, html) {
    const wrap = document.createElement('div');
    wrap.className = 'dialog-backdrop';
    wrap.innerHTML = '<div class="dialog"><div class="dialog-title">' + title + '</div>' +
      '<div class="dialog-body">' + html + '</div>' +
      '<div class="dialog-actions"><button class="primary-btn" id="dlg-close">知道了</button></div></div>';
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.querySelector('#dlg-close').addEventListener('click', close);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  }

  /* ---------------- 快捷键 ---------------- */

  function onKeyDown(e) {
    const tag = (e.target && e.target.tagName) || '';
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    const mod = e.ctrlKey || e.metaKey;

    if (e.code === 'Space' && !typing) {
      state.spaceDown = true;
      if (!typing) e.preventDefault();
      return;
    }

    if (mod) {
      const key = e.key.toLowerCase();
      if (key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (key === 'y') { e.preventDefault(); redo(); return; }
      if (key === 's') { e.preventDefault(); savePng(); return; }
      if (key === 'o') { e.preventDefault(); openImage(); return; }
      if (key === 'n') { e.preventDefault(); showNewCanvasDialog(); return; }
      if (key === 'c') { if (copySelection()) e.preventDefault(); return; }
      if (key === 'x') { if (copySelection()) { e.preventDefault(); cutSelection(); } return; }
      if (key === 'v') { if (state.clipboard) { e.preventDefault(); paste(); } return; }
      if (key === 'a') { e.preventDefault(); selectAll(); return; }
      if (key === '=' || key === '+') { e.preventDefault(); zoomBy(1.25); return; }
      if (key === '-') { e.preventDefault(); zoomBy(1 / 1.25); return; }
      if (key === '0') { e.preventDefault(); setZoom(1); return; }
      if (key === '9') { e.preventDefault(); fitToWindow(); return; }
      return;
    }

    if (typing) return;

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      deleteSelection();
      return;
    }
    if (e.key === 'Escape') {
      cancelText();
      clearSelection();
      closeMenu();
      return;
    }
    if (e.key === '[') { $('#opt-size').value = Math.max(1, state.size - 1); $('#opt-size').dispatchEvent(new Event('input')); return; }
    if (e.key === ']') { $('#opt-size').value = Math.min(64, state.size + 1); $('#opt-size').dispatchEvent(new Event('input')); return; }

    const map = { v: 'select', p: 'pencil', b: 'brush', e: 'eraser', f: 'fill', l: 'line', r: 'rect', c: 'ellipse', t: 'text', i: 'eyedropper' };
    const tool = map[e.key.toLowerCase()];
    if (tool) setTool(tool);
  }

  document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') state.spaceDown = false;
  });

  /* ---------------- 状态栏 ---------------- */

  function updateStatus(point) {
    statusCanvas.textContent = engine.width + ' × ' + engine.height;
    if (point) {
      statusPos.textContent = Math.floor(point.x) + ', ' + Math.floor(point.y);
    }
    if (state.selection) {
      statusSelection.textContent = '选区 ' + state.selection.w + '×' + state.selection.h;
    } else {
      statusSelection.textContent = '';
    }
  }

  /* ---------------- 启动 ---------------- */

  document.addEventListener('DOMContentLoaded', () => {
    const palette = new PC.Palette({
      onChange: (c) => { state.color = c; },
      onPickEyedropper: () => setTool('eyedropper')
    });
    window.__palette = palette;
    init();
  });
})();
