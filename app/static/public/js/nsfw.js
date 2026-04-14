(() => {
  const imagePromptInput = document.getElementById('imagePromptInput');
  const videoPromptInput = document.getElementById('videoPromptInput');
  const ratioSelect = document.getElementById('ratioSelect');
  const videoParallelSelect = document.getElementById('videoParallelSelect');
  const resolutionSelect = document.getElementById('resolutionSelect');
  const videoLengthSelect = document.getElementById('videoLengthSelect');
  const nsfwSelect = document.getElementById('nsfwSelect');
  const qualityButtons = document.querySelectorAll('.nsfw-quality-btn');

  const generateBatchBtn = document.getElementById('generateBatchBtn');
  const stopBatchBtn = document.getElementById('stopBatchBtn');
  const nextBatchBtn = document.getElementById('nextBatchBtn');
  const clearImagesBtn = document.getElementById('clearImagesBtn');

  const startVideoBtn = document.getElementById('startVideoBtn');
  const stopVideoBtn = document.getElementById('stopVideoBtn');
  const clearVideosBtn = document.getElementById('clearVideosBtn');

  const imageStatusText = document.getElementById('imageStatusText');
  const videoStatusText = document.getElementById('videoStatusText');
  const selectedMeta = document.getElementById('selectedMeta');
  const imageCount = document.getElementById('imageCount');
  const videoCount = document.getElementById('videoCount');

  const candidateEmpty = document.getElementById('candidateEmpty');
  const candidateWaterfall = document.getElementById('candidateWaterfall');
  const videoEmpty = document.getElementById('videoEmpty');
  const videoResults = document.getElementById('videoResults');
  const nsfwVideoReverseBtn = document.getElementById('nsfwVideoReverseBtn');
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightboxImg');
  const closeLightbox = document.getElementById('closeLightbox');
  const lightboxPrev = document.getElementById('lightboxPrev');
  const lightboxNext = document.getElementById('lightboxNext');
  const lightboxEditor = document.querySelector('.lightbox-editor');
  const lightboxEditInput = document.getElementById('lightboxEditInput');
  const lightboxEditSend = document.getElementById('lightboxEditSend');
  const lightboxEditProgressWrap = document.getElementById('lightboxEditProgressWrap');
  const lightboxEditProgressBar = document.getElementById('lightboxEditProgressBar');
  const lightboxEditProgressText = document.getElementById('lightboxEditProgressText');
  const lightboxHistoryCount = document.getElementById('lightboxHistoryCount');
  const lightboxHistoryEmpty = document.getElementById('lightboxHistoryEmpty');
  const lightboxHistoryList = document.getElementById('lightboxHistoryList');

  const state = {
    candidates: [],
    selectedCandidateId: '',
    imageTaskId: '',
    imageSource: null,
    imageRunning: false,
    imageTargetTotal: 0,
    imageAuthHeader: '',
    imageRawPublicKey: '',

    videoJobs: new Map(),
    videoTaskIds: [],
    videoRunning: false,
    videoResultsReversed: false,
    videoOrderSeed: 0,
    videoAuthHeader: '',
    videoRawPublicKey: '',
    lightboxIndex: -1,
    editProgressValue: 0,
    editProgressTimer: null,
    editProgressHideTimer: null,
    editProgressStartedAt: 0,
    editDurationEstimateMs: 14000,
    imageFullscreen: false,
    imageProMode: false,
  };
  let lightboxEditAbortController = null;
  if (lightboxEditSend) {
    lightboxEditSend.disabled = true;
  }

  function toast(message, type) {
    if (typeof showToast === 'function') {
      showToast(message, type);
    }
  }

  function setImageQualityMode(enabled) {
    state.imageProMode = Boolean(enabled);
    qualityButtons.forEach(btn => {
      const isActive = String(btn.dataset.pro) === String(state.imageProMode);
      btn.classList.toggle('active', isActive);
    });
  }

  function normalizeUploadErrorMessage(message) {
    const text = String(message || '').trim();
    if (!text) return text;
    if (/content_moderated|content[- ]moderated|content is moderated/i.test(text)) {
      return '图片内容触发审核限制，无法上传。请更换图片后重试。';
    }
    return text;
  }

  async function parseApiErrorText(res, fallbackText) {
    const text = await res.text();
    if (!text) return fallbackText || `请求失败：HTTP ${res.status}`;
    try {
      const data = JSON.parse(text);
      if (data && typeof data === 'object') {
        if (data.error && data.error.message) {
          return normalizeUploadErrorMessage(String(data.error.message));
        }
        if (data.detail) {
          return normalizeUploadErrorMessage(String(data.detail));
        }
        if (data.message) {
          return normalizeUploadErrorMessage(String(data.message));
        }
      }
    } catch (e) {
      // ignore
    }
    return normalizeUploadErrorMessage(text || fallbackText);
  }

  function ensureVideoRenameDialog() {
    let overlay = document.getElementById('nsfwVideoRenameDialog');
    if (overlay) return overlay;
    const style = document.createElement('style');
    style.textContent = `
      .nsfw-rename-dialog-overlay {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        background: rgba(15, 23, 42, 0.45);
        backdrop-filter: blur(8px);
        z-index: 500;
      }
      .nsfw-rename-dialog-overlay.hidden { display: none; }
      .nsfw-rename-dialog {
        width: min(420px, calc(100vw - 32px));
        border-radius: 16px;
        border: 1px solid var(--border);
        background: var(--nsfw-surface, var(--bg));
        color: var(--fg);
        box-shadow: 0 24px 80px rgba(15, 23, 42, 0.28);
        padding: 18px;
      }
      .nsfw-rename-dialog-title {
        font-size: 16px;
        font-weight: 600;
      }
      .nsfw-rename-dialog-desc {
        margin-top: 6px;
        font-size: 13px;
        line-height: 1.6;
        color: var(--accents-5);
      }
      .nsfw-rename-dialog-input {
        width: 100%;
        margin-top: 14px;
        border-radius: 12px;
        border: 1px solid var(--border);
        background: var(--accents-1);
        color: var(--fg);
        padding: 12px 14px;
        outline: none;
      }
      .nsfw-rename-dialog-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 16px;
      }
      html[data-theme='dark'] .nsfw-rename-dialog {
        background: #141b25;
        border-color: #2b3440;
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
      }
      html[data-theme='dark'] .nsfw-rename-dialog-input {
        background: #101722;
        border-color: #2b3440;
        color: #f5f7fb;
      }
    `;
    document.head.appendChild(style);
    overlay = document.createElement('div');
    overlay.id = 'nsfwVideoRenameDialog';
    overlay.className = 'nsfw-rename-dialog-overlay hidden';
    overlay.innerHTML = `
      <div class="nsfw-rename-dialog" role="dialog" aria-modal="true" aria-labelledby="nsfwVideoRenameDialogTitle">
        <div id="nsfwVideoRenameDialogTitle" class="nsfw-rename-dialog-title">重命名视频</div>
        <div class="nsfw-rename-dialog-desc">新的名称会写入本地元数据，并同步到视频选择与缓存管理。</div>
        <input id="nsfwVideoRenameDialogInput" class="nsfw-rename-dialog-input" type="text" maxlength="120" placeholder="输入视频名称">
        <div class="nsfw-rename-dialog-actions">
          <button id="nsfwVideoRenameDialogCancel" type="button" class="geist-button-outline">取消</button>
          <button id="nsfwVideoRenameDialogClear" type="button" class="geist-button-outline">恢复默认</button>
          <button id="nsfwVideoRenameDialogOk" type="button" class="geist-button">保存</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  function openVideoRenameDialog(initialValue = '') {
    const overlay = ensureVideoRenameDialog();
    const input = overlay.querySelector('#nsfwVideoRenameDialogInput');
    const okBtn = overlay.querySelector('#nsfwVideoRenameDialogOk');
    const clearBtn = overlay.querySelector('#nsfwVideoRenameDialogClear');
    const cancelBtn = overlay.querySelector('#nsfwVideoRenameDialogCancel');
    return new Promise((resolve) => {
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        overlay.classList.add('hidden');
        overlay.removeEventListener('click', handleOverlayClick);
        document.removeEventListener('keydown', handleKeydown, true);
        okBtn.removeEventListener('click', handleOk);
        clearBtn.removeEventListener('click', handleClear);
        cancelBtn.removeEventListener('click', handleCancel);
        resolve(value);
      };
      const handleOk = () => finish(String(input.value || '').trim());
      const handleClear = () => finish('');
      const handleCancel = () => finish(null);
      const handleOverlayClick = (event) => {
        if (event.target === overlay) finish(null);
      };
      const handleKeydown = (event) => {
        if (overlay.classList.contains('hidden')) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          finish(null);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          handleOk();
        }
      };
      input.value = String(initialValue || '').trim();
      overlay.classList.remove('hidden');
      overlay.addEventListener('click', handleOverlayClick);
      document.addEventListener('keydown', handleKeydown, true);
      okBtn.addEventListener('click', handleOk);
      clearBtn.addEventListener('click', handleClear);
      cancelBtn.addEventListener('click', handleCancel);
      window.setTimeout(() => {
        input.focus();
        input.select();
      }, 0);
    });
  }

  function setLightboxKeyboardShift(px) {
    if (!lightbox) return;
    const safe = Math.max(0, Math.round(Number(px) || 0));
    lightbox.style.setProperty('--keyboard-shift', `${safe}px`);
  }

  function updateLightboxKeyboardShift() {
    if (!lightbox || !lightbox.classList.contains('active')) {
      setLightboxKeyboardShift(0);
      return;
    }
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (!isMobile || document.activeElement !== lightboxEditInput) {
      setLightboxKeyboardShift(0);
      return;
    }
    const vv = window.visualViewport;
    if (!vv) {
      setLightboxKeyboardShift(0);
      return;
    }
    const overlap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    const shift = overlap > 0 ? Math.min(280, overlap + 12) : 0;
    setLightboxKeyboardShift(shift);
  }

  function shortId(value) {
    const raw = String(value || '');
    if (!raw) return '-';
    if (raw.length <= 12) return raw;
    return `${raw.slice(0, 6)}...${raw.slice(-6)}`;
  }

  function resolveNsfwVideoRenameKey(item) {
    if (!item) return '';
    return String(
      item.dataset.postId
      || ''
    ).trim();
  }

  function extractNsfwVideoPostId(text) {
    const raw = String(text || '').trim();
    if (!raw) return '';
    const direct = raw.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g);
    return direct && direct.length ? direct[direct.length - 1] : '';
  }

  function getNsfwStoredVideoTitle(item) {
    if (!item) return '';
    return String(
      item.dataset.displayName
      || ''
    ).trim();
  }

  async function setNsfwStoredVideoTitle(item, title) {
    const postId = resolveNsfwVideoRenameKey(item)
      || extractNsfwVideoPostId(item.dataset.videoUrl || '')
      || extractNsfwVideoPostId(item.dataset.taskId || '')
      || extractNsfwVideoPostId(item.dataset.name || '');
    if (!postId) {
      throw new Error('missing_post_id');
    }
    const authHeader = await ensurePublicKey();
    if (authHeader === null) {
      throw new Error('missing_public_key');
    }
    const res = await fetch('/v1/public/video/rename', {
      method: 'POST',
      headers: {
        ...buildAuthHeaders(authHeader),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        post_id: postId,
        name: String(item.dataset.videoUrl || '').trim(),
        display_name: String(title || '').trim(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.status !== 'success') {
      throw new Error(data.detail || 'rename_failed');
    }
    item.dataset.postId = postId;
    item.dataset.displayName = String(data.result?.display_name || '');
  }

  function applyNsfwVideoCardTitle(item, fallbackTitle = '') {
    if (!item) return;
    const titleEl = item.querySelector('.video-item-title');
    if (!titleEl) return;
    const baseTitle = String(item.dataset.defaultTitle || fallbackTitle || titleEl.textContent || '').trim() || '任务';
    item.dataset.defaultTitle = baseTitle;
    const stored = getNsfwStoredVideoTitle(item);
    titleEl.textContent = stored || baseTitle;
  }

  function getParentMemoryApi() {
    return window.ParentPostMemory || null;
  }

  function rememberParentPost(entry) {
    const api = getParentMemoryApi();
    if (!api || !entry) return;
    try {
      api.remember(entry);
    } catch (e) {
      // ignore
    }
  }

  function setChip(el, text, cls) {
    if (!el) return;
    el.textContent = text;
    el.classList.remove('running', 'done', 'error');
    if (cls) el.classList.add(cls);
  }

  function setLightboxImageFullscreen(enabled) {
    if (!lightbox) return;
    state.imageFullscreen = Boolean(enabled);
    lightbox.classList.toggle('image-focus-mode', state.imageFullscreen);
  }

  function updateCounters() {
    if (imageCount) {
      imageCount.textContent = `${state.candidates.length} 张`;
    }
    if (videoCount) {
      videoCount.textContent = `${state.videoTaskIds.length} 个任务`;
    }
    if (nsfwVideoReverseBtn) {
      nsfwVideoReverseBtn.textContent = state.videoResultsReversed ? '正序显示' : '倒序显示';
      nsfwVideoReverseBtn.setAttribute('aria-pressed', state.videoResultsReversed ? 'true' : 'false');
    }
  }

  function syncVideoResultsOrder() {
    if (!videoResults) return;
    const items = Array.from(videoResults.querySelectorAll('.video-item'));
    if (!items.length) return;
    items.sort((a, b) => {
      const aOrder = Number(a.dataset.order || '0');
      const bOrder = Number(b.dataset.order || '0');
      return state.videoResultsReversed ? (bOrder - aOrder) : (aOrder - bOrder);
    });
    items.forEach((item) => videoResults.appendChild(item));
  }

  function setToggleButtonState(button, running, runningText) {
    if (!button) return;
    if (!button.dataset.defaultText) {
      button.dataset.defaultText = String(button.textContent || '').trim() || '';
    }
    button.dataset.running = running ? '1' : '0';
    button.textContent = running ? runningText : (button.dataset.defaultText || button.textContent);
  }

  function updateImageButtons() {
    const running = state.imageRunning;
    setToggleButtonState(generateBatchBtn, running, '中止');
    if (generateBatchBtn) generateBatchBtn.disabled = false;
    if (nextBatchBtn) nextBatchBtn.disabled = state.imageRunning;
    if (stopBatchBtn) stopBatchBtn.disabled = !state.imageRunning;
  }

  function updateVideoButtons() {
    const hasSelected = Boolean(getSelectedCandidate());
    const running = state.videoRunning;
    setToggleButtonState(startVideoBtn, running, '中止');
    if (startVideoBtn) startVideoBtn.disabled = running ? false : !hasSelected;
    if (stopVideoBtn) stopVideoBtn.disabled = !state.videoRunning;
  }

  function inferMime(raw) {
    if (!raw) return 'image/jpeg';
    if (raw.startsWith('iVBOR')) return 'image/png';
    if (raw.startsWith('/9j/')) return 'image/jpeg';
    if (raw.startsWith('R0lGOD')) return 'image/gif';
    return 'image/jpeg';
  }

  function looksLikeBase64(value) {
    const raw = String(value || '').replace(/\s+/g, '');
    if (!raw || raw.length < 32) return false;
    return /^[A-Za-z0-9+/_=-]+$/.test(raw);
  }

  function toDataUrl(raw) {
    const value = String(raw || '');
    if (!value) return '';
    if (value.startsWith('data:')) return value;
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return value;
    }
    const compact = value.replace(/\s+/g, '');
    if (value.startsWith('/') && !looksLikeBase64(compact)) {
      return value;
    }
    if (!looksLikeBase64(compact)) {
      return value;
    }
    const mime = inferMime(compact);
    return `data:${mime};base64,${compact}`;
  }

  function normalizeAuthHeader(authHeader) {
    if (!authHeader) return '';
    if (authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7).trim();
    }
    return authHeader;
  }

  function buildImagineSseUrl(taskId, rawPublicKey) {
    const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
    const params = new URLSearchParams();
    params.set('task_id', taskId);
    params.set('t', String(Date.now()));
    if (rawPublicKey) params.set('public_key', rawPublicKey);
    return `${protocol}://${window.location.host}/v1/public/imagine/sse?${params.toString()}`;
  }

  function buildVideoSseUrl(taskId, rawPublicKey) {
    const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
    const params = new URLSearchParams();
    params.set('task_id', taskId);
    params.set('t', String(Date.now()));
    if (rawPublicKey) params.set('public_key', rawPublicKey);
    return `${protocol}://${window.location.host}/v1/public/video/sse?${params.toString()}`;
  }

  function buildImaginePublicUrl(parentPostId) {
    return `https://imagine-public.x.ai/imagine-public/images/${parentPostId}.jpg`;
  }

  function normalizeHttpSourceUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.startsWith('data:')) return '';
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      return raw;
    }
    if (raw.startsWith('/')) {
      return `${window.location.origin}${raw}`;
    }
    return '';
  }

  function pickSourceImageUrl(candidates, parentPostId) {
    const list = Array.isArray(candidates) ? candidates : [candidates];
    for (const candidate of list) {
      const normalized = normalizeHttpSourceUrl(candidate);
      if (normalized) return normalized;
    }
    return parentPostId ? buildImaginePublicUrl(parentPostId) : '';
  }

  function extractParentPostIdFromText(text) {
    const raw = String(text || '').trim();
    if (!raw) return '';
    if (/^[0-9a-fA-F-]{32,36}$/.test(raw)) return raw;
    const generated = raw.match(/\/generated\/([0-9a-fA-F-]{32,36})(?:\/|$)/);
    if (generated) return generated[1];
    const imaginePublic = raw.match(/\/imagine-public\/images\/([0-9a-fA-F-]{32,36})(?:\.jpg|\/|$)/);
    if (imaginePublic) return imaginePublic[1];
    const imagePath = raw.match(/\/images\/([0-9a-fA-F-]{32,36})(?:\.jpg|\/|$)/);
    if (imagePath) return imagePath[1];
    const all = raw.match(/([0-9a-fA-F-]{32,36})/g);
    return all && all.length ? all[all.length - 1] : '';
  }

  function extractParentPostId(payload) {
    if (!payload || typeof payload !== 'object') {
      return extractParentPostIdFromText(payload);
    }
    const direct = [
      payload.image_id,
      payload.imageId,
      payload.assetId,
      payload.id,
      payload.job_id,
      payload.parentPostId,
      payload.parent_post_id,
      payload.current_parent_post_id,
      payload.generated_parent_post_id,
    ];
    for (const value of direct) {
      const raw = String(value || '').trim();
      if (raw && /^[0-9a-fA-F-]{32,36}$/.test(raw)) {
        return raw;
      }
    }
    return (
      extractParentPostIdFromText(payload.url)
      || extractParentPostIdFromText(payload.thumbnailImageUrl)
      || extractParentPostIdFromText(payload.image)
      || ''
    );
  }

  async function createImagineTask(authHeader, prompt, ratio, nsfwEnabled, proEnabled) {
    const res = await fetch('/v1/public/imagine/start', {
      method: 'POST',
      headers: {
        ...buildAuthHeaders(authHeader),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt,
        aspect_ratio: ratio,
        nsfw: nsfwEnabled,
        pro: proEnabled,
      }),
    });
    if (!res.ok) {
      throw new Error(await parseApiErrorText(res, 'imagine_start_failed'));
    }
    return await res.json();
  }

  async function stopImagineTask(authHeader, taskId) {
    if (!taskId) return;
    try {
      await fetch('/v1/public/imagine/stop', {
        method: 'POST',
        headers: {
          ...buildAuthHeaders(authHeader),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ task_ids: [taskId] }),
      });
    } catch (e) {
      // ignore
    }
  }

  async function requestImagineEditStream(authHeader, prompt, parentPostId, sourceImageUrl, onProgress, signal) {
    const res = await fetch('/v1/public/imagine/edit', {
      method: 'POST',
      headers: {
        ...buildAuthHeaders(authHeader),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        parent_post_id: parentPostId,
        source_image_url: sourceImageUrl,
        stream: true,
      }),
      signal,
    });

    if (!res.ok) {
      throw new Error(await parseApiErrorText(res, 'edit_failed'));
    }

    const contentType = String(res.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('text/event-stream')) {
      return await res.json();
    }

    const reader = res.body && res.body.getReader ? res.body.getReader() : null;
    if (!reader) {
      throw new Error('stream_not_supported');
    }

    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let finalResult = null;
    let finalError = '';

    function handleChunk(chunkText) {
      let eventName = 'message';
      const dataLines = [];
      const lines = String(chunkText || '').split('\n');
      for (const lineRaw of lines) {
        const line = lineRaw.trim();
        if (!line) continue;
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
          continue;
        }
        if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trim());
        }
      }
      if (!dataLines.length) return;
      let payload = null;
      try {
        payload = JSON.parse(dataLines.join('\n'));
      } catch (e) {
        return;
      }
      if (eventName === 'progress') {
        if (typeof onProgress === 'function') {
          onProgress(payload || {});
        }
      } else if (eventName === 'result') {
        finalResult = payload || {};
      } else if (eventName === 'error') {
        finalError = String((payload && payload.message) || 'edit_failed');
      }
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      while (true) {
        const idx = buffer.indexOf('\n\n');
        if (idx < 0) break;
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        handleChunk(block);
      }
    }

    if (buffer.trim()) {
      handleChunk(buffer);
      buffer = '';
    }
    if (finalError) {
      throw new Error(finalError);
    }
    if (finalResult) {
      return finalResult;
    }
    throw new Error('edit_stream_empty_result');
  }

  async function copyText(text) {
    const value = String(text || '').trim();
    if (!value) return false;
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', 'readonly');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  }

  function getSelectedCandidate() {
    return state.candidates.find((item) => item.id === state.selectedCandidateId) || null;
  }

  function getCandidateById(id) {
    return state.candidates.find((item) => item.id === id) || null;
  }

  function getCurrentLightboxCandidate() {
    if (state.lightboxIndex < 0 || state.lightboxIndex >= state.candidates.length) {
      return null;
    }
    return state.candidates[state.lightboxIndex];
  }

  function formatLightboxHistoryTime(ts) {
    try {
      return new Date(ts).toLocaleString('zh-CN', { hour12: false });
    } catch (e) {
      return '-';
    }
  }

  function shortLightboxParentId(value) {
    const raw = String(value || '').trim();
    if (!raw) return '-';
    if (raw.length <= 14) return raw;
    return `${raw.slice(0, 7)}...${raw.slice(-7)}`;
  }

  function ensureCandidateHistory(candidate) {
    if (!candidate) return [];
    if (!Array.isArray(candidate.history)) {
      candidate.history = [];
    }
    if (!candidate.history.length) {
      candidate.history.push({
        id: `init_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
        round: 0,
        mode: 'initial',
        prompt: String(candidate.prompt || '').trim(),
        imageUrl: String(candidate.imageUrl || '').trim(),
        parentPostId: String(candidate.parentPostId || '').trim(),
        sourceImageUrl: String(candidate.sourceImageUrl || '').trim(),
        elapsedMs: 0,
        createdAt: Date.now(),
      });
    }
    return candidate.history;
  }

  function clearEditProgressTimer() {
    if (state.editProgressTimer) {
      clearInterval(state.editProgressTimer);
      state.editProgressTimer = null;
    }
    if (state.editProgressHideTimer) {
      clearTimeout(state.editProgressHideTimer);
      state.editProgressHideTimer = null;
    }
  }

  function setEditProgress(value, text) {
    const safe = Math.max(0, Math.min(100, Math.round(value || 0)));
    state.editProgressValue = safe;
    if (lightboxEditProgressBar) {
      lightboxEditProgressBar.style.width = `${safe}%`;
    }
    if (lightboxEditProgressText) {
      lightboxEditProgressText.textContent = text || `编辑中 ${safe}%`;
    }
  }

  function updateEditDurationEstimate(elapsedMs) {
    const ms = Number(elapsedMs || 0);
    if (!Number.isFinite(ms) || ms <= 0) return;
    const clamped = Math.max(8000, Math.min(45000, ms));
    state.editDurationEstimateMs = Math.round(state.editDurationEstimateMs * 0.7 + clamped * 0.3);
  }

  function calcEditProgress(elapsedMs) {
    const estimate = Math.max(8000, state.editDurationEstimateMs);
    const ratio = elapsedMs / estimate;
    if (ratio <= 1) {
      const eased = 1 - Math.pow(1 - ratio, 3);
      return 4 + eased * 86;
    }
    return 90 + 8 * (1 - Math.exp(-(ratio - 1) * 1.2));
  }

  function showEditProgress() {
    if (lightboxEditProgressWrap) {
      lightboxEditProgressWrap.classList.add('active');
      lightboxEditProgressWrap.classList.remove('is-success', 'is-error');
    }
    if (lightboxEditProgressText) {
      lightboxEditProgressText.classList.add('active');
    }
    setEditProgress(4, '编辑中 4%');
  }

  function hideEditProgress() {
    clearEditProgressTimer();
    if (lightboxEditProgressWrap) {
      lightboxEditProgressWrap.classList.remove('active', 'is-success', 'is-error');
    }
    if (lightboxEditProgressText) {
      lightboxEditProgressText.classList.remove('active');
      lightboxEditProgressText.textContent = '编辑中 0%';
    }
    if (lightboxEditProgressBar) {
      lightboxEditProgressBar.style.width = '0%';
    }
    state.editProgressValue = 0;
  }

  function startEditProgress() {
    clearEditProgressTimer();
    showEditProgress();
    state.editProgressStartedAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    state.editProgressTimer = setInterval(() => {
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const elapsed = Math.max(0, now - state.editProgressStartedAt);
      const next = Math.min(98, calcEditProgress(elapsed));
      const smooth = Math.max(state.editProgressValue + 0.2, next);
      const seconds = (elapsed / 1000).toFixed(1);
      setEditProgress(smooth, `编辑中 ${Math.round(smooth)}% · ${seconds}s`);
    }, 120);
  }

  function finishEditProgress(success, text) {
    clearEditProgressTimer();
    if (!lightboxEditProgressWrap) return;
    lightboxEditProgressWrap.classList.add('active');
    lightboxEditProgressWrap.classList.remove('is-success', 'is-error');
    lightboxEditProgressWrap.classList.add(success ? 'is-success' : 'is-error');
    if (lightboxEditProgressText) {
      lightboxEditProgressText.classList.add('active');
    }
    setEditProgress(100, text || (success ? '编辑完成 100%' : '编辑失败'));
    state.editProgressHideTimer = setTimeout(() => {
      hideEditProgress();
      state.editProgressHideTimer = null;
    }, 900);
  }

  function setLightboxEditButtonState(running) {
    if (!lightboxEditSend) return;
    lightboxEditSend.dataset.running = running ? '1' : '0';
    if (running) {
      lightboxEditSend.textContent = '中止';
      lightboxEditSend.disabled = false;
      return;
    }
    lightboxEditSend.textContent = '发送编辑';
    const current = getCurrentLightboxCandidate();
    const currentParent = current ? String(current.parentPostId || '').trim() : '';
    lightboxEditSend.disabled = !currentParent;
  }

  function cancelLightboxEdit() {
    if (lightboxEditAbortController) {
      lightboxEditAbortController.abort();
    }
  }

  function renderLightboxHistory(candidate) {
    if (!lightboxHistoryCount || !lightboxHistoryEmpty || !lightboxHistoryList) return;
    lightboxHistoryList.innerHTML = '';
    if (!candidate) {
      lightboxHistoryCount.textContent = '0 条';
      lightboxHistoryEmpty.classList.remove('hidden');
      return;
    }
    const history = ensureCandidateHistory(candidate);
    lightboxHistoryCount.textContent = `${history.length} 条`;
    if (!history.length) {
      lightboxHistoryEmpty.classList.remove('hidden');
      return;
    }
    lightboxHistoryEmpty.classList.add('hidden');

    history.forEach((entry) => {
      const row = document.createElement('div');
      row.className = 'lightbox-history-item';

      const thumb = document.createElement('img');
      thumb.className = 'lightbox-history-thumb';
      thumb.src = String(entry.imageUrl || '').trim();
      thumb.alt = `history-${entry.round}`;
      thumb.loading = 'lazy';
      thumb.decoding = 'async';

      const main = document.createElement('div');
      main.className = 'lightbox-history-main';

      const line1 = document.createElement('div');
      line1.className = 'lightbox-history-line';
      line1.innerHTML = `<strong>#${entry.round}</strong> · ${formatLightboxHistoryTime(entry.createdAt)} · ${Number(entry.elapsedMs || 0)}ms`;

      const line2 = document.createElement('div');
      line2.className = 'lightbox-history-line';
      line2.innerHTML = `mode=<strong>${entry.mode || 'edit'}</strong> · parentPostId=<strong>${shortLightboxParentId(entry.parentPostId)}</strong>`;

      const prompt = document.createElement('div');
      prompt.className = 'lightbox-history-prompt';
      prompt.textContent = String(entry.prompt || '').trim() || '-';

      const actions = document.createElement('div');
      actions.className = 'lightbox-history-actions';

      const applyBtn = document.createElement('button');
      applyBtn.type = 'button';
      applyBtn.className = 'lightbox-history-btn';
      applyBtn.textContent = '设为当前';
      applyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const parentPostId = String(entry.parentPostId || '').trim();
        candidate.imageUrl = String(entry.imageUrl || candidate.imageUrl || '').trim();
        candidate.prompt = String(entry.prompt || '').trim();
        candidate.parentPostId = parentPostId;
        candidate.sourceImageUrl = pickSourceImageUrl(
          [entry.sourceImageUrl, entry.imageUrl, candidate.sourceImageUrl],
          parentPostId
        );
        if (parentPostId) {
          rememberParentPost({
            parentPostId,
            sourceImageUrl: candidate.sourceImageUrl,
            imageUrl: candidate.imageUrl,
            origin: 'nsfw_lightbox_history_apply',
          });
        }
        renderCandidates();
        updateLightbox(state.lightboxIndex);
      });

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'lightbox-history-btn';
      copyBtn.textContent = '复制ID';
      copyBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const parentPostId = String(entry.parentPostId || '').trim();
        if (!parentPostId) {
          toast('当前记录没有 parentPostId', 'warning');
          return;
        }
        try {
          const copied = await copyText(parentPostId);
          if (!copied) throw new Error('copy_failed');
          toast('已复制 parentPostId', 'success');
        } catch (err) {
          toast('复制失败', 'error');
        }
      });

      actions.appendChild(applyBtn);
      actions.appendChild(copyBtn);
      main.appendChild(line1);
      main.appendChild(line2);
      main.appendChild(prompt);
      main.appendChild(actions);
      row.appendChild(thumb);
      row.appendChild(main);
      lightboxHistoryList.appendChild(row);
    });
  }

  function updateSelectedMeta() {
    const selected = getSelectedCandidate();
    if (!selected) {
      if (selectedMeta) selectedMeta.textContent = '未选择候选图';
      updateVideoButtons();
      return;
    }
    const prompt = (selected.prompt || '').slice(0, 34) || '-';
    if (selectedMeta) {
      selectedMeta.textContent = `已选中 #${selected.index} | parentPostId=${shortId(selected.parentPostId)} | ${prompt}`;
    }
    updateVideoButtons();
  }

  function updateLightbox(index) {
    if (!lightbox || !lightboxImg) return;
    if (index < 0 || index >= state.candidates.length) return;
    state.lightboxIndex = index;
    setLightboxImageFullscreen(false);
    const candidate = state.candidates[index];
    if (!candidate) return;
    lightboxImg.src = String(candidate.imageUrl || '').trim();
    renderLightboxHistory(candidate);
    if (lightboxPrev) lightboxPrev.disabled = (index === 0);
    if (lightboxNext) lightboxNext.disabled = (index === state.candidates.length - 1);
    if (lightboxEditSend) {
      const parentPostId = String(candidate.parentPostId || '').trim();
      if (String(lightboxEditSend.dataset.running || '0') !== '1') {
        setLightboxEditButtonState(false);
      }
      lightboxEditSend.title = parentPostId ? '使用 parentPostId 发起编辑' : '当前图片缺少 parentPostId，无法编辑';
      if (lightboxEditInput && !lightboxEditInput.value.trim()) {
        const seedPrompt = String(candidate.prompt || '').trim();
        if (seedPrompt) {
          lightboxEditInput.value = `基于此图编辑：${seedPrompt}`;
        }
      }
    }
  }

  async function openLightboxByCandidateId(id) {
    const index = state.candidates.findIndex((item) => item.id === id);
    if (index < 0 || !lightbox) return;
    if (state.imageRunning) {
      await stopImageBatch(true);
      setChip(imageStatusText, '候选图：已暂停（编辑模式）', '');
    }
    updateLightbox(index);
    lightbox.classList.add('active');
    updateLightboxKeyboardShift();
  }

  function closeLightboxView() {
    if (!lightbox) return;
    cancelLightboxEdit();
    setLightboxImageFullscreen(false);
    lightbox.classList.remove('active');
    setLightboxKeyboardShift(0);
    state.lightboxIndex = -1;
    if (lightboxEditSend) {
      lightboxEditSend.dataset.running = '0';
      lightboxEditSend.textContent = '发送编辑';
      lightboxEditSend.disabled = true;
    }
    if (lightboxEditInput) {
      lightboxEditInput.value = '';
      lightboxEditInput.disabled = false;
    }
    hideEditProgress();
    renderLightboxHistory(null);
  }

  function showPrevLightboxImage() {
    if (state.lightboxIndex > 0) {
      updateLightbox(state.lightboxIndex - 1);
    }
  }

  function showNextLightboxImage() {
    if (state.lightboxIndex >= 0 && state.lightboxIndex < state.candidates.length - 1) {
      updateLightbox(state.lightboxIndex + 1);
    }
  }

  async function startEditFromLightbox() {
    const candidate = getCurrentLightboxCandidate();
    if (!candidate) {
      toast('未找到当前候选图', 'error');
      return;
    }
    const parentPostId = String(candidate.parentPostId || '').trim();
    if (!parentPostId) {
      toast('当前图片缺少 parentPostId，无法编辑', 'warning');
      return;
    }
    const finalPrompt = String(lightboxEditInput ? lightboxEditInput.value : '').trim();
    if (!finalPrompt) {
      toast('编辑提示词不能为空', 'warning');
      if (lightboxEditInput) lightboxEditInput.focus();
      return;
    }

    const authHeader = await ensurePublicKey();
    if (authHeader === null) {
      toast('请先配置 Public Key', 'error');
      window.location.href = '/login';
      return;
    }

    const sourceImageUrl = pickSourceImageUrl(
      [candidate.sourceImageUrl, candidate.imageUrl],
      parentPostId
    );
    lightboxEditAbortController = new AbortController();
    setLightboxEditButtonState(true);
    if (lightboxEditInput) {
      lightboxEditInput.disabled = true;
    }
    showEditProgress();
    setEditProgress(4, '已接收编辑请求');

    try {
      const data = await requestImagineEditStream(
        authHeader,
        finalPrompt,
        parentPostId,
        sourceImageUrl,
        (evt) => {
          const next = Number(evt && evt.progress ? evt.progress : 0);
          const text = String((evt && evt.message) || '').trim();
          if (Number.isFinite(next) && next > 0) {
            const safe = Math.max(state.editProgressValue, Math.min(99, next));
            setEditProgress(safe, text || `编辑中 ${safe}%`);
          } else if (text) {
            setEditProgress(state.editProgressValue, text);
          }
        },
        lightboxEditAbortController ? lightboxEditAbortController.signal : undefined
      );
      const list = (data && Array.isArray(data.data)) ? data.data : [];
      const first = list.length ? list[0] : null;
      const output = first ? (first.url || first.b64_json || first.image || '') : '';
      if (!output) {
        throw new Error('编辑结果为空');
      }
      const generatedParent = (
        extractParentPostId(data && data.current_parent_post_id)
        || extractParentPostId(data && data.generated_parent_post_id)
        || extractParentPostIdFromText(output)
        || parentPostId
      );
      const nextSourceImageUrl = pickSourceImageUrl(
        [
          data && data.current_source_image_url,
          data && data.source_image_url,
          output,
          candidate.sourceImageUrl,
        ],
        generatedParent
      );
      const displayUrl = toDataUrl(output);
      if (!displayUrl) {
        throw new Error('编辑结果格式无效');
      }

      candidate.imageUrl = displayUrl;
      candidate.prompt = finalPrompt;
      candidate.parentPostId = generatedParent;
      candidate.sourceImageUrl = nextSourceImageUrl;

      ensureCandidateHistory(candidate);
      const maxRound = candidate.history.reduce((max, it) => Math.max(max, Number(it && it.round ? it.round : 0)), 0);
      const elapsed = Number(data && data.elapsed_ms ? data.elapsed_ms : 0);
      candidate.history.unshift({
        id: `edit_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
        round: maxRound + 1,
        mode: 'edit',
        prompt: finalPrompt,
        imageUrl: displayUrl,
        parentPostId: generatedParent,
        sourceImageUrl: nextSourceImageUrl,
        elapsedMs: Number.isFinite(elapsed) ? Math.max(0, Math.round(elapsed)) : 0,
        createdAt: Date.now(),
      });

      rememberParentPost({
        parentPostId: generatedParent,
        sourceImageUrl: nextSourceImageUrl,
        imageUrl: displayUrl,
        origin: 'nsfw_edit',
      });

      updateEditDurationEstimate(elapsed);
      renderCandidates();
      updateLightbox(state.lightboxIndex);
      finishEditProgress(true, '编辑完成 100%');
      toast('编辑完成，已替换当前候选图', 'success');
      if (lightboxEditInput) {
        lightboxEditInput.value = '';
      }
    } catch (e) {
      if (e && e.name === 'AbortError') {
        finishEditProgress(false, '已中止');
        toast('已中止编辑', 'warning');
        return;
      }
      const msg = String(e && e.message ? e.message : e);
      finishEditProgress(false, '编辑失败');
      toast(`编辑失败：${msg}`, 'error');
    } finally {
      lightboxEditAbortController = null;
      setLightboxEditButtonState(false);
      if (lightboxEditInput) {
        lightboxEditInput.disabled = false;
      }
    }
  }

  function selectCandidate(id) {
    state.selectedCandidateId = id || '';
    const cards = candidateWaterfall ? candidateWaterfall.querySelectorAll('.candidate-card') : [];
    cards.forEach((card) => {
      if (!(card instanceof HTMLElement)) return;
      card.classList.toggle('selected', card.dataset.id === state.selectedCandidateId);
    });
    updateSelectedMeta();
  }

  function downloadImage(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function renderCandidates() {
    if (!candidateWaterfall) return;
    candidateWaterfall.innerHTML = '';

    if (!state.candidates.length) {
      if (candidateEmpty) candidateEmpty.classList.remove('hidden');
      updateCounters();
      updateSelectedMeta();
      return;
    }
    if (candidateEmpty) candidateEmpty.classList.add('hidden');

    for (const item of state.candidates) {
      ensureCandidateHistory(item);
      const card = document.createElement('div');
      card.className = 'candidate-card';
      card.dataset.id = item.id;
      if (item.id === state.selectedCandidateId) {
        card.classList.add('selected');
      }

      const wrap = document.createElement('div');
      wrap.className = 'candidate-image-wrap';

      const img = document.createElement('img');
      img.className = 'candidate-image';
      img.src = item.imageUrl;
      img.alt = `candidate-${item.index}`;
      img.loading = 'lazy';
      img.decoding = 'async';

      const badge = document.createElement('div');
      badge.className = 'selected-badge';
      badge.textContent = '已选中';

      wrap.appendChild(img);
      wrap.appendChild(badge);

      const meta = document.createElement('div');
      meta.className = 'candidate-meta';
      meta.innerHTML = `<span>#${item.index}</span><span>${shortId(item.parentPostId)}</span>`;

      const actions = document.createElement('div');
      actions.className = 'candidate-actions';

      const selectBtn = document.createElement('button');
      selectBtn.type = 'button';
      selectBtn.className = 'geist-button-outline text-xs px-3 candidate-select-btn';
      selectBtn.dataset.id = item.id;
      selectBtn.textContent = '选择';

      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'geist-button-outline text-xs px-3 candidate-save-btn';
      saveBtn.dataset.id = item.id;
      saveBtn.textContent = '保存';

      actions.appendChild(selectBtn);
      actions.appendChild(saveBtn);

      card.appendChild(wrap);
      card.appendChild(meta);
      card.appendChild(actions);
      candidateWaterfall.appendChild(card);
    }

    updateCounters();
    updateSelectedMeta();
  }

  function addCandidate(payload) {
    const raw = payload.b64_json || payload.url || payload.image || '';
    if (!raw) return;

    const parentPostId = extractParentPostId(payload);

    const id = parentPostId || `local-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    if (state.candidates.some((item) => item.id === id)) return;

    const imageUrl = toDataUrl(raw);
    if (!imageUrl) return;

    const sourceImageUrl = pickSourceImageUrl(
      [
        payload.current_source_image_url,
        payload.source_image_url,
        payload.url,
        payload.thumbnailImageUrl,
      ],
      parentPostId
    );

    const candidate = {
      id,
      index: state.candidates.length + 1,
      imageUrl,
      parentPostId,
      sourceImageUrl,
      prompt: String(payload.prompt || imagePromptInput?.value || '').trim(),
      history: [],
    };
    ensureCandidateHistory(candidate);
    state.candidates.push(candidate);

    if (parentPostId) {
      rememberParentPost({
        parentPostId,
        sourceImageUrl,
        imageUrl,
        origin: 'nsfw_candidate',
      });
    }

    if (!state.selectedCandidateId && parentPostId) {
      state.selectedCandidateId = id;
    }
    renderCandidates();
  }

  function extractCandidatePayload(payload) {
    if (!payload || typeof payload !== 'object') return null;
    if (payload.type === 'image_generation.completed') return payload;
    if (payload.type === 'image') return payload;
    return null;
  }

  function closeImageSource() {
    if (state.imageSource) {
      try {
        state.imageSource.close();
      } catch (e) {
        // ignore
      }
      state.imageSource = null;
    }
  }

  async function stopImageBatch(silent) {
    if (!state.imageRunning) return;
    closeImageSource();
    await stopImagineTask(state.imageAuthHeader, state.imageTaskId);
    state.imageTaskId = '';
    state.imageRunning = false;
    setChip(imageStatusText, '候选图：已停止', '');
    updateImageButtons();
    if (!silent) {
      toast('候选图任务已停止', 'warning');
    }
  }

  async function startImageBatch() {
    const prompt = String(imagePromptInput?.value || '').trim();
    if (!prompt) {
      toast('请先填写图片提示词', 'error');
      return;
    }
    if (state.imageRunning) {
      toast('候选图任务正在运行', 'warning');
      return;
    }

    const authHeader = await ensurePublicKey();
    if (authHeader === null) {
      toast('请先配置 Public Key', 'error');
      window.location.href = '/login';
      return;
    }

    state.imageAuthHeader = authHeader;
    state.imageRawPublicKey = normalizeAuthHeader(authHeader);

    const ratio = ratioSelect ? ratioSelect.value : '16:9';
    const nsfwEnabled = nsfwSelect ? nsfwSelect.value === 'true' : true;
    const proEnabled = state.imageProMode;
    const startCount = state.candidates.length;
    state.imageTargetTotal = startCount + 6;

    let data = null;
    try {
      data = await createImagineTask(authHeader, prompt, ratio, nsfwEnabled, proEnabled);
    } catch (e) {
      setChip(imageStatusText, '候选图：创建失败', 'error');
      toast('候选图任务创建失败', 'error');
      return;
    }

    const taskId = String(data && data.task_id ? data.task_id : '');
    if (!taskId) {
      setChip(imageStatusText, '候选图：创建失败', 'error');
      toast('候选图 task_id 缺失', 'error');
      return;
    }

    state.imageTaskId = taskId;
    state.imageRunning = true;
    setChip(imageStatusText, '候选图：生成中', 'running');
    updateImageButtons();

    const sseUrl = buildImagineSseUrl(taskId, state.imageRawPublicKey);
    const es = new EventSource(sseUrl);
    state.imageSource = es;

    es.onmessage = async (event) => {
      if (!event || !event.data) return;
      if (event.data === '[DONE]') return;

      let payload = null;
      try {
        payload = JSON.parse(event.data);
      } catch (e) {
        return;
      }

      if (!state.imageRunning) return;
      if (state.candidates.length >= state.imageTargetTotal) return;

      if (payload && (payload.error || payload.type === 'error')) {
        const msg = payload.message || payload.error || '候选图生成失败';
        setChip(imageStatusText, `候选图：${msg}`, 'error');
        toast(msg, 'error');
        return;
      }

      const normalized = extractCandidatePayload(payload);
      if (!normalized) return;
      addCandidate(normalized);

      if (state.candidates.length >= state.imageTargetTotal) {
        await stopImageBatch(true);
        setChip(imageStatusText, '候选图：本批完成', 'done');
        toast('已生成 6 张候选图', 'success');
      }
    };

    es.onerror = async () => {
      if (!state.imageRunning) return;
      await stopImageBatch(true);
      if (state.candidates.length < state.imageTargetTotal) {
        setChip(imageStatusText, '候选图：连接异常', 'error');
      }
    };
  }

  async function clearImages() {
    await stopImageBatch(true);
    state.candidates = [];
    state.selectedCandidateId = '';
    state.imageTargetTotal = 0;
    closeLightboxView();
    renderCandidates();
    setChip(imageStatusText, '候选图：已清空', '');
  }

  async function createVideoTask(authHeader, payload) {
    const res = await fetch('/v1/public/video/start', {
      method: 'POST',
      headers: {
        ...buildAuthHeaders(authHeader),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(await parseApiErrorText(res, 'video_start_failed'));
    }
    return await res.json();
  }

  async function stopVideoTasks(authHeader, taskIds) {
    if (!taskIds || !taskIds.length) return;
    try {
      await fetch('/v1/public/video/stop', {
        method: 'POST',
        headers: {
          ...buildAuthHeaders(authHeader),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ task_ids: taskIds }),
      });
    } catch (e) {
      // ignore
    }
  }

  function setVideoItemStatus(item, text, cls) {
    if (!item) return;
    const el = item.querySelector('.video-item-status');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('running', 'done', 'error');
    if (cls) el.classList.add(cls);
  }

  function createVideoCard(index, taskId) {
    const item = document.createElement('div');
    item.className = 'video-item';
    item.dataset.taskId = taskId;
    item.dataset.defaultTitle = `任务 ${index}`;
    item.dataset.order = String(++state.videoOrderSeed);
    item.innerHTML = `
      <div class="video-item-head">
        <div class="video-item-title">任务 ${index}</div>
        <div class="video-item-status running">排队中</div>
      </div>
      <div class="video-body">等待上游返回视频流...</div>
        <div class="video-actions">
          <a class="geist-button-outline text-xs px-3 hidden video-open" target="_blank" rel="noopener">打开</a>
          <button class="geist-button-outline text-xs px-3 video-download" type="button" disabled>下载</button>
          <button class="geist-button-outline text-xs px-3 video-rename" type="button" disabled>重命名</button>
        </div>
      `;
    videoResults.appendChild(item);
    syncVideoResultsOrder();
    applyNsfwVideoCardTitle(item, `任务 ${index}`);
    return item;
  }

  function extractVideoInfo(buffer) {
    if (!buffer) return null;
    if (buffer.includes('<video')) {
      const htmlMatches = buffer.match(/<video[\s\S]*?<\/video>/gi);
      if (htmlMatches && htmlMatches.length) {
        return { html: htmlMatches[htmlMatches.length - 1] };
      }
    }
    const mdMatches = buffer.match(/\[video\]\(([^)]+)\)/g);
    if (mdMatches && mdMatches.length) {
      const match = mdMatches[mdMatches.length - 1].match(/\[video\]\(([^)]+)\)/);
      if (match) return { url: match[1] };
    }
    const urlMatches = buffer.match(/https?:\/\/[^\s<)]+/g);
    if (urlMatches && urlMatches.length) {
      return { url: urlMatches[urlMatches.length - 1] };
    }
    return null;
  }

  function bindVideoLinks(item, url) {
    if (!item) return;
    const open = item.querySelector('.video-open');
    const download = item.querySelector('.video-download');
    const rename = item.querySelector('.video-rename');
    item.dataset.videoUrl = url || '';
    if (!item.dataset.postId && url) {
      const resolvedPostId = extractNsfwVideoPostId(url);
      if (resolvedPostId) {
        item.dataset.postId = resolvedPostId;
      }
    }
    if (open) {
      if (url) {
        open.href = url;
        open.classList.remove('hidden');
      } else {
        open.classList.add('hidden');
        open.removeAttribute('href');
      }
    }
    if (download) {
      download.disabled = !url;
      download.dataset.url = url || '';
    }
    if (rename) {
      rename.disabled = !url;
    }
    applyNsfwVideoCardTitle(item);
  }

  function renderVideoHtml(item, html) {
    const body = item.querySelector('.video-body');
    if (!body) return;
    body.innerHTML = html;
    const videoEl = body.querySelector('video');
    let videoUrl = '';
    if (videoEl) {
      videoEl.controls = true;
      videoEl.preload = 'metadata';
      const source = videoEl.querySelector('source');
      if (source && source.getAttribute('src')) {
        videoUrl = source.getAttribute('src');
      } else if (videoEl.getAttribute('src')) {
        videoUrl = videoEl.getAttribute('src');
      }
    }
    bindVideoLinks(item, videoUrl);
    setVideoItemStatus(item, '完成', 'done');
  }

  function renderVideoUrl(item, url) {
    const body = item.querySelector('.video-body');
    if (!body) return;
    const safe = url || '';
    body.innerHTML = `<video controls preload="metadata"><source src="${safe}" type="video/mp4"></video>`;
    bindVideoLinks(item, safe);
    setVideoItemStatus(item, '完成', 'done');
  }

  function completeVideoJob(taskId, options) {
    const job = state.videoJobs.get(taskId);
    if (!job || job.done) return;
    job.done = true;

    if (job.source) {
      try {
        job.source.close();
      } catch (e) {
        // ignore
      }
      job.source = null;
    }

    if (options && options.error) {
      setVideoItemStatus(job.item, options.error, 'error');
    } else if (!job.item.dataset.videoUrl) {
      setVideoItemStatus(job.item, '完成（无链接）', 'error');
    } else {
      setVideoItemStatus(job.item, '完成', 'done');
    }

    const allDone = Array.from(state.videoJobs.values()).every((it) => it.done);
    if (allDone) {
      state.videoRunning = false;
      updateVideoButtons();
      const hasAnySuccess = Array.from(state.videoJobs.values()).some((it) => {
        return Boolean(it.item.dataset.videoUrl);
      });
      if (hasAnySuccess) {
        setChip(videoStatusText, '视频：全部完成', 'done');
      } else {
        setChip(videoStatusText, '视频：全部失败', 'error');
      }
    }
  }

  function handleVideoDelta(taskId, text) {
    if (!text) return;
    const job = state.videoJobs.get(taskId);
    if (!job) return;

    if (text.includes('超分辨率')) {
      setVideoItemStatus(job.item, '超分辨率中', 'running');
      return;
    }

    if (!job.collecting) {
      const mayContainVideo = text.includes('<video') || text.includes('[video](') || text.includes('http://') || text.includes('https://');
      if (mayContainVideo) {
        job.collecting = true;
      }
    }

    if (job.collecting) {
      job.buffer += text;
      const info = extractVideoInfo(job.buffer);
      if (info) {
        if (info.html) {
          renderVideoHtml(job.item, info.html);
        } else if (info.url) {
          renderVideoUrl(job.item, info.url);
        }
      }
      return;
    }

    job.progressBuffer += text;
    const matches = [...job.progressBuffer.matchAll(/进度\s*(\d+)%/g)];
    if (matches.length) {
      const value = parseInt(matches[matches.length - 1][1], 10);
      setVideoItemStatus(job.item, `进度 ${value}%`, 'running');
      job.progressBuffer = job.progressBuffer.slice(-120);
    }
  }

  function openVideoStream(taskId, item) {
    const sseUrl = buildVideoSseUrl(taskId, state.videoRawPublicKey);
    const es = new EventSource(sseUrl);

    const job = state.videoJobs.get(taskId);
    if (job) {
      job.source = es;
    }

    es.onopen = () => {
      setVideoItemStatus(item, '生成中', 'running');
    };

    es.onmessage = (event) => {
      if (!event || !event.data) return;
      if (event.data === '[DONE]') {
        completeVideoJob(taskId, null);
        return;
      }

      let payload = null;
      try {
        payload = JSON.parse(event.data);
      } catch (e) {
        return;
      }

      if (payload && payload.error) {
        completeVideoJob(taskId, { error: '失败' });
        return;
      }

      const choice = payload.choices && payload.choices[0] ? payload.choices[0] : null;
      const delta = choice && choice.delta ? choice.delta : null;

      if (delta && delta.content) {
        handleVideoDelta(taskId, delta.content);
      }
      if (choice && choice.finish_reason === 'stop') {
        completeVideoJob(taskId, null);
      }
    };

    es.onerror = () => {
      const jobState = state.videoJobs.get(taskId);
      if (!jobState || jobState.done) return;
      completeVideoJob(taskId, { error: '连接异常' });
    };
  }

  function isGenericVideoPrompt(prompt) {
    const text = String(prompt || '').trim().toLowerCase();
    if (!text) return true;
    const key = text.replace(/\s+/g, '');
    const generic = new Set([
      'animate', 'animatethis', 'animatethisimage',
      '生成视频', '生成一个视频', '生成一段视频', '让它动起来', '让这张图动起来',
      '做成视频', '制作视频', 'video', 'makevideo', 'createvideo'
    ]);
    return generic.has(text) || generic.has(key);
  }

  async function startVideos() {
    const selected = getSelectedCandidate();
    if (!selected) {
      toast('请先选中一张候选图', 'error');
      return;
    }
    if (!selected.parentPostId) {
      toast('该候选图缺少 parentPostId，无法走 NSFW 全流程', 'error');
      return;
    }
    if (state.videoRunning) {
      toast('视频任务正在运行中', 'warning');
      return;
    }

    const authHeader = await ensurePublicKey();
    if (authHeader === null) {
      toast('请先配置 Public Key', 'error');
      window.location.href = '/login';
      return;
    }

    await clearVideos(true);

    state.videoAuthHeader = authHeader;
    state.videoRawPublicKey = normalizeAuthHeader(authHeader);

    const parallel = Math.max(1, Math.min(4, parseInt(videoParallelSelect?.value || '1', 10)));
    const promptRaw = String(videoPromptInput?.value || '').trim();
    const genericPrompt = isGenericVideoPrompt(promptRaw);
    const prompt = genericPrompt ? '' : promptRaw;
    const preset = genericPrompt ? 'spicy' : 'custom';

    const payload = {
      prompt,
      aspect_ratio: ratioSelect ? ratioSelect.value : '16:9',
      video_length: parseInt(videoLengthSelect?.value || '6', 10),
      resolution_name: resolutionSelect ? resolutionSelect.value : '480p',
      preset,
      parent_post_id: selected.parentPostId,
      source_image_url: pickSourceImageUrl(
        [selected.sourceImageUrl, selected.imageUrl],
        selected.parentPostId
      ),
    };

    const taskIds = [];
    for (let i = 0; i < parallel; i++) {
      try {
        const data = await createVideoTask(authHeader, payload);
        const taskId = String(data && data.task_id ? data.task_id : '');
        if (!taskId) {
          throw new Error('missing_task_id');
        }
        taskIds.push(taskId);
      } catch (e) {
        toast(`第 ${i + 1} 路视频任务创建失败`, 'error');
        break;
      }
    }

    if (!taskIds.length) {
      setChip(videoStatusText, '视频：创建失败', 'error');
      return;
    }

    if (videoEmpty) videoEmpty.classList.add('hidden');

    state.videoRunning = true;
    state.videoTaskIds = taskIds;
    updateCounters();
    updateVideoButtons();
    setChip(videoStatusText, `视频：运行中（${taskIds.length} 路）`, 'running');

    taskIds.forEach((taskId, idx) => {
      const card = createVideoCard(idx + 1, taskId);
      state.videoJobs.set(taskId, {
        taskId,
        item: card,
        source: null,
        buffer: '',
        progressBuffer: '',
        collecting: false,
        done: false,
      });
      openVideoStream(taskId, card);
    });
  }

  async function stopVideos(silent) {
    const runningTaskIds = state.videoTaskIds.slice();
    await stopVideoTasks(state.videoAuthHeader, runningTaskIds);

    state.videoJobs.forEach((job) => {
      if (job.source) {
        try {
          job.source.close();
        } catch (e) {
          // ignore
        }
        job.source = null;
      }
      if (!job.done) {
        job.done = true;
        setVideoItemStatus(job.item, '已中断', 'error');
      }
    });

    state.videoRunning = false;
    state.videoTaskIds = [];
    updateCounters();
    updateVideoButtons();
    setChip(videoStatusText, '视频：已中断', '');
    if (!silent) {
      toast('视频任务已中断', 'warning');
    }
  }

  async function clearVideos(silent) {
    if (state.videoRunning || state.videoTaskIds.length) {
      await stopVideos(true);
    }
    state.videoJobs.clear();
    state.videoTaskIds = [];
    state.videoOrderSeed = 0;
    if (videoResults) {
      videoResults.innerHTML = '';
    }
    if (videoEmpty) {
      videoEmpty.classList.remove('hidden');
    }
    updateCounters();
    updateVideoButtons();
    if (!silent) {
      setChip(videoStatusText, '视频：已清空', '');
    }
  }

  if (candidateWaterfall) {
    candidateWaterfall.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const card = target.closest('.candidate-card');
      if (!card) return;
      const id = String(card.dataset.id || '');
      if (!id) return;

      if (target.classList.contains('candidate-save-btn')) {
        const item = state.candidates.find((it) => it.id === id);
        if (!item) return;
        const name = `nsfw_candidate_${item.index}_${item.parentPostId || item.id}.jpg`;
        downloadImage(item.imageUrl, name);
        return;
      }

      if (target.classList.contains('candidate-select-btn')) {
        selectCandidate(id);
        return;
      }

      if (target.classList.contains('candidate-image')) {
        selectCandidate(id);
        await openLightboxByCandidateId(id);
      }
    });
  }

  if (videoResults) {
    videoResults.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const card = target.closest('.video-item');
      if (!card) return;
        if (target.classList.contains('video-rename')) {
          if (target.disabled) return;
          const currentTitle = String(card.querySelector('.video-item-title')?.textContent || '').trim();
          const nextTitle = await openVideoRenameDialog(currentTitle);
          if (nextTitle === null) return;
          const safeTitle = String(nextTitle || '').trim();
          try {
            await setNsfwStoredVideoTitle(card, safeTitle);
          } catch (error) {
            console.warn('[NSFW 视频重命名] 保存失败', {
              error: String(error && error.message ? error.message : error || ''),
              postId: card.dataset.postId || '',
              videoUrl: card.dataset.videoUrl || '',
              taskId: card.dataset.taskId || '',
              name: card.dataset.name || '',
            });
            toast('视频名称保存失败', 'error');
            return;
          }
          applyNsfwVideoCardTitle(card);
          toast(safeTitle ? '已更新视频名称' : '已恢复默认名称', 'success');
          return;
        }
      if (!target.classList.contains('video-download')) return;

      const url = String(target.dataset.url || '');
      if (!url) return;

      try {
        const resp = await fetch(url, { mode: 'cors' });
        if (!resp.ok) throw new Error('download_failed');
        const blob = await resp.blob();
        const blobUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = blobUrl;
        anchor.download = `nsfw_video_${Date.now()}.mp4`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(blobUrl);
      } catch (e) {
        toast('下载失败，请检查链接可访问性', 'error');
      }
    });
  }

  if (nsfwVideoReverseBtn) {
    nsfwVideoReverseBtn.addEventListener('click', () => {
      state.videoResultsReversed = !state.videoResultsReversed;
      syncVideoResultsOrder();
      updateCounters();
    });
  }

  if (generateBatchBtn) {
    generateBatchBtn.addEventListener('click', () => {
      if (String(generateBatchBtn.dataset.running || '0') === '1') {
        stopImageBatch(false);
        return;
      }
      startImageBatch();
    });
  }

  if (qualityButtons.length > 0) {
    setImageQualityMode(false);
    qualityButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        setImageQualityMode(btn.dataset.pro === 'true');
      });
    });
  }
  if (nextBatchBtn) {
    nextBatchBtn.addEventListener('click', () => {
      startImageBatch();
    });
  }
  if (stopBatchBtn) {
    stopBatchBtn.addEventListener('click', () => {
      stopImageBatch(false);
    });
  }
  if (clearImagesBtn) {
    clearImagesBtn.addEventListener('click', () => {
      clearImages();
    });
  }

  if (startVideoBtn) {
    startVideoBtn.addEventListener('click', () => {
      if (String(startVideoBtn.dataset.running || '0') === '1') {
        stopVideos(false);
        return;
      }
      startVideos();
    });
  }
  if (stopVideoBtn) {
    stopVideoBtn.addEventListener('click', () => {
      stopVideos(false);
    });
  }
  if (clearVideosBtn) {
    clearVideosBtn.addEventListener('click', () => {
      clearVideos(false);
    });
  }

  if (lightbox && closeLightbox) {
    closeLightbox.addEventListener('click', (e) => {
      e.stopPropagation();
      closeLightboxView();
    });
    lightbox.addEventListener('click', () => {
      closeLightboxView();
    });
    if (lightboxImg) {
      lightboxImg.addEventListener('click', (e) => {
        e.stopPropagation();
        setLightboxImageFullscreen(!state.imageFullscreen);
      });
    }
    if (lightboxEditor) {
      lightboxEditor.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }
  }

  if (lightboxPrev) {
    lightboxPrev.addEventListener('click', (e) => {
      e.stopPropagation();
      showPrevLightboxImage();
    });
  }

  if (lightboxNext) {
    lightboxNext.addEventListener('click', (e) => {
      e.stopPropagation();
      showNextLightboxImage();
    });
  }

  if (lightboxEditSend) {
    lightboxEditSend.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (String(lightboxEditSend.dataset.running || '0') === '1') {
        cancelLightboxEdit();
        return;
      }
      await startEditFromLightbox();
    });
  }

  if (lightboxEditInput) {
    lightboxEditInput.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    lightboxEditInput.addEventListener('focus', () => {
      setTimeout(updateLightboxKeyboardShift, 80);
    });
    lightboxEditInput.addEventListener('blur', () => {
      setTimeout(updateLightboxKeyboardShift, 80);
    });
    lightboxEditInput.addEventListener('keydown', async (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        await startEditFromLightbox();
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (!lightbox || !lightbox.classList.contains('active')) return;
    if (e.key === 'Escape') {
      if (state.imageFullscreen) {
        setLightboxImageFullscreen(false);
        return;
      }
      closeLightboxView();
    } else if (e.key === 'ArrowLeft') {
      setLightboxImageFullscreen(false);
      showPrevLightboxImage();
    } else if (e.key === 'ArrowRight') {
      setLightboxImageFullscreen(false);
      showNextLightboxImage();
    }
  });

  window.addEventListener('resize', updateLightboxKeyboardShift);
  window.addEventListener('orientationchange', () => {
    setTimeout(updateLightboxKeyboardShift, 120);
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateLightboxKeyboardShift);
    window.visualViewport.addEventListener('scroll', updateLightboxKeyboardShift);
  }

  window.addEventListener('beforeunload', () => {
    closeImageSource();
    state.videoJobs.forEach((job) => {
      if (job.source) {
        try {
          job.source.close();
        } catch (e) {
          // ignore
        }
      }
    });
    closeLightboxView();
  });

  renderCandidates();
  updateCounters();
  updateImageButtons();
  updateVideoButtons();

  /**
   * NSFW 工作台 双行 Sticky Bar 初始化（移动端专属）
   */
  function initNsfwStickyBar() {
    /* 仅移动端执行，PC 下退出避免干扰 */
    if (!window.matchMedia('(max-width: 900px)').matches) return;

    /* --- 代理映射（只代理两个垃圾桶，imNextBatchBtn 已移除） --- */
    const proxyMap = {
      imClearImagesBtn: 'clearImagesBtn',
      imClearVideosBtn: 'clearVideosBtn',
    };
    Object.entries(proxyMap).forEach(([sId, oId]) => {
      const sEl = document.getElementById(sId);
      const oEl = document.getElementById(oId);
      if (sEl && oEl) sEl.addEventListener('click', () => oEl.click());
    });

    /* --- 候选图主按钮：生成6张 / 再来6张 / 停止候选 --- */
    const imGenBtn = document.getElementById('imGenerateBtn');
    const genPlayIcon = imGenBtn && imGenBtn.querySelector('.nsfw-btn-play');
    const genStopIcon = imGenBtn && imGenBtn.querySelector('.nsfw-btn-stop');
    const genLabel = imGenBtn && imGenBtn.querySelector('.nsfw-btn-label');

    function syncGenBtn() {
      if (!imGenBtn) return;
      const isRunning = generateBatchBtn && generateBatchBtn.dataset.running === '1';
      /* 判断是否已经有候选图：imageCount 不为 "0 张" */
      const hasImages = imageCount && String(imageCount.textContent || '').trim() !== '0 张';
      imGenBtn.classList.toggle('is-stop', isRunning);
      if (genPlayIcon) genPlayIcon.style.display = isRunning ? 'none' : '';
      if (genStopIcon) genStopIcon.style.display = isRunning ? '' : 'none';
      if (genLabel) {
        if (isRunning) {
          genLabel.textContent = '停止候选';
        } else if (hasImages) {
          genLabel.textContent = '再来 6 张';
        } else {
          genLabel.textContent = '生成 6 张';
        }
      }
    }

    if (imGenBtn) {
      imGenBtn.addEventListener('click', () => {
        const isRunning = generateBatchBtn && generateBatchBtn.dataset.running === '1';
        if (isRunning) {
          stopBatchBtn && stopBatchBtn.click();
        } else {
          /* 再来一批 或 生成 6 张，都走 nextBatchBtn（已有图时） / generateBatchBtn（无图时） */
          const hasImages = imageCount && String(imageCount.textContent || '').trim() !== '0 张';
          (hasImages ? nextBatchBtn : generateBatchBtn) && (hasImages ? nextBatchBtn : generateBatchBtn).click();
        }
      });
    }

    if (generateBatchBtn) {
      new MutationObserver(syncGenBtn).observe(generateBatchBtn, { attributes: true, attributeFilter: ['data-running', 'disabled'] });
    }
    /* 同时观察 imageCount 变化以切换按钮文字 */
    if (imageCount) {
      new MutationObserver(syncGenBtn).observe(imageCount, { characterData: true, childList: true, subtree: true });
    }
    syncGenBtn();

    /* --- 视频主按钮：生成视频/中断视频 --- */
    const imVideoBtn = document.getElementById('imStartVideoBtn');
    const vidPlayIcon = imVideoBtn && imVideoBtn.querySelector('.nsfw-btn-play');
    const vidStopIcon = imVideoBtn && imVideoBtn.querySelector('.nsfw-btn-stop');
    const vidLabel = imVideoBtn && imVideoBtn.querySelector('.nsfw-btn-label');

    function syncVideoBtn() {
      if (!imVideoBtn) return;
      const isRunning = startVideoBtn && startVideoBtn.dataset.running === '1';
      const hasSelected = startVideoBtn && !startVideoBtn.disabled;
      imVideoBtn.classList.toggle('is-stop', isRunning);
      imVideoBtn.disabled = !isRunning && !hasSelected;
      if (vidPlayIcon) vidPlayIcon.style.display = isRunning ? 'none' : '';
      if (vidStopIcon) vidStopIcon.style.display = isRunning ? '' : 'none';
      if (vidLabel) vidLabel.textContent = isRunning ? '中断视频' : '生成视频';
    }

    if (imVideoBtn) {
      imVideoBtn.addEventListener('click', () => {
        const isRunning = startVideoBtn && startVideoBtn.dataset.running === '1';
        (isRunning ? stopVideoBtn : startVideoBtn) && (isRunning ? stopVideoBtn : startVideoBtn).click();
      });
    }
    if (startVideoBtn) {
      new MutationObserver(syncVideoBtn).observe(startVideoBtn, { attributes: true, attributeFilter: ['data-running', 'disabled'] });
    }
    syncVideoBtn();

    /* --- 候选图已选状态同步 → 第二行文字高亮（垃圾桶始终可点） --- */
    const videoRow = document.getElementById('nsfwVideoRow');
    const selectedLabel = document.getElementById('nsfwSelectedLabel');

    function syncSelected() {
      if (!selectedMeta || !videoRow || !selectedLabel) return;
      const text = String(selectedMeta.textContent || '').trim();
      const hasSelected = !text.includes('未选择');
      videoRow.classList.toggle('has-selected', hasSelected);
      if (hasSelected) {
        selectedLabel.textContent = text.length > 22 ? text.slice(0, 22) + '…' : text;
      } else {
        selectedLabel.textContent = '未选择候选图';
      }
      syncVideoBtn();
    }

    if (selectedMeta) {
      new MutationObserver(syncSelected).observe(selectedMeta, { characterData: true, childList: true, subtree: true });
      syncSelected();
    }

    /* --- 设置 Bottom Sheet --- */
    const settingsBtn = document.getElementById('nsfwSettingsBtn');
    const settingsOverlay = document.getElementById('nsfwSettingsOverlay');

    let settingsSheet = document.getElementById('nsfwSettingsSheet');
    if (!settingsSheet) {
      settingsSheet = document.createElement('div');
      settingsSheet.id = 'nsfwSettingsSheet';
      settingsSheet.className = 'nsfw-settings-sheet';

      const handle = document.createElement('div');
      handle.className = 'nsfw-settings-sheet-handle';
      settingsSheet.appendChild(handle);

      const titleEl = document.createElement('div');
      titleEl.className = 'nsfw-settings-sheet-title';
      titleEl.textContent = '生成参数';
      settingsSheet.appendChild(titleEl);

      /* 将非 textarea 的参数 field 移入 sheet */
      const formGrid = document.querySelector('.form-grid');
      if (formGrid) {
        const nonWideFields = formGrid.querySelectorAll('.field:not(.field-wide)');
        const sheetGrid = document.createElement('div');
        sheetGrid.className = 'form-grid';
        sheetGrid.style.cssText = 'grid-template-columns: 1fr 1fr; gap: 10px 14px;';
        nonWideFields.forEach(f => sheetGrid.appendChild(f));
        settingsSheet.appendChild(sheetGrid);
      }

      document.body.appendChild(settingsSheet);
    }

    const openSettings = () => {
      if (!settingsSheet || !settingsOverlay) return;
      settingsOverlay.classList.add('active');
      requestAnimationFrame(() => settingsSheet.classList.add('open'));
    };
    const closeSettings = () => {
      if (!settingsSheet || !settingsOverlay) return;
      settingsSheet.classList.remove('open');
      settingsOverlay.classList.remove('active');
    };

    if (settingsBtn) settingsBtn.addEventListener('click', openSettings);
    if (settingsOverlay) settingsOverlay.addEventListener('click', closeSettings);
    const sheetHandle = settingsSheet && settingsSheet.querySelector('.nsfw-settings-sheet-handle');
    if (sheetHandle) sheetHandle.addEventListener('click', closeSettings);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && settingsSheet && settingsSheet.classList.contains('open')) closeSettings();
    });
  }

  initNsfwStickyBar();
})();
