import { describe, expect, it } from 'vitest';
import { buildMediaItems } from '../media_items.js';

describe('buildMediaItems', () => {
  it('优先使用 card key，并去重 extraImages', () => {
    const rendering = {
      rawModelResponse: {
        cardAttachmentsJson: [
          JSON.stringify({
            id: 'abc',
            type: 'render_generated_image',
            image: {
              original: '/foo/bar.png',
              title: 'test image'
            }
          })
        ]
      },
      extraImages: ['/foo/bar.png', '/foo/baz.png']
    };

    const items = buildMediaItems(rendering);
    expect(items[0].key).toBe('card:abc');
    expect(items.some((item) => item.key === 'url:/v1/files/image/foo/baz.png')).toBe(true);
  });

  it('无效来源链接不会退化成可见 badge 文本', () => {
    const rendering = {
      rawModelResponse: {
        cardAttachmentsJson: [
          JSON.stringify({
            id: 'broken',
            type: 'render_generated_image',
            image: {
              original: '/foo/demo.png',
              link: 'citation_card\'',
              title: 'demo'
            }
          })
        ]
      }
    };

    const items = buildMediaItems(rendering);
    expect(items).toHaveLength(1);
    expect(items[0].sourceHref).toBe('');
    expect(items[0].sourceLabel).toBe('');
  });
});
