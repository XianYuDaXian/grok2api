import { normalizeMediaUrl } from './media_items.js';
import { PretextLayoutEngine } from './pretext_layout.js';

function syncMediaCardNode(node, item) {
  node.dataset.mediaKey = item.key;
  node.classList.remove('is-broken');
  node.querySelectorAll('.img-retry').forEach((retryNode) => retryNode.remove());
  let img = node.querySelector('img');
  if (!(img instanceof HTMLImageElement)) {
    img = document.createElement('img');
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.crossOrigin = 'anonymous';
    node.insertBefore(img, node.firstChild);
  }
  if (img.getAttribute('src') !== item.src) {
    img.setAttribute('src', item.src);
  }
  img.dataset.originalSrc = item.src;
  img.setAttribute('alt', item.alt || 'image');
  delete img.dataset.failed;
  delete img.dataset.fallbackTried;
  img.dataset.streamRetryCount = '0';
  img.classList.remove('hidden');
  const retryTimerId = Number(img.dataset.retryTimerId || 0);
  if (retryTimerId) {
    clearTimeout(retryTimerId);
    delete img.dataset.retryTimerId;
  }
  if (item.fallbackSrc) {
    img.dataset.fallbackSrc = item.fallbackSrc;
  } else {
    delete img.dataset.fallbackSrc;
  }

  let sourceNode = node.querySelector('.message-image-source');
  if (item.sourceHref) {
    if (!(sourceNode instanceof HTMLAnchorElement)) {
      sourceNode = document.createElement('a');
      sourceNode.className = 'message-image-source';
      sourceNode.target = '_blank';
      sourceNode.rel = 'noopener noreferrer';
      node.appendChild(sourceNode);
    }
    sourceNode.href = item.sourceHref;
    sourceNode.title = item.sourceHref;
    sourceNode.textContent = item.sourceLabel || item.sourceHref;
  } else if (sourceNode) {
    sourceNode.remove();
  }

  let captionNode = node.querySelector('.message-image-caption');
  if (item.caption) {
    if (!(captionNode instanceof HTMLElement)) {
      captionNode = document.createElement('figcaption');
      captionNode.className = 'message-image-caption';
      node.appendChild(captionNode);
    }
    captionNode.textContent = item.caption;
  } else if (captionNode) {
    captionNode.remove();
  }
}

function createMediaCardNode(item) {
  const card = document.createElement('figure');
  card.className = 'message-image-card';
  syncMediaCardNode(card, item);
  return card;
}

function syncOrderedChildren(parent, desiredNodes) {
  if (!parent) return;
  const desiredSet = new Set(desiredNodes);
  Array.from(parent.children).forEach((child) => {
    if (!desiredSet.has(child)) {
      child.remove();
    }
  });
  desiredNodes.forEach((node, index) => {
    const currentNode = parent.children[index];
    if (currentNode !== node) {
      parent.insertBefore(node, currentNode || null);
    }
  });
}

export class StreamRenderer {
  constructor(options) {
    this.contentNode = options.contentNode;
    this.stableRoot = options.stableRoot;
    this.liveTailRoot = options.liveTailRoot;
    this.mediaRoot = options.mediaRoot;
    this.renderMarkdown = options.renderMarkdown;
    this.renderLiteMarkdown = options.renderLiteMarkdown;
    this.getWidth = typeof options.getWidth === 'function' ? options.getWidth : () => this.liveTailRoot.clientWidth || this.contentNode.clientWidth || 0;
    this.getFont = typeof options.getFont === 'function' ? options.getFont : () => '';
    this.getLineHeight = typeof options.getLineHeight === 'function' ? options.getLineHeight : () => 24;
    this.layoutEngine = options.layoutEngine || new PretextLayoutEngine();
    this.mediaNodeCache = new Map();
    this.state = {
      stableText: '',
      liveTailText: '',
      mediaItems: []
    };
  }

  pushDelta(payload) {
    return this.applyState(payload, false);
  }

  finalize(payload) {
    return this.applyState(payload, true);
  }

  restoreFromDraft(draftState, renderState = {}) {
    if (!draftState || typeof draftState !== 'object') return this.applyState(renderState, false);
    return this.applyState({
      stableText: draftState.stableText || '',
      liveTailText: draftState.liveTailText || '',
      imageSourceMap: renderState.imageSourceMap || null,
      mediaItems: Array.isArray(draftState.mediaItems) ? draftState.mediaItems : (renderState.mediaItems || [])
    }, false);
  }

  resize() {
    return this.updateLiveTail(this.state.liveTailText, true);
  }

  getDraftState() {
    return {
      stableText: this.state.stableText,
      liveTailText: this.state.liveTailText,
      mediaItems: this.state.mediaItems
    };
  }

