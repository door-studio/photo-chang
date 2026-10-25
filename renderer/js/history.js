/*
 * PhotoChang 修图工具 —— 撤销/重做历史
 */
(function () {
  'use strict';
  const PC = (window.PC = window.PC || {});

  class History {
    constructor(engine, options) {
      const opts = options || {};
      this.engine = engine;
      this.limit = opts.limit || 40;
      this.maxBytes = opts.maxBytes || 320 * 1024 * 1024;
      this.stack = [];
      this.index = -1;
      this.bytes = 0;
    }

    /** 生成当前画面的快照。 */
    capture() {
      const canvas = this.engine.snapshotCanvas();
      return { canvas: canvas, bytes: canvas.width * canvas.height * 4 };
    }

    reset(snapshot) {
      this.stack = [];
      this.index = -1;
      this.bytes = 0;
      if (snapshot) this.push(snapshot);
    }

    push(snapshot) {
      while (this.stack.length > this.index + 1) {
        this.bytes -= this.stack.pop().bytes;
      }
      this.stack.push(snapshot);
      this.bytes += snapshot.bytes;
      this.index = this.stack.length - 1;
      while (this.stack.length > 1 && (this.bytes > this.maxBytes || this.stack.length > this.limit)) {
        this.bytes -= this.stack.shift().bytes;
        this.index--;
      }
      return snapshot;
    }

    canUndo() { return this.index > 0; }
    canRedo() { return this.index >= 0 && this.index < this.stack.length - 1; }

    undo() {
      if (!this.canUndo()) return null;
      this.index--;
      return this.stack[this.index];
    }

    redo() {
      if (!this.canRedo()) return null;
      this.index++;
      return this.stack[this.index];
    }

    get size() { return this.stack.length; }
  }

  PC.History = History;
})();
