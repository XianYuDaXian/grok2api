import { describe, expect, it, vi } from 'vitest';
import { PretextLayoutEngine } from '../pretext_layout.js';

describe('PretextLayoutEngine', () => {
  it('相同文本命中 prepare 缓存', () => {
    const prepareFn = vi.fn((text, font, options) => ({ text, font, options }));
    const layoutFn = vi.fn(() => ({ height: 24, lineCount: 1 }));
    const engine = new PretextLayoutEngine({ prepareFn, layoutFn, defaultFont: '16px Geist', defaultLineHeight: 24 });

    engine.prepareTail('hello', '16px Geist', { whiteSpace: 'pre-wrap' });
    engine.prepareTail('hello', '16px Geist', { whiteSpace: 'pre-wrap' });

    expect(prepareFn).toHaveBeenCalledTimes(1);
    expect(engine.measure(320, 24).height).toBe(24);
  });
});
