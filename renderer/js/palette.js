/*
 * PhotoChang 修图工具 —— 调色板（Scratch 风格：当前色块 + 色相/饱和度/明度 + 预设色）
 */
(function () {
  'use strict';
  const PC = (window.PC = window.PC || {});
  const color = PC.color;

  const PRESETS = [
    '#000000', '#575E75', '#8A8F9E', '#C8CCD6', '#FFFFFF',
    '#FF0000', '#FF7F27', '#FFBF00', '#FFFF00', '#92E82A',
    '#1BC516', '#10C9C9', '#1079C9', '#1E2FF5', '#8B10FF',
    '#FF10C9', '#FF1079', '#F01089', '#6B3FA0', '#00A08A'
  ];

  class Palette {
    constructor(options) {
      const opts = options || {};
      this.onChange = opts.onChange || function () {};
      this.onPickEyedropper = opts.onPickEyedropper || function () {};

      this.svCanvas = document.getElementById('palette-sv');
      this.hueCanvas = document.getElementById('palette-hue');
      this.currentBox = document.getElementById('palette-current');
      this.hexInput = document.getElementById('palette-hex');
      this.presetsBox = document.getElementById('palette-presets');
      this.recentBox = document.getElementById('palette-recent');

      this.hsv = { h: 0, s: 0, v: 0 };
      this.color = { r: 0, g: 0, b: 0, a: 1 };
      this.recent = [];

      this._buildSwatches(this.presetsBox, PRESETS);
      this._buildSwatches(this.recentBox, []);

      this._bindCanvas(this.svCanvas, this._pickSV.bind(this));
      this._bindCanvas(this.hueCanvas, this._pickHue.bind(this));

      this.hexInput.addEventListener('change', () => {
        const rgba = color.hexToRgba(this.hexInput.value);
        if (rgba) this.setColor(rgba, true);
        else this._render();
      });
      this.hexInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.hexInput.blur();
        e.stopPropagation();
      });

      this.setColor({ r: 0, g: 0, b: 0, a: 1 }, true);
    }

    _buildSwatches(box, list) {
      box.innerHTML = '';
      list.forEach((hex) => {
        const btn = document.createElement('button');
        btn.style.background = hex;
        btn.title = hex;
        btn.addEventListener('click', () => {
          const rgba = color.hexToRgba(hex);
          if (rgba) this.setColor(rgba, true);
        });
        box.appendChild(btn);
      });
    }

    _bindCanvas(canvas, handler) {
      const pick = (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
        const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
        handler(x, y);
      };
      canvas.addEventListener('pointerdown', (e) => {
        canvas.setPointerCapture(e.pointerId);
        pick(e);
        const move = (ev) => pick(ev);
        const up = () => {
          canvas.removeEventListener('pointermove', move);
          canvas.removeEventListener('pointerup', up);
        };
        canvas.addEventListener('pointermove', move);
        canvas.addEventListener('pointerup', up);
      });
    }

    _pickSV(x, y) {
      const w = this.svCanvas.width;
      const h = this.svCanvas.height;
      this.hsv.s = PC.clamp(x / (w - 1), 0, 1);
      this.hsv.v = PC.clamp(1 - y / (h - 1), 0, 1);
      this._applyHsv(false);
    }

    _pickHue(x, y) {
      const w = this.hueCanvas.width;
      this.hsv.h = PC.clamp((x / (w - 1)) * 360, 0, 360);
      this._applyHsv(false);
    }

    _applyHsv(pushRecent) {
      const rgb = color.hsvToRgb(this.hsv.h, this.hsv.s, this.hsv.v);
      this.color = { r: rgb.r, g: rgb.g, b: rgb.b, a: 1 };
      this._render(pushRecent);
      this.onChange(this.color);
    }

    setColor(rgba, pushRecent) {
      this.color = { r: rgba.r, g: rgba.g, b: rgba.b, a: rgba.a == null ? 1 : rgba.a };
      const hsv = color.rgbToHsv(this.color.r, this.color.g, this.color.b);
      this.hsv = { h: hsv.h, s: hsv.s, v: hsv.v };
      this._render(pushRecent);
      this.onChange(this.color);
    }

    _render(pushRecent) {
      this.currentBox.style.background = color.rgbaToCss(this.color);
      if (document.activeElement !== this.hexInput) {
        this.hexInput.value = color.rgbaToHex(this.color);
      }
      this._drawSV();
      this._drawHue();

      if (pushRecent) {
        const hex = color.rgbaToHex(this.color);
        this.recent = [hex].concat(this.recent.filter((c) => c !== hex)).slice(0, 10);
        this._buildSwatches(this.recentBox, this.recent);
      }
    }

    _drawSV() {
      const canvas = this.svCanvas;
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;
      const img = ctx.createImageData(w, h);
      const d = img.data;
      for (let y = 0; y < h; y++) {
        const v = 1 - y / (h - 1);
        for (let x = 0; x < w; x++) {
          const s = x / (w - 1);
          const rgb = color.hsvToRgb(this.hsv.h, s, v);
          const i = (y * w + x) * 4;
          d[i] = rgb.r; d[i + 1] = rgb.g; d[i + 2] = rgb.b; d[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);

      const cx = this.hsv.s * (w - 1);
      const cy = (1 - this.hsv.v) * (h - 1);
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.strokeStyle = this.hsv.v > 0.55 ? '#222' : '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    _drawHue() {
      const canvas = this.hueCanvas;
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;
      const img = ctx.createImageData(w, h);
      const d = img.data;
      for (let x = 0; x < w; x++) {
        const rgb = color.hsvToRgb((x / (w - 1)) * 360, 1, 1);
        for (let y = 0; y < h; y++) {
          const i = (y * w + x) * 4;
          d[i] = rgb.r; d[i + 1] = rgb.g; d[i + 2] = rgb.b; d[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);

      const cx = (this.hsv.h / 360) * (w - 1);
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - 4, 0);
      ctx.lineTo(cx + 4, 0);
      ctx.lineTo(cx, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  PC.Palette = Palette;
  PC.PRESET_COLORS = PRESETS;
})();