  applyState(payload, finalize = false) {
    const nextStableText = String(payload && payload.stableText || '');
    const nextLiveTailText = finalize ? '' : String(payload && payload.liveTailText || '');
    const nextMediaItems = Array.isArray(payload && payload.mediaItems) ? payload.mediaItems : [];
    const imageSourceMap = payload && payload.imageSourceMap ? payload.imageSourceMap : null;

    const stableChanged = nextStableText !== this.state.stableText || finalize;
    const liveChanged = nextLiveTailText !== this.state.liveTailText || finalize;
    const mediaChanged = JSON.stringify(nextMediaItems) !== JSON.stringify(this.state.mediaItems);
    let placedKeys = new Set();

    if (stableChanged) {
      const stableHtml = nextStableText ? this.renderMarkdown(nextStableText, imageSourceMap) : '';
      this.stableRoot.innerHTML = this.injectMediaSlotMarkup(stableHtml, nextMediaItems);
    }
    if (stableChanged || mediaChanged) {
      placedKeys = this.patchRenderedInlineFigures(this.stableRoot, nextMediaItems, placedKeys);
      placedKeys = this.patchInlineSlots(this.stableRoot, nextMediaItems, placedKeys);
    }
    const tailHeightDelta = liveChanged
      ? this.updateLiveTail(nextLiveTailText, nextMediaItems, false)
      : 0;
    if (liveChanged || mediaChanged) {
      placedKeys = this.patchInlineSlots(this.liveTailRoot, nextMediaItems, placedKeys);
    }
    if (mediaChanged || stableChanged || liveChanged) {
      this.patchMedia(nextMediaItems, placedKeys);
    }

    this.state = {
      stableText: nextStableText,
      liveTailText: nextLiveTailText,
      mediaItems: nextMediaItems
    };

    return {
      stableChanged,
      liveChanged,
      mediaChanged,
      tailHeightDelta
    };
  }

  updateLiveTail(nextLiveTailText, mediaItems, forceMeasure) {
    const currentHeight = Number(this.liveTailRoot.dataset.predictedHeight || 0);
    if (!nextLiveTailText) {
      this.liveTailRoot.innerHTML = '';
      this.liveTailRoot.style.minHeight = '0px';
      this.liveTailRoot.dataset.predictedHeight = '0';
      return -currentHeight;
    }

    const font = this.getFont();
    this.layoutEngine.invalidateOnFontChange(font);
    this.layoutEngine.prepareTail(nextLiveTailText, font, { whiteSpace: 'pre-wrap' });
    const lineHeight = this.getLineHeight();
    const width = this.getWidth();
    const measured = forceMeasure ? this.layoutEngine.measure(width, lineHeight) : this.layoutEngine.measure(width, lineHeight);
    const nextHeight = Number(measured && measured.height || 0);

    this.liveTailRoot.style.minHeight = nextHeight > 0 ? `${nextHeight}px` : '0px';
    this.liveTailRoot.dataset.predictedHeight = String(nextHeight || 0);
    const liteHtml = this.renderLiteMarkdown(nextLiveTailText, {
      resolveRenderGroup: (ids) => this.buildInlineSlotMarkup(ids, mediaItems)
    });
    this.liveTailRoot.innerHTML = liteHtml;
    return nextHeight - currentHeight;
  }

  buildInlineSlotMarkup(ids, items) {
    const rendered = [];
    ids.forEach((id) => {
      const item = items.find((candidate) => candidate && candidate.cardId && candidate.cardId === id);
      if (!item) return;
      rendered.push(`<div class="stream-media-slot" data-media-key="${item.key}"></div>`);
    });
    return rendered.join('');
  }

  injectMediaSlotMarkup(html, items) {
    if (!html || !Array.isArray(items) || !items.length) return html;
    return String(html).replace(
      /@@GROK_MEDIA_CARD_([^@]+)@@/g,
      (match, cardId) => {
        const item = items.find((candidate) => candidate && candidate.cardId && candidate.cardId === String(cardId));
        return item ? `<div class="stream-media-slot" data-media-key="${item.key}"></div>` : '';
      }
    );
  }

  getMediaNode(item) {
    const existing = this.mediaNodeCache.get(item.key);
    if (existing) {
      syncMediaCardNode(existing, item);
      return existing;
    }
    const created = createMediaCardNode(item);
    this.mediaNodeCache.set(item.key, created);
    return created;
  }

  patchInlineSlots(root, items, placedKeys = new Set()) {
    if (!root || !root.querySelectorAll) return placedKeys;
    const slots = root.querySelectorAll('.stream-media-slot[data-media-key]');
    slots.forEach((slot) => {
      const key = String(slot.getAttribute('data-media-key') || '').trim();
      if (!key) return;
      const item = items.find((candidate) => candidate && candidate.key === key);
      if (!item) return;
      const node = this.getMediaNode(item);
      if (slot.firstElementChild !== node) {
        slot.replaceChildren(node);
      }
      placedKeys.add(key);
    });
    return placedKeys;
  }

  patchRenderedInlineFigures(root, items, placedKeys = new Set()) {
    if (!root || !root.querySelectorAll) return placedKeys;
    const figures = root.querySelectorAll('.message-image-card');
    figures.forEach((figure) => {
      const img = figure.querySelector('img');
      const src = normalizeMediaUrl(img && (img.currentSrc || img.getAttribute('src') || ''));
      if (!src) return;
      const item = items.find((candidate) => candidate && candidate.src === src);
      if (!item || placedKeys.has(item.key)) return;
      const node = this.getMediaNode(item);
      figure.replaceWith(node);
      placedKeys.add(item.key);
    });
    return placedKeys;
  }

  patchMedia(items, placedKeys = new Set()) {
    let grid = this.mediaRoot.querySelector('.img-grid');
    if (!grid) {
      grid = document.createElement('div');
      grid.className = 'img-grid assistant-media-grid';
      this.mediaRoot.appendChild(grid);
    }

    const desiredNodes = [];
    let remainingCount = 0;
    items.forEach((item) => {
      if (placedKeys.has(item.key)) return;
      const node = this.getMediaNode(item);
      desiredNodes.push(node);
      remainingCount += 1;
    });
    syncOrderedChildren(grid, desiredNodes);
    this.mediaRoot.classList.toggle('hidden', remainingCount === 0);
  }
}
