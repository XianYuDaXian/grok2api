import { layout, prepare } from '@chenglou/pretext';

export class PretextLayoutEngine {
  constructor(options = {}) {
    this.defaultFont = String(options.defaultFont || '').trim();
    this.defaultWhiteSpace = String(options.defaultWhiteSpace || 'pre-wrap');
    this.defaultLineHeight = Number(options.defaultLineHeight || 24);
    this.prepareFn = typeof options.prepareFn === 'function' ? options.prepareFn : prepare;
    this.layoutFn = typeof options.layoutFn === 'function' ? options.layoutFn : layout;
    this.cache = new Map();
    this.currentKey = '';
    this.currentPrepared = null;
  }

  prepareTail(text, font = this.defaultFont, options = {}) {
    const normalizedText = String(text || '');
    const normalizedFont = String(font || this.defaultFont || '').trim();
    const normalizedOptions = {
      whiteSpace: options.whiteSpace || this.defaultWhiteSpace
    };
    const cacheKey = JSON.stringify([normalizedText, normalizedFont, normalizedOptions.whiteSpace]);
    this.currentKey = cacheKey;
    if (!this.cache.has(cacheKey)) {
      this.cache.set(cacheKey, this.prepareFn(normalizedText, normalizedFont, normalizedOptions));
    }
    this.currentPrepared = this.cache.get(cacheKey);
    return this.currentPrepared;
  }

  measure(width, lineHeight = this.defaultLineHeight) {
    if (!this.currentPrepared) {
      return { height: 0, lineCount: 0 };
    }
    const normalizedWidth = Number(width || 0);
    if (!Number.isFinite(normalizedWidth) || normalizedWidth <= 0) {
      return { height: 0, lineCount: 0 };
    }
    const normalizedLineHeight = Number(lineHeight || this.defaultLineHeight);
    return this.layoutFn(this.currentPrepared, normalizedWidth, normalizedLineHeight);
  }

  invalidateOnFontChange(font = '') {
    const normalizedFont = String(font || '').trim();
    if (!normalizedFont || normalizedFont === this.defaultFont) return false;
    this.defaultFont = normalizedFont;
    this.currentKey = '';
    this.currentPrepared = null;
    return true;
  }
}
