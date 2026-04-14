import { describe, expect, it } from 'vitest';
import { renderLiteMarkdown, splitStableAndTail } from '../stream_blocks.js';

describe('splitStableAndTail', () => {
  it('保留最后一个未闭合段落在 live tail', () => {
    const result = splitStableAndTail('第一段\\n\\n第二段未结束');
    expect(result.stableText).toBe('第一段\n\n');
    expect(result.liveTailText).toBe('第二段未结束');
  });

  it('未闭合代码块不进入稳定区', () => {
    const result = splitStableAndTail('前言\\n\\n```js\\nconst x = 1;');
    expect(result.stableText).toBe('前言\n\n');
    expect(result.liveTailText).toContain('```js');
  });
});

describe('renderLiteMarkdown', () => {
  it('渲染标题和粗体', () => {
    const html = renderLiteMarkdown('# 标题\\n\\n**重点**');
    expect(html).toContain('stream-lite-heading');
    expect(html).toContain('<strong>重点</strong>');
  });

  it('把图片 marker 渲染成内联插槽', () => {
    const html = renderLiteMarkdown('前文\\n\\n@@GROK_MEDIA_CARD_abc@@\\n\\n后文', {
      resolveRenderGroup: (ids) => ids.map((id) => `<div class="stream-media-slot" data-media-key="card:${id}"></div>`).join('')
    });
    expect(html).toContain('data-media-key="card:abc"');
  });

  it('流式阶段立即把 think 包进样式块', () => {
    const html = renderLiteMarkdown('<think>\\n[WebSearch] test\\n');
    expect(html).toContain('class="think-block"');
    expect(html).toContain('class="think-content"');
    expect(html).not.toContain('&lt;think&gt;');
  });

  it('流式阶段保留多 agent 思考块样式结构', () => {
    const html = renderLiteMarkdown('<think>\\n[Agent 1][WebSearch] Tesla Model Y\\nbrowse_page {"url":"https://example.com"}\\n[Agent 2][SearchImage] Tesla Model Y exterior\\n');
    expect(html).toContain('class="think-agents"');
    expect(html).toContain('class="think-agent"');
    expect(html).toContain('class="think-agent-items"');
    expect(html).toContain('class="think-item-row"');
    expect(html).toContain('browse_page');
  });

  it('轻量渲染支持 markdown 图片语法', () => {
    const html = renderLiteMarkdown('![demo](https://example.com/demo.png)');
    expect(html).toContain('class="message-image-card');
    expect(html).toContain('src="https://example.com/demo.png"');
  });
});
