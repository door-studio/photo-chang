/*
 * PhotoChang 修图工具 —— 像素引擎
 * 负责画布的像素级绘制：铅笔、画笔、橡皮、填充、直线、矩形、椭圆、文字、色彩调整。
 */
(function () {
  'use strict';
  const PC = (window.PC = window.PC || {});

  function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }

  const color = {
    hexToRgba(hex, alpha) {
      let h = String(hex == null ? '' : hex).trim().replace(/^#/, '');
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null;
      const n = parseInt(h, 16);
      return {
        r: (n >> 16) & 255,
        g: (n >> 8) & 255,
        b: n & 255,
        a: alpha == null ? 1 : alpha
      };
    },
    rgbaToHex(c) {
      const to = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
      return ('#' + to(c.r) + to(c.g) + to(c.b)).toUpperCase();
    },
    rgbaToCss(c) {
      return `rgba(${clamp(Math.round(c.r), 0, 255)},${clamp(Math.round(c.g), 0, 255)},${clamp(
        Math.round(c.b),
        0,
        255
      )},${clamp(c.a == null ? 1 : c.a, 0, 1)})`;
    },
    rgbToHsv(r, g, b) {
      r /= 255; g /= 255; b /= 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const d = max - min;
      let h = 0;
      if (d !== 0) {
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60;
        if (h < 0) h += 360;
      }
      return { h: h, s: max === 0 ? 0 : d / max, v: max };
    },
    hsvToRgb(h, s, v) {
      h = ((h % 360) + 360) % 360;
      const c = v * s;
      const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
      const m = v - c;
      let r = 0, g = 0, b = 0;
      if (h < 60) { r = c; g = x; }
      else if (h < 120) { r = x; g = c; }
      else if (h < 180) { g = c; b = x; }
      else if (h < 240) { g = x; b = c; }
      else if (h < 300) { r = x; b = c; }
      else { r = c; b = x; }
      return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
    },
    luminance(c) {
      return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    }
  };

  class Engine {
    constructor(canvas) {
      this.art = canvas;
      this.ctx = canvas.getContext('2d', { willReadFrequently: true });
    }

    get width() { return this.art.width; }
    get height() { return this.art.height; }

    /* ---------- 画布基础 ---------- */

    resize(w, h, keepContent) {
      const keep = keepContent ? this.snapshotCanvas() : null;
      this.art.width = Math.max(1, Math.round(w));
      this.art.height = Math.max(1, Math.round(h));
      this.ctx.clearRect(0, 0, this.art.width, this.art.height);
      if (keep) this.ctx.drawImage(keep, 0, 0);
    }

    clear() {
      this.ctx.clearRect(0, 0, this.width, this.height);
    }

    snapshotCanvas() {
      const c = document.createElement('canvas');
      c.width = this.width;
      c.height = this.height;
      c.getContext('2d').drawImage(this.art, 0, 0);
      return c;
    }

    restoreCanvas(src) {
      this.ctx.clearRect(0, 0, this.width, this.height);
      if (src) this.ctx.drawImage(src, 0, 0);
    }

    getImageData() {
      return this.ctx.getImageData(0, 0, this.width, this.height);
    }

    putImageData(data) {
      this.ctx.putImageData(data, 0, 0);
    }

    /* ---------- 自由绘制 ---------- */

    /** 铅笔 / 画笔 / 橡皮的一笔画。points 为画布坐标数组。 */
    stroke(points, options) {
      const size = Math.max(1, options.size || 1);
      const col = options.color || { r: 0, g: 0, b: 0, a: 1 };
      const erase = !!options.erase;
      if (!points.length) return;
      const ctx = this.ctx;
      ctx.save();
      if (erase) ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = color.rgbaToCss(col);

      if (size <= 1) {
        for (const p of points) ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      } else {
        const r = size / 2;
        for (let i = 0; i < points.length; i++) {
          const p = points[i];
          if (i > 0) {
            const prev = points[i - 1];
            const dist = Math.hypot(p.x - prev.x, p.y - prev.y);
            const steps = Math.max(1, Math.ceil(dist / Math.max(0.75, r * 0.45)));
            for (let s = 1; s < steps; s++) {
              const t = s / steps;
              this._stamp(prev.x + (p.x - prev.x) * t, prev.y + (p.y - prev.y) * t, r);
            }
          }
          this._stamp(p.x, p.y, r);
        }
      }
      ctx.restore();
    }

    _stamp(x, y, r) {
      const ctx = this.ctx;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    /** 油漆桶：按连通区域填充相同颜色。 */
    floodFill(sx, sy, fill) {
      const w = this.width;
      const h = this.height;
      sx = Math.round(sx);
      sy = Math.round(sy);
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) return false;

      const img = this.getImageData();
      const d = img.data;
      const at = (x, y) => (y * w + x) * 4;
      const start = at(sx, sy);
      const tr = d[start], tg = d[start + 1], tb = d[start + 2], ta = d[start + 3];
      const fr = Math.round(fill.r), fg = Math.round(fill.g), fb = Math.round(fill.b), fa = Math.round((fill.a == null ? 1 : fill.a) * 255);
      if (tr === fr && tg === fg && tb === fb && ta === fa) return false;

      const mask = new Uint8Array(w * h);
      const matches = (x, y) => {
        if (mask[y * w + x]) return false;
        const i = at(x, y);
        return d[i] === tr && d[i + 1] === tg && d[i + 2] === tb && d[i + 3] === ta;
      };
      const paint = (x, y) => {
        const i = at(x, y);
        d[i] = fr; d[i + 1] = fg; d[i + 2] = fb; d[i + 3] = fa;
        mask[y * w + x] = 1;
      };

      const stack = [sx, sy];
      while (stack.length) {
        const y = stack.pop();
        const x = stack.pop();
        if (!matches(x, y)) continue;
        let left = x;
        while (left > 0 && matches(left - 1, y)) left--;
        let right = x;
        while (right < w - 1 && matches(right + 1, y)) right++;
        for (let i = left; i <= right; i++) paint(i, y);
        for (let i = left; i <= right; i++) {
          if (y > 0 && matches(i, y - 1)) stack.push(i, y - 1);
          if (y < h - 1 && matches(i, y + 1)) stack.push(i, y + 1);
        }
      }
      this.putImageData(img);
      return true;
    }

    /* ---------- 图形 ---------- */

    /** 直线（Bresenham，1 像素锐利）；thickness > 1 时按圆头绘制。 */
    drawLine(x0, y0, x1, y1, col, thickness) {
      const w = Math.max(1, thickness || 1);
      const ctx = this.ctx;
      ctx.save();
      ctx.strokeStyle = color.rgbaToCss(col);
      ctx.fillStyle = color.rgbaToCss(col);
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.restore();
      if (w > 2) {
        // 加粗时补上两端圆头
        ctx.save();
        ctx.fillStyle = color.rgbaToCss(col);
        const r = w / 2;
        for (const p of [{ x: x0, y: y0 }, { x: x1, y: y1 }]) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    drawRect(x, y, w, h, col, filled, thickness) {
      const ctx = this.ctx;
      ctx.save();
      ctx.fillStyle = color.rgbaToCss(col);
      ctx.strokeStyle = color.rgbaToCss(col);
      ctx.lineWidth = Math.max(1, thickness || 1);
      if (filled) {
        ctx.fillRect(x, y, w, h);
      } else {
        ctx.strokeRect(
          Math.round(x) + 0.5 * (thickness > 1 ? 0 : 1),
          Math.round(y) + 0.5 * (thickness > 1 ? 0 : 1),
          Math.round(w),
          Math.round(h)
        );
      }
      ctx.restore();
    }

    drawEllipse(x, y, w, h, col, filled, thickness) {
      const ctx = this.ctx;
      const rx = Math.abs(w) / 2;
      const ry = Math.abs(h) / 2;
      const cx = x + w / 2;
      const cy = y + h / 2;
      ctx.save();
      ctx.fillStyle = color.rgbaToCss(col);
      ctx.strokeStyle = color.rgbaToCss(col);
      ctx.lineWidth = Math.max(1, thickness || 1);
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
      if (filled) ctx.fill();
      else ctx.stroke();
      ctx.restore();
    }

    /** 文字：family 为字体名，size 为字号，align 为 left/center/right。 */
    drawText(text, x, y, options) {
      const ctx = this.ctx;
      const size = options.size || 16;
      const family = options.family || 'sans-serif';
      ctx.save();
      ctx.font = `${size}px ${family}`;
      ctx.textBaseline = 'top';
      ctx.textAlign = options.align || 'left';
      ctx.fillStyle = color.rgbaToCss(options.color || { r: 0, g: 0, b: 0, a: 1 });
      ctx.fillText(text, x, y);
      ctx.restore();
    }

    measureText(text, options) {
      const ctx = this.ctx;
      ctx.save();
      ctx.font = `${(options.size || 16) / 1}px ${options.family || 'sans-serif'}`;
      const m = ctx.measureText(text);
      ctx.restore();
      return { width: m.width, height: (options.size || 16) * 1.2 };
    }

    /* ---------- 色彩调整 ---------- */

    adjust(options) {
      const img = this.getImageData();
      const d = img.data;
      const brightness = options.brightness || 0;
      const contrast = options.contrast || 0;
      const saturation = options.saturation || 0;
      const hueShift = options.hueShift || 0;
      const grayscale = options.grayscale ? 1 : 0;
      const invert = options.invert ? 1 : 0;

      const cFactor = (259 * (contrast * 2.55 + 255)) / (255 * (259 - contrast * 2.55));
      const satFactor = 1 + saturation / 100;

      for (let i = 0; i < d.length; i += 4) {
        let r = d[i], g = d[i + 1], b = d[i + 2];
        if (brightness) {
          r += brightness * 2.55;
          g += brightness * 2.55;
          b += brightness * 2.55;
        }
        if (contrast) {
          r = cFactor * (r - 128) + 128;
          g = cFactor * (g - 128) + 128;
          b = cFactor * (b - 128) + 128;
        }
        if (satFactor !== 1 || hueShift) {
          const hsv = color.rgbToHsv(clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255));
          const rgb = color.hsvToRgb(hsv.h + hueShift, clamp(hsv.s * satFactor, 0, 1), hsv.v);
          r = rgb.r; g = rgb.g; b = rgb.b;
        }
        if (grayscale) {
          const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          r = g = b = lum;
        }
        if (invert) {
          r = 255 - r; g = 255 - g; b = 255 - b;
        }
        d[i] = clamp(r, 0, 255);
        d[i + 1] = clamp(g, 0, 255);
        d[i + 2] = clamp(b, 0, 255);
      }
      this.putImageData(img);
    }

    /** 导出 PNG（保留透明通道）。 */
    toPngBlob(cb, type) {
      this.art.toBlob((blob) => cb(blob), type || 'image/png');
    }
  }

  PC.color = color;
  PC.Engine = Engine;
  PC.clamp = clamp;
})();
