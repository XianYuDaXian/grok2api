function normalizeSourceText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeHttpUrl(value) {
  const raw = String(value || '').trim();
  if (!/^https?:\/\//i.test(raw)) return '';
  try {
    return new URL(raw).toString();
  } catch (error) {
    return '';
  }
}

function getSourceHostname(value) {
  try {
    const parsed = new URL(String(value || ''));
    return parsed.hostname.replace(/^www\./i, '');
  } catch (error) {
    return '';
  }
}

export function normalizeMediaUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:')) return raw;
  if (/^(?:https?:)?\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw, window.location.origin);
      const host = String(parsed.hostname || '').toLowerCase();
      const path = String(parsed.pathname || '').trim();
      const marker = '/v1/files/image/';
      if (path.includes(marker)) {
        return path.slice(path.indexOf(marker));
      }
      if (host === 'localhost' || host === '127.0.0.1') {
        return path || '';
      }
      if (host === 'assets.grok.com' && path) {
        return `/v1/files/image${path.startsWith('/') ? path : `/${path}`}`;
      }
      return raw;
    } catch (error) {
      return raw;
    }
  }
  const basePath = raw.startsWith('/') ? raw : `/${raw}`;
  return basePath.startsWith('/v1/files/image/')
    ? basePath
    : `/v1/files/image${basePath}`;
}

function parseRenderingCards(rendering) {
  const rawModelResponse = rendering && rendering.rawModelResponse && typeof rendering.rawModelResponse === 'object'
    ? rendering.rawModelResponse
    : null;
  const rawCards = Array.isArray(rawModelResponse && rawModelResponse.cardAttachmentsJson)
    ? rawModelResponse.cardAttachmentsJson
    : [];
  const cardMap = new Map();
  rawCards.forEach((raw) => {
    if (typeof raw !== 'string' || !raw.trim()) return;
    try {
      const card = JSON.parse(raw);
      if (!card || typeof card !== 'object' || !card.id) return;
      cardMap.set(String(card.id), card);
    } catch (error) {
      // 忽略损坏卡片
    }
  });
  return cardMap;
}

function buildCardItem(card, fallbackKey = '') {
  const image = card && card.image && typeof card.image === 'object' ? card.image : null;
  const chunk = card && card.image_chunk && typeof card.image_chunk === 'object' ? card.image_chunk : null;
  const rawSrc = String((image && (image.original || image.link || image.thumbnail)) || (chunk && chunk.imageUrl) || '').trim();
  const src = normalizeMediaUrl(rawSrc);
  if (!src) return null;
  const sourceHref = normalizeHttpUrl((image && (image.link || image.original)) || '');
  const fallbackSrc = String((image && image.thumbnail) || '').trim();
  const caption = normalizeSourceText((image && image.title) || (chunk && chunk.imageTitle) || '');
  return {
    key: card && card.id ? `card:${card.id}` : fallbackKey || `url:${src}`,
    cardId: card && card.id ? String(card.id) : '',
    src,
    alt: caption || 'image',
    caption,
    sourceHref,
    sourceLabel: sourceHref ? getSourceHostname(sourceHref) : '',
    fallbackSrc
  };
}

export function buildMediaItems(rendering) {
  if (!rendering || typeof rendering !== 'object') return [];
  const items = [];
  const seen = new Set();
  const pushItem = (item) => {
    if (!item || !item.key || seen.has(item.key)) return;
    seen.add(item.key);
    items.push(item);
  };

  const cardMap = parseRenderingCards(rendering);
  cardMap.forEach((card) => {
    const cType = String(card && card.type || '');
    const cardType = String(card && card.cardType || '');
    if (
      cType === 'render_searched_image' ||
      cType === 'render_edited_image' ||
      cType === 'render_generated_image' ||
      cardType === 'generated_image_card'
    ) {
      pushItem(buildCardItem(card));
    }
  });

  const extraImages = Array.isArray(rendering.extraImages) ? rendering.extraImages : [];
  extraImages.forEach((url) => {
    const src = normalizeMediaUrl(url);
    if (!src) return;
    pushItem({
      key: `url:${src}`,
      cardId: '',
      src,
      alt: 'image',
      caption: '',
      sourceHref: '',
      sourceLabel: '',
      fallbackSrc: ''
    });
  });

  return items;
}
