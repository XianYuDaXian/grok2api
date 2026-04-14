(() => {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const clearBtn = document.getElementById('clearBtn');
  const promptInput = document.getElementById('promptInput');
  const ratioSelect = document.getElementById('ratioSelect');
  const concurrentSelect = document.getElementById('concurrentSelect');
  const autoScrollToggle = document.getElementById('autoScrollToggle');
  const autoDownloadToggle = document.getElementById('autoDownloadToggle');
  const reverseInsertToggle = document.getElementById('reverseInsertToggle');
  const autoFilterToggle = document.getElementById('autoFilterToggle');
  const nsfwSelect = document.getElementById('nsfwSelect');
  const qualityButtons = document.querySelectorAll('.quality-btn');
  const selectFolderBtn = document.getElementById('selectFolderBtn');
  const folderPath = document.getElementById('folderPath');
  const statusText = document.getElementById('statusText');
  const countValue = document.getElementById('countValue');
  const activeValue = document.getElementById('activeValue');
  const latencyValue = document.getElementById('latencyValue');
  const modeButtons = document.querySelectorAll('.mode-btn[data-mode]');
  const waterfall = document.getElementById('waterfall');
  const emptyState = document.getElementById('emptyState');
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightboxImg');
  const closeLightbox = document.getElementById('closeLightbox');
  const lightboxEditor = document.querySelector('.lightbox-editor');
  const lightboxEditInput = document.getElementById('lightboxEditInput');
  const lightboxEditSend = document.getElementById('lightboxEditSend');
  const lightboxEditProgressWrap = document.getElementById('lightboxEditProgressWrap');
  const lightboxEditProgressBar = document.getElementById('lightboxEditProgressBar');
  const lightboxEditProgressText = document.getElementById('lightboxEditProgressText');
  const lightboxHistoryCount = document.getElementById('lightboxHistoryCount');
  const lightboxHistoryEmpty = document.getElementById('lightboxHistoryEmpty');
  const lightboxHistoryList = document.getElementById('lightboxHistoryList');

  let wsConnections = [];
  let sseConnections = [];
  let imageCount = 0;
  let totalLatency = 0;
  let latencyCount = 0;
  let lastRunId = '';
  let isRunning = false;
  let stopRequested = false;
  let connectionMode = 'ws';
  let modePreference = 'auto';
  const MODE_STORAGE_KEY = 'imagine_mode';
  const QUALITY_STORAGE_KEY = 'imagine_quality_mode';
  let imagineProMode = false;
  let pendingFallbackTimer = null;
  let currentTaskIds = [];
  let directoryHandle = null;
  let useFileSystemAPI = false;
  let isSelectionMode = false;
  let selectedImages = new Set();
  let streamSequence = 0;
  const streamImageMap = new Map();
  let editProgressTimer = null;
  let editProgressHideTimer = null;
  let editProgressValue = 0;
  let editProgressStartedAt = 0;
  let editDurationEstimateMs = 14000;
  let wsPausedByEdit = false;
  let lightboxImageFullscreen = false;
  let lightboxEditAbortController = null;
  let finalMinBytesDefault = 100000;
  const lightboxHistoryByItem = new WeakMap();
  if (lightboxEditSend) {
    lightboxEditSend.disabled = true;
  }

  function toast(message, type) {
    if (typeof showToast === 'function') {
      showToast(message, type);
    }
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

  function setStatus(state, text) {
    if (!statusText) return;
    statusText.textContent = text;
    statusText.classList.remove('connected', 'connecting', 'error');
    if (state) {
      statusText.classList.add(state);
    }
  }

  function setButtons(connected) {
    if (!startBtn || !stopBtn) return;
    if (connected) {
      startBtn.classList.add('hidden');
      stopBtn.classList.remove('hidden');
    } else {
      startBtn.classList.remove('hidden');
      stopBtn.classList.add('hidden');
      startBtn.disabled = false;
    }
  }

  function updateCount(value) {
    if (countValue) {
      countValue.textContent = String(value);
    }
  }

  function updateActive() {
    if (!activeValue) return;
    if (connectionMode === 'sse') {
      const active = sseConnections.filter(es => es && es.readyState === EventSource.OPEN).length;
      activeValue.textContent = String(active);
      return;
    }
    const active = wsConnections.filter(ws => ws && ws.readyState === WebSocket.OPEN).length;
    activeValue.textContent = String(active);
  }

  function setModePreference(mode, persist = true) {
    if (!['auto', 'ws', 'sse'].includes(mode)) return;
    modePreference = mode;
    modeButtons.forEach(btn => {
      if (btn.dataset.mode === mode) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    if (persist) {
      try {
        localStorage.setItem(MODE_STORAGE_KEY, mode);
      } catch (e) {
        // ignore
      }
    }
    updateModeValue();
  }

  function updateModeValue() { }

  function setQualityMode(enabled, persist = true) {
    imagineProMode = Boolean(enabled);
    qualityButtons.forEach(btn => {
      const isActive = String(btn.dataset.pro) === String(imagineProMode);
      btn.classList.toggle('active', isActive);
    });
    if (persist) {
      try {
        localStorage.setItem(QUALITY_STORAGE_KEY, imagineProMode ? 'quality' : 'quick');
      } catch (e) {
        // ignore
      }
    }
  }

  async function loadFilterDefaults() {
    try {
      const res = await fetch('/v1/public/imagine/config', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const value = parseInt(data && data.final_min_bytes, 10);
      if (Number.isFinite(value) && value >= 0) {
        finalMinBytesDefault = value;
      }
      if (nsfwSelect && typeof data.nsfw === 'boolean') {
        nsfwSelect.value = data.nsfw ? 'true' : 'false';
      }
    } catch (e) {
      // ignore
    }
  }


  function updateLatency(value) {
    if (value) {
      totalLatency += value;
      latencyCount += 1;
      const avg = Math.round(totalLatency / latencyCount);
      if (latencyValue) {
        latencyValue.textContent = `${avg} ms`;
      }
    } else {
      if (latencyValue) {
        latencyValue.textContent = '-';
      }
    }
  }

  function updateError(value) { }

  function setLightboxImageFullscreen(enabled) {
    if (!lightbox) return;
    lightboxImageFullscreen = Boolean(enabled);
    lightbox.classList.toggle('image-focus-mode', lightboxImageFullscreen);
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
    if (document.activeElement !== lightboxEditInput) {
      setLightboxKeyboardShift(0);
      return;
    }
    const vv = window.visualViewport;
    if (!vv) {
      setLightboxKeyboardShift(0);
      return;
    }
    const overlap = Math.max(0, lightbox.clientHeight - vv.height - vv.offsetTop);
    const shift = overlap > 0 ? Math.min(340, overlap + 12) : 0;
    setLightboxKeyboardShift(shift);
  }

  function isLikelyBase64(raw) {
    if (!raw) return false;
    if (raw.startsWith('data:')) return true;
    if (raw.startsWith('http://') || raw.startsWith('https://')) return false;
    const head = raw.slice(0, 16);
    if (head.startsWith('/9j/') || head.startsWith('iVBOR') || head.startsWith('R0lGOD')) return true;
    return /^[A-Za-z0-9+/=\s]+$/.test(raw);
  }

  function inferMime(base64) {
    if (!base64) return 'image/jpeg';
    if (base64.startsWith('iVBOR')) return 'image/png';
    if (base64.startsWith('/9j/')) return 'image/jpeg';
    if (base64.startsWith('R0lGOD')) return 'image/gif';
    return 'image/jpeg';
  }

  function buildImaginePublicUrl(parentPostId) {
    return `https://imagine-public.x.ai/imagine-public/images/${parentPostId}.jpg`;
  }

  function buildPostShareLink(parentPostId) {
    const pid = String(parentPostId || '').trim();
    if (!pid) return '';
    return `https://grok.com/imagine/post/${pid}?source=post-page&platform=web`;
  }

  async function fetchParentPostInfo(authHeader, parentPostId) {
    const pid = String(parentPostId || '').trim();
    if (!pid) return null;
    const res = await fetch(`/v1/public/imagine/parent-post?parent_post_id=${encodeURIComponent(pid)}`, {
      headers: buildAuthHeaders(authHeader),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((data && (data.detail || data.message)) || `查询 parentPostId 失败 (${res.status})`);
    }
    return data;
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
    if (isLikelyBase64(raw)) {
      return '';
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

  function getPreferredCopyValue(entryLike) {
    const explicitShareLink = String(
      (entryLike && (
        entryLike.shareLink
        || entryLike.share_link
        || (entryLike.dataset && entryLike.dataset.shareLink)
      )) || ''
    ).trim();
    if (explicitShareLink) {
      return explicitShareLink;
    }
    const parentPostId = String(
      (entryLike && (
        entryLike.parentPostId
        || entryLike.parent_post_id
        || (entryLike.dataset && entryLike.dataset.parentPostId)
      )) || ''
    ).trim();
    return buildPostShareLink(parentPostId);
  }

  async function resolveSourceImageByParentPostId(authHeader, parentPostId, fallbackUrl) {
    const fallback = pickSourceImageUrl([fallbackUrl], parentPostId);
    try {
      const remote = await fetchParentPostInfo(authHeader, parentPostId);
      if (remote) {
        return pickSourceImageUrl(
          [
            remote.source_image_url,
            remote.media_url,
            remote.thumbnail_image_url,
            fallback,
          ],
          parentPostId
        );
      }
    } catch (e) {
      // ignore
    }
    const api = getParentMemoryApi();
    if (!api) return fallback;
    try {
      const hit = api.getByParentPostId(parentPostId);
      if (hit && hit.sourceImageUrl) {
        return pickSourceImageUrl(
          [hit.sourceImageUrl, hit.source_image_url, hit.imageUrl, hit.image_url, fallback],
          parentPostId
        );
      }
    } catch (e) {
      // ignore
    }
    return fallback;
  }

  function toDisplayImageUrl(raw) {
    const text = String(raw || '').trim();
    if (!text) return '';
    if (text.startsWith('data:')) return text;
    if (text.startsWith('http://') || text.startsWith('https://') || text.startsWith('/')) {
      return text;
    }
    if (isLikelyBase64(text)) {
      return `data:${inferMime(text)};base64,${text}`;
    }
    return text;
  }

  function extractParentPostId(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    const direct = text.match(/^[0-9a-fA-F-]{32,36}$/);
    if (direct) return direct[0];
    const generated = text.match(/\/generated\/([0-9a-fA-F-]{32,36})(?:\/|$)/);
    if (generated) return generated[1];
    const imaginePublic = text.match(/\/imagine-public\/images\/([0-9a-fA-F-]{32,36})(?:\.jpg|\/|$)/);
    if (imaginePublic) return imaginePublic[1];
    const imagePath = text.match(/\/images\/([0-9a-fA-F-]{32,36})(?:\.jpg|\/|$)/);
    if (imagePath) return imagePath[1];
    const all = text.match(/([0-9a-fA-F-]{32,36})/g);
    return all && all.length ? all[all.length - 1] : '';
  }

  function clearEditProgressTimer() {
    if (editProgressTimer) {
      clearInterval(editProgressTimer);
      editProgressTimer = null;
    }
    if (editProgressHideTimer) {
      clearTimeout(editProgressHideTimer);
      editProgressHideTimer = null;
    }
  }

  function setEditProgress(value, text) {
    const safe = Math.max(0, Math.min(100, Math.round(value || 0)));
    editProgressValue = safe;
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
    // 指数平滑，逐步贴近真实耗时
    editDurationEstimateMs = Math.round(editDurationEstimateMs * 0.7 + clamped * 0.3);
  }

  function calcEditProgress(elapsedMs) {
    const estimate = Math.max(8000, editDurationEstimateMs);
    const ratio = elapsedMs / estimate;
    if (ratio <= 1) {
      // 0~90：在预估时间内按平滑曲线推进
      const eased = 1 - Math.pow(1 - ratio, 3);
      return 4 + eased * 86;
    }
    // 超过预估时间后继续慢速推进到 98，避免“卡住”
    const overflow = ratio - 1;
    return 90 + 8 * (1 - Math.exp(-overflow * 1.2));
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
    editProgressValue = 0;
  }

  function startEditProgress() {
    clearEditProgressTimer();
    showEditProgress();
    editProgressStartedAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    editProgressTimer = setInterval(() => {
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const elapsed = Math.max(0, now - editProgressStartedAt);
      const next = Math.min(98, calcEditProgress(elapsed));
      // 保障视觉上持续前进，不倒退不突进
      const smooth = Math.max(editProgressValue + 0.2, next);
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
    editProgressHideTimer = setTimeout(() => {
      hideEditProgress();
      editProgressHideTimer = null;
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
    const currentItem = getItemByImageIndex(currentImageIndex);
    const currentParent = currentItem ? String(currentItem.dataset.parentPostId || '').trim() : '';
    lightboxEditSend.disabled = !currentParent;
  }

  function cancelLightboxEdit() {
    if (lightboxEditAbortController) {
      lightboxEditAbortController.abort();
    }
  }

  function estimateBase64Bytes(raw) {
    if (!raw) return null;
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      return null;
    }
    if (raw.startsWith('/') && !isLikelyBase64(raw)) {
      return null;
    }
    let base64 = raw;
    if (raw.startsWith('data:')) {
      const comma = raw.indexOf(',');
      base64 = comma >= 0 ? raw.slice(comma + 1) : '';
    }
    base64 = base64.replace(/\s/g, '');
    if (!base64) return 0;
    let padding = 0;
    if (base64.endsWith('==')) padding = 2;
    else if (base64.endsWith('=')) padding = 1;
    return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
  }

  function getFinalMinBytes() {
    return Number.isFinite(finalMinBytesDefault) && finalMinBytesDefault >= 0 ? finalMinBytesDefault : 100000;
  }

  function dataUrlToBlob(dataUrl) {
    const parts = (dataUrl || '').split(',');
    if (parts.length < 2) return null;
    const header = parts[0];
    const b64 = parts.slice(1).join(',');
    const match = header.match(/data:(.*?);base64/);
    const mime = match ? match[1] : 'application/octet-stream';
    try {
      const byteString = atob(b64);
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      return new Blob([ab], { type: mime });
    } catch (e) {
      return null;
    }
  }

  async function createImagineTask(prompt, ratio, authHeader, nsfwEnabled, proEnabled) {
    const res = await fetch('/v1/public/imagine/start', {
      method: 'POST',
      headers: {
        ...buildAuthHeaders(authHeader),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt, aspect_ratio: ratio, nsfw: nsfwEnabled, pro: proEnabled })
    });
    if (!res.ok) {
      throw new Error(await parseApiErrorText(res, 'Failed to create task'));
    }
    const data = await res.json();
    return data && data.task_id ? String(data.task_id) : '';
  }

  async function createImagineTasks(prompt, ratio, concurrent, authHeader, nsfwEnabled, proEnabled) {
    const tasks = [];
    for (let i = 0; i < concurrent; i++) {
      const taskId = await createImagineTask(prompt, ratio, authHeader, nsfwEnabled, proEnabled);
      if (!taskId) {
        throw new Error('Missing task id');
      }
      tasks.push(taskId);
    }
    return tasks;
  }

  async function requestImagineEdit(authHeader, prompt, parentPostId, sourceImageUrl) {
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
      }),
    });
    if (!res.ok) {
      throw new Error(await parseApiErrorText(res, 'edit_failed'));
    }
    return await res.json();
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
        if (onProgress && typeof onProgress === 'function') {
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

  async function stopImagineTasks(taskIds, authHeader) {
    if (!taskIds || taskIds.length === 0) return;
    try {
      await fetch('/v1/public/imagine/stop', {
        method: 'POST',
        headers: {
          ...buildAuthHeaders(authHeader),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ task_ids: taskIds })
      });
    } catch (e) {
      // ignore
    }
  }

  async function saveToFileSystem(base64, filename) {
    try {
      if (!directoryHandle) {
        return false;
      }

      const mime = inferMime(base64);
      const ext = mime === 'image/png' ? 'png' : 'jpg';
      const finalFilename = filename.endsWith(`.${ext}`) ? filename : `${filename}.${ext}`;

      const fileHandle = await directoryHandle.getFileHandle(finalFilename, { create: true });
      const writable = await fileHandle.createWritable();

      // Convert base64 to blob
      const byteString = atob(base64);
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([ab], { type: mime });

      await writable.write(blob);
      await writable.close();
      return true;
    } catch (e) {
      console.error('File System API save failed:', e);
      return false;
    }
  }

  function downloadImage(base64, filename) {
    const mime = inferMime(base64);
    const dataUrl = `data:${mime};base64,${base64}`;
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

  function getLightboxHistory(item) {
    if (!item) return [];
    let list = lightboxHistoryByItem.get(item);
    if (!list) {
      list = [];
      lightboxHistoryByItem.set(item, list);
    }
    if (!list.length) {
      const baseImageUrl = String(item.dataset.imageUrl || '').trim();
      const baseParent = String(item.dataset.parentPostId || '').trim();
      const baseSource = String(item.dataset.sourceImageUrl || '').trim();
      const basePrompt = String(item.dataset.prompt || '').trim();
      if (baseImageUrl) {
        list.push({
          id: `init_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
          round: 0,
          mode: 'initial',
          prompt: basePrompt,
          imageUrl: baseImageUrl,
          parentPostId: baseParent,
          sourceImageUrl: baseSource,
          elapsedMs: 0,
          createdAt: Date.now(),
        });
      }
    }
    return list;
  }

  function applyLightboxHistoryEntry(item, entry) {
    if (!item || !entry) return;
    const oldParent = String(item.dataset.parentPostId || '').trim();
    if (oldParent && streamImageMap.get(oldParent) === item) {
      streamImageMap.delete(oldParent);
    }

    const imageUrl = String(entry.imageUrl || '').trim();
    const parentPostId = String(entry.parentPostId || '').trim();
    const sourceImageUrl = String(entry.sourceImageUrl || '').trim();
    const prompt = String(entry.prompt || '').trim();

    const img = item.querySelector('img');
    if (img && imageUrl) {
      img.src = imageUrl;
    }
    if (imageUrl) {
      item.dataset.imageUrl = imageUrl;
    }
    if (prompt) {
      item.dataset.prompt = prompt;
    }
    if (parentPostId) {
      item.dataset.parentPostId = parentPostId;
      item.dataset.sourceImageUrl = pickSourceImageUrl(
        [sourceImageUrl, imageUrl],
        parentPostId
      );
      streamImageMap.set(parentPostId, item);
      rememberParentPost({
        parentPostId,
        sourceImageUrl: item.dataset.sourceImageUrl,
        imageUrl: imageUrl || item.dataset.imageUrl || '',
        origin: 'imagine_edit_history_apply',
      });
    } else {
      item.dataset.parentPostId = '';
      item.dataset.sourceImageUrl = '';
    }

    const elapsed = Number(entry.elapsedMs || 0);
    const metaRight = item.querySelector('.waterfall-meta span');
    if (metaRight && elapsed > 0) {
      metaRight.textContent = `${elapsed}ms`;
    }
  }

  function renderLightboxHistory(item) {
    if (!lightboxHistoryCount || !lightboxHistoryEmpty || !lightboxHistoryList) return;
    lightboxHistoryList.innerHTML = '';
    if (!item) {
      lightboxHistoryCount.textContent = '0 条';
      lightboxHistoryEmpty.classList.remove('hidden');
      return;
    }
    const history = getLightboxHistory(item);
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
        applyLightboxHistoryEntry(item, entry);
        updateLightbox(currentImageIndex);
      });

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'lightbox-history-btn';
      copyBtn.textContent = '复制ID';
      copyBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const copyValue = getPreferredCopyValue(entry);
        if (!copyValue) {
          toast('当前记录没有可复制的分享链接', 'warning');
          return;
        }
        try {
          const copied = await copyText(copyValue);
          if (!copied) throw new Error('copy_failed');
          toast('已复制分享链接', 'success');
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

  function updateCopyIdButton(item) {
    if (!item) return;
    const metaBar = item.querySelector('.waterfall-meta');
    if (!metaBar) return;
    let btn = metaBar.querySelector('.copy-parent-id-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy-parent-id-btn';
      btn.textContent = '复制ID';
      metaBar.appendChild(btn);
    }
    const copyValue = getPreferredCopyValue(item);
    if (copyValue) {
      btn.classList.remove('is-hidden');
      btn.title = `复制分享链接: ${copyValue}`;
    } else {
      btn.classList.add('is-hidden');
      btn.removeAttribute('title');
    }
  }

  async function copyParentPostIdFromItem(item) {
    const copyValue = getPreferredCopyValue(item);
    if (!copyValue) {
      toast('当前图片暂无可复制的分享链接', 'warning');
      return;
    }
    try {
      const copied = await copyText(copyValue);
      if (!copied) {
        throw new Error('复制失败');
      }
      toast('已复制分享链接', 'success');
    } catch (e) {
      toast('复制分享链接失败', 'error');
    }
  }

  function appendImage(base64, meta) {
    if (!waterfall) return;
    if (autoFilterToggle && autoFilterToggle.checked) {
      const bytes = estimateBase64Bytes(base64 || '');
      const minBytes = getFinalMinBytes();
      if (bytes !== null && bytes < minBytes) {
        return;
      }
    }
    if (emptyState) {
      emptyState.style.display = 'none';
    }

    const item = document.createElement('div');
    item.className = 'waterfall-item';

    const checkbox = document.createElement('div');
    checkbox.className = 'image-checkbox';

    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = meta && meta.sequence ? `image-${meta.sequence}` : 'image';
    const mime = inferMime(base64);
    const dataUrl = `data:${mime};base64,${base64}`;
    img.src = dataUrl;

    const metaBar = document.createElement('div');
    metaBar.className = 'waterfall-meta';
    const left = document.createElement('div');
    left.textContent = meta && meta.sequence ? `#${meta.sequence}` : '#';
    const right = document.createElement('span');
    if (meta && meta.elapsed_ms) {
      right.textContent = `${meta.elapsed_ms}ms`;
    } else {
      right.textContent = '';
    }

    metaBar.appendChild(left);
    metaBar.appendChild(right);

    item.appendChild(checkbox);
    item.appendChild(img);
    item.appendChild(metaBar);
    applyImagineModerationBadge(item, meta);

    const prompt = (meta && meta.prompt) ? String(meta.prompt) : (promptInput ? promptInput.value.trim() : '');
    item.dataset.imageUrl = dataUrl;
    item.dataset.prompt = prompt || 'image';
    const parentPostId = String(
      (meta && (meta.image_id || meta.imageId || meta.parent_post_id || meta.parentPostId)) || ''
    ).trim();
    if (parentPostId) {
      item.dataset.parentPostId = parentPostId;
      item.dataset.sourceImageUrl = pickSourceImageUrl(
        [meta && (meta.current_source_image_url || meta.source_image_url || meta.sourceImageUrl || meta.url || meta.image), dataUrl],
        parentPostId
      );
      rememberParentPost({
        parentPostId,
        sourceImageUrl: item.dataset.sourceImageUrl,
        imageUrl: dataUrl,
        origin: 'imagine_ws',
      });
    }
    updateCopyIdButton(item);
    if (isSelectionMode) {
      item.classList.add('selection-mode');
    }

    if (reverseInsertToggle && reverseInsertToggle.checked) {
      waterfall.prepend(item);
    } else {
      waterfall.appendChild(item);
    }

    if (autoScrollToggle && autoScrollToggle.checked) {
      if (reverseInsertToggle && reverseInsertToggle.checked) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      }
    }

    if (autoDownloadToggle && autoDownloadToggle.checked) {
      const timestamp = Date.now();
      const seq = meta && meta.sequence ? meta.sequence : 'unknown';
      const ext = mime === 'image/png' ? 'png' : 'jpg';
      const autoNameParts = ['imagine', String(timestamp)];
      if (parentPostId) autoNameParts.push(parentPostId.slice(0, 16));
      autoNameParts.push(String(seq));
      const filename = `${autoNameParts.join('_')}.${ext}`;

      if (useFileSystemAPI && directoryHandle) {
        saveToFileSystem(base64, filename).catch(() => {
          downloadImage(base64, filename);
        });
      } else {
        downloadImage(base64, filename);
      }
    }
  }

  function isModeratedImagineItem(meta) {
    if (!meta || typeof meta !== 'object') return false;
    if (meta.moderated === true) return true;
    const status = String(meta.current_status || meta.status || '').trim().toLowerCase();
    return ['blocked', 'rejected', 'moderated', 'filtered'].includes(status);
  }

  function moderatedImagineLabel(meta) {
    if (!meta || typeof meta !== 'object') return '审核拒绝';
    const status = String(meta.current_status || meta.status || '').trim().toLowerCase();
    if (status === 'blocked') return '已拦截';
    if (status === 'filtered') return '已过滤';
    return '审核拒绝';
  }

  function applyImagineModerationBadge(item, meta) {
    if (!item) return;
    const moderated = isModeratedImagineItem(meta);
    item.classList.toggle('is-moderated', moderated);
    let badge = item.querySelector('.image-moderation-badge');
    if (!moderated) {
      if (badge) {
        badge.remove();
      }
      return;
    }
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'image-moderation-badge';
      item.appendChild(badge);
    }
    badge.textContent = moderatedImagineLabel(meta);
  }

  function upsertStreamImage(raw, meta, imageId, isFinal) {
    if (!waterfall || !raw) return;
    if (emptyState) {
      emptyState.style.display = 'none';
    }

    if (isFinal && autoFilterToggle && autoFilterToggle.checked) {
      const bytes = estimateBase64Bytes(raw);
      const minBytes = getFinalMinBytes();
      if (bytes !== null && bytes < minBytes) {
        const existing = imageId ? streamImageMap.get(imageId) : null;
        if (existing) {
          if (selectedImages.has(existing)) {
            selectedImages.delete(existing);
            updateSelectedCount();
          }
          existing.remove();
          streamImageMap.delete(imageId);
          if (imageCount > 0) {
            imageCount -= 1;
            updateCount(imageCount);
          }
        }
        return;
      }
    }

    const isDataUrl = typeof raw === 'string' && raw.startsWith('data:');
    const looksLikeBase64 = typeof raw === 'string' && isLikelyBase64(raw);
    const isHttpUrl = typeof raw === 'string' && (raw.startsWith('http://') || raw.startsWith('https://') || (raw.startsWith('/') && !looksLikeBase64));
    const mime = isDataUrl || isHttpUrl ? '' : inferMime(raw);
    const dataUrl = isDataUrl || isHttpUrl ? raw : `data:${mime};base64,${raw}`;

    let item = imageId ? streamImageMap.get(imageId) : null;
    let isNew = false;
    if (!item) {
      isNew = true;
      streamSequence += 1;
      const sequence = streamSequence;

      item = document.createElement('div');
      item.className = 'waterfall-item';

      const checkbox = document.createElement('div');
      checkbox.className = 'image-checkbox';

      const img = document.createElement('img');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.alt = imageId ? `image-${imageId}` : 'image';
      img.src = dataUrl;

      const metaBar = document.createElement('div');
      metaBar.className = 'waterfall-meta';
      const left = document.createElement('div');
      left.textContent = `#${sequence}`;
      const right = document.createElement('span');
      right.textContent = '';
      if (meta && meta.elapsed_ms) {
        right.textContent = `${meta.elapsed_ms}ms`;
      }

      metaBar.appendChild(left);
      metaBar.appendChild(right);

      item.appendChild(checkbox);
      item.appendChild(img);
      item.appendChild(metaBar);
      applyImagineModerationBadge(item, meta);

      const prompt = (meta && meta.prompt) ? String(meta.prompt) : (promptInput ? promptInput.value.trim() : '');
      item.dataset.imageUrl = dataUrl;
      item.dataset.prompt = prompt || 'image';
      if (imageId) {
        item.dataset.parentPostId = imageId;
        item.dataset.sourceImageUrl = pickSourceImageUrl(
          [meta && (meta.current_source_image_url || meta.source_image_url || meta.sourceImageUrl || meta.url || meta.image), dataUrl],
          imageId
        );
        rememberParentPost({
          parentPostId: imageId,
          sourceImageUrl: item.dataset.sourceImageUrl,
          imageUrl: dataUrl,
          origin: 'imagine_ws',
        });
      }
      updateCopyIdButton(item);

      if (isSelectionMode) {
        item.classList.add('selection-mode');
      }

      if (reverseInsertToggle && reverseInsertToggle.checked) {
        waterfall.prepend(item);
      } else {
        waterfall.appendChild(item);
      }

      if (imageId) {
        streamImageMap.set(imageId, item);
      }

      imageCount += 1;
      updateCount(imageCount);
    } else {
      const img = item.querySelector('img');
      if (img) {
        img.src = dataUrl;
      }
      item.dataset.imageUrl = dataUrl;
      if (imageId) {
        item.dataset.parentPostId = imageId;
        item.dataset.sourceImageUrl = pickSourceImageUrl(
          [meta && (meta.current_source_image_url || meta.source_image_url || meta.sourceImageUrl || meta.url || meta.image), dataUrl],
          imageId
        );
        rememberParentPost({
          parentPostId: imageId,
          sourceImageUrl: item.dataset.sourceImageUrl,
          imageUrl: dataUrl,
          origin: 'imagine_ws',
        });
      }
      updateCopyIdButton(item);
      const right = item.querySelector('.waterfall-meta span');
      if (right && meta && meta.elapsed_ms) {
        right.textContent = `${meta.elapsed_ms}ms`;
      }
      applyImagineModerationBadge(item, meta);
    }

    updateError('');

    if (isNew && autoScrollToggle && autoScrollToggle.checked) {
      if (reverseInsertToggle && reverseInsertToggle.checked) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      }
    }

    if (isFinal && autoDownloadToggle && autoDownloadToggle.checked) {
      const timestamp = Date.now();
      const ext = mime === 'image/png' ? 'png' : 'jpg';
      const filename = `imagine_${timestamp}_${imageId || streamSequence}.${ext}`;

      if (useFileSystemAPI && directoryHandle) {
        saveToFileSystem(raw, filename).catch(() => {
          downloadImage(raw, filename);
        });
      } else {
        downloadImage(raw, filename);
      }
    }
  }

  function finalizeStoppedRun(statusLabel = '已停止') {
    currentTaskIds = [];
    isRunning = false;
    stopRequested = false;
    wsPausedByEdit = false;
    updateActive();
    updateModeValue();
    setButtons(false);
    setStatus('', statusLabel);
    if (startBtn) {
      startBtn.disabled = false;
    }
    if (stopBtn) {
      stopBtn.disabled = false;
    }
  }

  function handleMessage(raw, source) {
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return;
    }
    if (!data || typeof data !== 'object') return;

    if (data.type === 'image_generation.partial_image' || data.type === 'image_generation.completed') {
      const imageId = data.image_id || data.imageId;
      const payload = data.b64_json || data.url || data.image;
      if (!payload || !imageId) {
        return;
      }
      const isFinal = data.type === 'image_generation.completed' || data.stage === 'final';
      upsertStreamImage(payload, data, imageId, isFinal);
    } else if (data.type === 'image') {
      imageCount += 1;
      updateCount(imageCount);
      updateLatency(data.elapsed_ms);
      updateError('');
      appendImage(data.b64_json, data);
    } else if (data.type === 'status') {
      if (data.status === 'running') {
        stopRequested = false;
        if (stopBtn) {
          stopBtn.disabled = false;
        }
        setStatus('connected', '生成中');
        lastRunId = data.run_id || '';
      } else if (data.status === 'stopped') {
        if (!stopRequested && data.run_id && lastRunId && data.run_id !== lastRunId) {
          return;
        }
        if (stopRequested && source && typeof source.close === 'function') {
          try {
            source.close(1000, 'graceful stop');
          } catch (e) {
            try {
              source.close();
            } catch (closeError) {
              // ignore
            }
          }
          const remainingWs = wsConnections.filter(w => w && w.readyState === WebSocket.OPEN).length;
          const remainingSse = sseConnections.filter(es => es && es.readyState === EventSource.OPEN).length;
          if (remainingWs === 0 && remainingSse === 0) {
            finalizeStoppedRun('已停止');
          }
          return;
        }
        setStatus('', '已停止');
      }
    } else if (data.type === 'error' || data.error) {
      const message = data.message || (data.error && data.error.message) || '生成失败';
      updateError(message);
      toast(message, 'error');
    }
  }

  function stopAllConnections(options = {}) {
    const { sendStop = true } = options;
    wsConnections.forEach(ws => {
      if (sendStop && ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'stop' }));
        } catch (e) {
          // ignore
        }
      }
      try {
        ws.close(1000, 'client stop');
      } catch (e) {
        // ignore
      }
    });
    wsConnections = [];

    sseConnections.forEach(es => {
      try {
        es.close();
      } catch (e) {
        // ignore
      }
    });
    sseConnections = [];
    wsPausedByEdit = false;
    updateActive();
    updateModeValue();
  }

  function pauseWsForEdit() {
    if (wsPausedByEdit) return;
    if (!isRunning || connectionMode !== 'ws') return;
    const opened = wsConnections.filter(ws => ws && ws.readyState === WebSocket.OPEN);
    if (opened.length === 0) return;
    opened.forEach(ws => {
      try {
        ws.send(JSON.stringify({ type: 'stop' }));
      } catch (e) {
        // ignore
      }
    });
    wsPausedByEdit = true;
    setStatus('', '编辑中（WS已暂停）');
  }

  function resumeWsAfterEdit() {
    if (!wsPausedByEdit) return;
    wsPausedByEdit = false;
    if (!isRunning || connectionMode !== 'ws') return;
    const opened = wsConnections.filter(ws => ws && ws.readyState === WebSocket.OPEN);
    if (opened.length === 0) return;
    opened.forEach(ws => sendStart(null, ws));
    setStatus('connected', '生成中');
  }

  function normalizeAuthHeader(authHeader) {
    if (!authHeader) return '';
    if (authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7).trim();
    }
    return authHeader;
  }

  function buildSseUrl(taskId, index, rawPublicKey) {
    const httpProtocol = window.location.protocol === 'https:' ? 'https' : 'http';
    const base = `${httpProtocol}://${window.location.host}/v1/public/imagine/sse`;
    const params = new URLSearchParams();
    params.set('task_id', taskId);
    params.set('t', String(Date.now()));
    if (typeof index === 'number') {
      params.set('conn', String(index));
    }
    if (rawPublicKey) {
      params.set('public_key', rawPublicKey);
    }
    return `${base}?${params.toString()}`;
  }

  function startSSE(taskIds, rawPublicKey) {
    connectionMode = 'sse';
    stopAllConnections();
    updateModeValue();

    setStatus('connected', '生成中 (SSE)');
    setButtons(true);
    toast(`已启动 ${taskIds.length} 个并发任务 (SSE)`, 'success');

    for (let i = 0; i < taskIds.length; i++) {
      const url = buildSseUrl(taskIds[i], i, rawPublicKey);
      const es = new EventSource(url);

      es.onopen = () => {
        updateActive();
      };

      es.onmessage = (event) => {
        handleMessage(event.data, es);
      };

      es.onerror = () => {
        updateActive();
        const remaining = sseConnections.filter(e => e && e.readyState === EventSource.OPEN).length;
        if (stopRequested && remaining === 0) {
          finalizeStoppedRun('已停止');
          return;
        }
        if (remaining === 0) {
          setStatus('error', '连接错误');
          setButtons(false);
          isRunning = false;
          startBtn.disabled = false;
          updateModeValue();
        }
      };

      sseConnections.push(es);
    }
  }

  async function startConnection() {
    const prompt = promptInput ? promptInput.value.trim() : '';
    if (!prompt) {
      toast('请输入提示词', 'error');
      return;
    }

    const authHeader = await ensurePublicKey();
    if (authHeader === null) {
      toast('请先配置 Public Key', 'error');
      window.location.href = '/login';
      return;
    }
    const rawPublicKey = normalizeAuthHeader(authHeader);

    const concurrent = concurrentSelect ? parseInt(concurrentSelect.value, 10) : 1;
    const ratio = ratioSelect ? ratioSelect.value : '2:3';
    const nsfwEnabled = nsfwSelect ? nsfwSelect.value === 'true' : true;
    const proEnabled = imagineProMode;

    if (isRunning) {
      toast('已在运行中', 'warning');
      return;
    }

    isRunning = true;
    stopRequested = false;
    setStatus('connecting', '连接中');
    startBtn.disabled = true;
    if (stopBtn) {
      stopBtn.disabled = false;
    }

    if (pendingFallbackTimer) {
      clearTimeout(pendingFallbackTimer);
      pendingFallbackTimer = null;
    }

    let taskIds = [];
    try {
      taskIds = await createImagineTasks(prompt, ratio, concurrent, authHeader, nsfwEnabled, proEnabled);
    } catch (e) {
      setStatus('error', '创建任务失败');
      startBtn.disabled = false;
      isRunning = false;
      return;
    }
    currentTaskIds = taskIds;

    if (modePreference === 'sse') {
      startSSE(taskIds, rawPublicKey);
      return;
    }

    connectionMode = 'ws';
    stopAllConnections();
    updateModeValue();

    let opened = 0;
    let fallbackDone = false;
    let fallbackTimer = null;
    if (modePreference === 'auto') {
      fallbackTimer = setTimeout(() => {
        if (!fallbackDone && opened === 0) {
          fallbackDone = true;
          startSSE(taskIds, rawPublicKey);
        }
      }, 1500);
    }
    pendingFallbackTimer = fallbackTimer;

    wsConnections = [];

    for (let i = 0; i < taskIds.length; i++) {
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const params = new URLSearchParams({ task_id: taskIds[i] });
      if (rawPublicKey) {
        params.set('public_key', rawPublicKey);
      }
      const wsUrl = `${protocol}://${window.location.host}/v1/public/imagine/ws?${params.toString()}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        opened += 1;
        updateActive();
        if (i === 0) {
          setStatus('connected', '生成中');
          setButtons(true);
          toast(`已启动 ${concurrent} 个并发任务`, 'success');
        }
        sendStart(prompt, ws);
      };

      ws.onmessage = (event) => {
        handleMessage(event.data, ws);
      };

      ws.onclose = () => {
        updateActive();
        if (connectionMode !== 'ws') {
          return;
        }
        const remaining = wsConnections.filter(w => w && w.readyState === WebSocket.OPEN).length;
        if (stopRequested && remaining === 0) {
          finalizeStoppedRun('已停止');
          return;
        }
        if (remaining === 0 && !fallbackDone) {
          setStatus('', '未连接');
          setButtons(false);
          isRunning = false;
          updateModeValue();
        }
      };

      ws.onerror = () => {
        updateActive();
        if (modePreference === 'auto' && opened === 0 && !fallbackDone) {
          fallbackDone = true;
          if (fallbackTimer) {
            clearTimeout(fallbackTimer);
          }
          startSSE(taskIds, rawPublicKey);
          return;
        }
        if (i === 0 && wsConnections.filter(w => w && w.readyState === WebSocket.OPEN).length === 0) {
          setStatus('error', '连接错误');
          startBtn.disabled = false;
          isRunning = false;
          updateModeValue();
        }
      };

      wsConnections.push(ws);
    }
  }

  function sendStart(promptOverride, targetWs) {
    const ws = targetWs || wsConnections[0];
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const prompt = promptOverride || (promptInput ? promptInput.value.trim() : '');
    const ratio = ratioSelect ? ratioSelect.value : '2:3';
    const nsfwEnabled = nsfwSelect ? nsfwSelect.value === 'true' : true;
    const proEnabled = imagineProMode;
    const payload = {
      type: 'start',
      prompt,
      aspect_ratio: ratio,
      nsfw: nsfwEnabled,
      pro: proEnabled
    };
    ws.send(JSON.stringify(payload));
    updateError('');
  }

  async function stopConnection() {
    if (!isRunning || stopRequested) {
      return;
    }
    if (pendingFallbackTimer) {
      clearTimeout(pendingFallbackTimer);
      pendingFallbackTimer = null;
    }

    stopRequested = true;
    if (stopBtn) {
      stopBtn.disabled = true;
    }
    setStatus('connecting', '停止中，等待当前批次完成');

    const authHeader = await ensurePublicKey();
    if (authHeader !== null && currentTaskIds.length > 0) {
      await stopImagineTasks(currentTaskIds, authHeader);
    }
    if (connectionMode === 'ws') {
      wsConnections.forEach(ws => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: 'stop' }));
          } catch (e) {
            // ignore
          }
        }
      });
    }
    const remainingWs = wsConnections.filter(w => w && w.readyState === WebSocket.OPEN).length;
    const remainingSse = sseConnections.filter(es => es && es.readyState === EventSource.OPEN).length;
    if (remainingWs === 0 && remainingSse === 0) {
      finalizeStoppedRun('已停止');
    }
  }

  function clearImages() {
    if (waterfall) {
      waterfall.innerHTML = '';
    }
    streamImageMap.clear();
    streamSequence = 0;
    imageCount = 0;
    totalLatency = 0;
    latencyCount = 0;
    updateCount(imageCount);
    updateLatency('');
    updateError('');
    if (emptyState) {
      emptyState.style.display = 'block';
    }
  }

  if (startBtn) {
    startBtn.addEventListener('click', () => startConnection());
  }

  if (stopBtn) {
    stopBtn.addEventListener('click', () => {
      stopConnection();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => clearImages());
  }

  if (promptInput) {
    promptInput.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        startConnection();
      }
    });
  }

  loadFilterDefaults();

  if (ratioSelect) {
    ratioSelect.addEventListener('change', () => {
      if (isRunning) {
        if (connectionMode === 'sse') {
          stopConnection().then(() => {
            setTimeout(() => startConnection(), 50);
          });
          return;
        }
        wsConnections.forEach(ws => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            sendStart(null, ws);
          }
        });
      }
    });
  }

  if (modeButtons.length > 0) {
    const saved = (() => {
      try {
        return localStorage.getItem(MODE_STORAGE_KEY);
      } catch (e) {
        return null;
      }
    })();
    if (saved) {
      setModePreference(saved, false);
    } else {
      setModePreference('auto', false);
    }

    modeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        if (!mode) return;
        setModePreference(mode);
        if (isRunning) {
          stopConnection().then(() => {
            setTimeout(() => startConnection(), 50);
          });
        }
      });
    });
  }

  if (qualityButtons.length > 0) {
    const savedQuality = (() => {
      try {
        return localStorage.getItem(QUALITY_STORAGE_KEY);
      } catch (e) {
        return null;
      }
    })();
    setQualityMode(savedQuality === 'quality', false);
    qualityButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        setQualityMode(btn.dataset.pro === 'true');
      });
    });
  }

  // File System API support check
  if ('showDirectoryPicker' in window) {
    if (selectFolderBtn) {
      selectFolderBtn.disabled = false;
      selectFolderBtn.addEventListener('click', async () => {
        try {
          directoryHandle = await window.showDirectoryPicker({
            mode: 'readwrite'
          });
          useFileSystemAPI = true;
          if (folderPath) {
            folderPath.textContent = directoryHandle.name;
            selectFolderBtn.style.color = '#059669';
          }
          toast('已选择文件夹: ' + directoryHandle.name, 'success');
        } catch (e) {
          if (e.name !== 'AbortError') {
            toast('选择文件夹失败', 'error');
          }
        }
      });
    }
  }

  // Enable/disable folder selection based on auto-download
  if (autoDownloadToggle && selectFolderBtn) {
    autoDownloadToggle.addEventListener('change', () => {
      if (autoDownloadToggle.checked && 'showDirectoryPicker' in window) {
        selectFolderBtn.disabled = false;
      } else {
        selectFolderBtn.disabled = true;
      }
    });
  }

  // Collapsible cards - 点击"连接状态"标题控制所有卡片
  const statusToggle = document.getElementById('statusToggle');

  if (statusToggle) {
    statusToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const cards = document.querySelectorAll('.imagine-card-collapsible');
      const allCollapsed = Array.from(cards).every(card => card.classList.contains('collapsed'));

      cards.forEach(card => {
        if (allCollapsed) {
          card.classList.remove('collapsed');
        } else {
          card.classList.add('collapsed');
        }
      });
    });
  }

  // Batch download functionality
  const batchDownloadBtn = document.getElementById('batchDownloadBtn');
  const selectionToolbar = document.getElementById('selectionToolbar');
  const toggleSelectAllBtn = document.getElementById('toggleSelectAllBtn');
  const downloadSelectedBtn = document.getElementById('downloadSelectedBtn');

  function enterSelectionMode() {
    isSelectionMode = true;
    selectedImages.clear();
    selectionToolbar.classList.remove('hidden');

    const items = document.querySelectorAll('.waterfall-item');
    items.forEach(item => {
      item.classList.add('selection-mode');
    });

    updateSelectedCount();
  }

  function exitSelectionMode() {
    isSelectionMode = false;
    selectedImages.clear();
    selectionToolbar.classList.add('hidden');

    const items = document.querySelectorAll('.waterfall-item');
    items.forEach(item => {
      item.classList.remove('selection-mode', 'selected');
    });
  }

  function toggleSelectionMode() {
    if (isSelectionMode) {
      exitSelectionMode();
    } else {
      enterSelectionMode();
    }
  }

  function toggleImageSelection(item) {
    if (!isSelectionMode) return;

    if (item.classList.contains('selected')) {
      item.classList.remove('selected');
      selectedImages.delete(item);
    } else {
      item.classList.add('selected');
      selectedImages.add(item);
    }

    updateSelectedCount();
  }

  function updateSelectedCount() {
    const countSpan = document.getElementById('selectedCount');
    if (countSpan) {
      countSpan.textContent = selectedImages.size;
    }
    if (downloadSelectedBtn) {
      downloadSelectedBtn.disabled = selectedImages.size === 0;
    }

    // Update toggle select all button text
    if (toggleSelectAllBtn) {
      const items = document.querySelectorAll('.waterfall-item');
      const allSelected = items.length > 0 && selectedImages.size === items.length;
      toggleSelectAllBtn.textContent = allSelected ? '取消全选' : '全选';
    }
  }

  function toggleSelectAll() {
    const items = document.querySelectorAll('.waterfall-item');
    const allSelected = items.length > 0 && selectedImages.size === items.length;

    if (allSelected) {
      // Deselect all
      items.forEach(item => {
        item.classList.remove('selected');
      });
      selectedImages.clear();
    } else {
      // Select all
      items.forEach(item => {
        item.classList.add('selected');
        selectedImages.add(item);
      });
    }

    updateSelectedCount();
  }

  async function downloadSelectedImages() {
    if (selectedImages.size === 0) {
      toast('请先选择要下载的图片', 'warning');
      return;
    }

    if (typeof JSZip === 'undefined') {
      toast('JSZip 库加载失败，请刷新页面重试', 'error');
      return;
    }

    toast(`正在打包 ${selectedImages.size} 张图片...`, 'info');
    downloadSelectedBtn.disabled = true;
    downloadSelectedBtn.textContent = '打包中...';

    const zip = new JSZip();
    const imgFolder = zip.folder('images');
    let processed = 0;

    try {
      for (const item of selectedImages) {
        const url = item.dataset.imageUrl;
        const prompt = item.dataset.prompt || 'image';

        try {
          let blob = null;
          if (url && url.startsWith('data:')) {
            blob = dataUrlToBlob(url);
          } else if (url) {
            const response = await fetch(url);
            blob = await response.blob();
          }
          if (!blob) {
            throw new Error('empty blob');
          }
          const pId = String(item.dataset.parentPostId || '').trim();
          const nameParts = [prompt.substring(0, 20).replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')];
          if (pId) nameParts.push(pId.slice(0, 16));
          nameParts.push(String(processed + 1));
          const filename = `${nameParts.join('_')}.png`;
          imgFolder.file(filename, blob);
          processed++;

          // Update progress
          downloadSelectedBtn.innerHTML = `打包中... (${processed}/${selectedImages.size})`;
        } catch (error) {
          console.error('Failed to fetch image:', error);
        }
      }

      if (processed === 0) {
        toast('没有成功获取任何图片', 'error');
        return;
      }

      // Generate zip file
      downloadSelectedBtn.textContent = '生成压缩包...';
      const content = await zip.generateAsync({ type: 'blob' });

      // Download zip
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `imagine_${new Date().toISOString().slice(0, 10)}_${Date.now()}.zip`;
      link.click();
      URL.revokeObjectURL(link.href);

      toast(`成功打包 ${processed} 张图片`, 'success');
      exitSelectionMode();
    } catch (error) {
      console.error('Download failed:', error);
      toast('打包失败，请重试', 'error');
    } finally {
      downloadSelectedBtn.disabled = false;
      downloadSelectedBtn.innerHTML = `下载 <span id="selectedCount" class="selected-count">${selectedImages.size}</span>`;
    }
  }

  if (batchDownloadBtn) {
    batchDownloadBtn.addEventListener('click', toggleSelectionMode);
  }

  if (toggleSelectAllBtn) {
    toggleSelectAllBtn.addEventListener('click', toggleSelectAll);
  }

  if (downloadSelectedBtn) {
    downloadSelectedBtn.addEventListener('click', downloadSelectedImages);
  }


  // Handle image/checkbox clicks in waterfall
  if (waterfall) {
    waterfall.addEventListener('click', (e) => {
      const item = e.target.closest('.waterfall-item');
      if (!item) return;
      if (e.target.closest('.copy-parent-id-btn')) {
        e.preventDefault();
        e.stopPropagation();
        copyParentPostIdFromItem(item);
        return;
      }

      if (isSelectionMode) {
        // In selection mode, clicking anywhere on the item toggles selection
        toggleImageSelection(item);
      } else {
        // In normal mode, only clicking the image opens lightbox
        if (e.target.closest('.waterfall-item img')) {
          const img = e.target.closest('.waterfall-item img');
          const images = getAllImages();
          const index = images.indexOf(img);

          if (index !== -1) {
            updateLightbox(index);
            pauseWsForEdit();
            lightbox.classList.add('active');
            updateLightboxKeyboardShift();
          }
        }
      }
    });
  }

  // Lightbox for image preview with navigation
  const lightboxPrev = document.getElementById('lightboxPrev');
  const lightboxNext = document.getElementById('lightboxNext');
  let currentImageIndex = -1;

  function getAllImages() {
    return Array.from(document.querySelectorAll('.waterfall-item img'));
  }

  function getItemByImageIndex(index) {
    const images = getAllImages();
    if (index < 0 || index >= images.length) return null;
    return images[index].closest('.waterfall-item');
  }

  function updateLightbox(index) {
    const images = getAllImages();
    if (index < 0 || index >= images.length) return;

    currentImageIndex = index;
    setLightboxImageFullscreen(false);
    lightboxImg.src = images[index].src;
    const item = getItemByImageIndex(index);
    renderLightboxHistory(item);
    if (lightboxEditSend) {
      const parentPostId = item ? String(item.dataset.parentPostId || '').trim() : '';
      if (String(lightboxEditSend.dataset.running || '0') !== '1') {
        lightboxEditSend.disabled = !parentPostId;
        lightboxEditSend.textContent = '发送编辑';
      }
      lightboxEditSend.title = parentPostId ? '使用 parentPostId 发起编辑' : '当前图片缺少 parentPostId，无法编辑';
      if (lightboxEditInput && !lightboxEditInput.value.trim()) {
        const seedPrompt = item ? String(item.dataset.prompt || '').trim() : '';
        if (seedPrompt) {
          lightboxEditInput.value = `基于此图编辑：${seedPrompt}`;
        }
      }
    }

    // Update navigation buttons state
    if (lightboxPrev) lightboxPrev.disabled = (index === 0);
    if (lightboxNext) lightboxNext.disabled = (index === images.length - 1);
  }

  function showPrevImage() {
    if (currentImageIndex > 0) {
      updateLightbox(currentImageIndex - 1);
    }
  }

  function showNextImage() {
    const images = getAllImages();
    if (currentImageIndex < images.length - 1) {
      updateLightbox(currentImageIndex + 1);
    }
  }

  async function startEditFromLightbox() {
    if (lightboxEditSend && String(lightboxEditSend.dataset.running || '0') === '1') {
      cancelLightboxEdit();
      return;
    }
    const item = getItemByImageIndex(currentImageIndex);
    if (!item) {
      toast('未找到当前图片', 'error');
      return;
    }
    const parentPostId = String(item.dataset.parentPostId || '').trim();
    if (!parentPostId) {
      toast('当前图片缺少 parentPostId，无法进入编辑模式', 'warning');
      return;
    }

    const finalPrompt = String(lightboxEditInput ? lightboxEditInput.value : '').trim();
    if (!finalPrompt) {
      toast('编辑提示词不能为空', 'warning');
      if (lightboxEditInput) {
        lightboxEditInput.focus();
      }
      return;
    }

    const authHeader = await ensurePublicKey();
    if (authHeader === null) {
      toast('请先配置 Public Key', 'error');
      window.location.href = '/login';
      return;
    }

    const sourceImageUrl = await resolveSourceImageByParentPostId(
      authHeader,
      parentPostId,
      String(item.dataset.sourceImageUrl || '').trim()
    );
    lightboxEditAbortController = new AbortController();
    if (lightboxEditSend) {
      lightboxEditSend.dataset.running = '1';
      lightboxEditSend.textContent = '中止';
      lightboxEditSend.disabled = false;
    }
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
            const safe = Math.max(editProgressValue, Math.min(99, next));
            setEditProgress(safe, text || `编辑中 ${safe}%`);
          } else if (text) {
            setEditProgress(editProgressValue, text);
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
      const generatedParent = extractParentPostId(data && data.current_parent_post_id)
        || extractParentPostId(data && data.generated_parent_post_id)
        || extractParentPostId(output)
        || `edit-${Date.now()}`;
      const nextSourceImageUrl = pickSourceImageUrl(
        [
          data && data.current_source_image_url,
          data && data.source_image_url,
          output,
          item.dataset.sourceImageUrl,
        ],
        generatedParent
      );
      const displayUrl = toDisplayImageUrl(output);
      if (!displayUrl) {
        throw new Error('编辑结果格式无效');
      }
      const oldParent = String(item.dataset.parentPostId || '').trim();
      if (oldParent && streamImageMap.get(oldParent) === item) {
        streamImageMap.delete(oldParent);
      }
      const img = item.querySelector('img');
      if (img) {
        img.src = displayUrl;
      }
      item.dataset.imageUrl = displayUrl;
      item.dataset.prompt = finalPrompt;
      item.dataset.parentPostId = generatedParent;
      item.dataset.shareLink = buildPostShareLink(generatedParent);
      item.dataset.sourceImageUrl = nextSourceImageUrl;
      rememberParentPost({
        parentPostId: generatedParent,
        shareLink: buildPostShareLink(generatedParent),
        sourceImageUrl: nextSourceImageUrl,
        imageUrl: displayUrl,
        origin: 'imagine_edit',
      });
      streamImageMap.set(generatedParent, item);
      const elapsed = data && data.elapsed_ms ? Number(data.elapsed_ms) : 0;
      updateEditDurationEstimate(elapsed);
      const metaRight = item.querySelector('.waterfall-meta span');
      if (metaRight && elapsed > 0) {
        metaRight.textContent = `${elapsed}ms`;
      }
      const history = getLightboxHistory(item);
      const maxRound = history.reduce((max, it) => Math.max(max, Number(it && it.round ? it.round : 0)), 0);
      history.unshift({
        id: `edit_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
        round: maxRound + 1,
        mode: 'edit',
        prompt: finalPrompt,
        imageUrl: displayUrl,
        parentPostId: generatedParent,
        shareLink: buildPostShareLink(generatedParent),
        sourceImageUrl: nextSourceImageUrl,
        elapsedMs: Number.isFinite(elapsed) ? Math.max(0, Math.round(elapsed)) : 0,
        createdAt: Date.now(),
      });
      lightboxImg.src = displayUrl;
      renderLightboxHistory(item);
      finishEditProgress(true, '编辑完成 100%');
      toast('编辑完成，已替换当前图片', 'success');
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
      if (lightboxEditSend) {
        lightboxEditSend.dataset.running = '0';
        setLightboxEditButtonState(false);
      }
      if (lightboxEditInput) {
        lightboxEditInput.disabled = false;
      }
    }
  }

  if (lightbox && closeLightbox) {
    closeLightbox.addEventListener('click', (e) => {
      e.stopPropagation();
      cancelLightboxEdit();
      setLightboxImageFullscreen(false);
      lightbox.classList.remove('active');
      setLightboxKeyboardShift(0);
      currentImageIndex = -1;
      if (lightboxEditSend) {
        lightboxEditSend.textContent = '发送编辑';
        lightboxEditSend.disabled = true;
      }
      if (lightboxEditInput) {
        lightboxEditInput.value = '';
        lightboxEditInput.disabled = false;
      }
      hideEditProgress();
      renderLightboxHistory(null);
      resumeWsAfterEdit();
    });

    lightbox.addEventListener('click', () => {
      cancelLightboxEdit();
      setLightboxImageFullscreen(false);
      lightbox.classList.remove('active');
      setLightboxKeyboardShift(0);
      currentImageIndex = -1;
      if (lightboxEditSend) {
        lightboxEditSend.textContent = '发送编辑';
        lightboxEditSend.disabled = true;
      }
      if (lightboxEditInput) {
        lightboxEditInput.value = '';
        lightboxEditInput.disabled = false;
      }
      hideEditProgress();
      renderLightboxHistory(null);
      resumeWsAfterEdit();
    });

    // Prevent closing when clicking on the image
    if (lightboxImg) {
      lightboxImg.addEventListener('click', (e) => {
        e.stopPropagation();
        setLightboxImageFullscreen(!lightboxImageFullscreen);
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

    if (lightboxEditor) {
      lightboxEditor.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }

    // Navigation buttons
    if (lightboxPrev) {
      lightboxPrev.addEventListener('click', (e) => {
        e.stopPropagation();
        showPrevImage();
      });
    }

    if (lightboxNext) {
      lightboxNext.addEventListener('click', (e) => {
        e.stopPropagation();
        showNextImage();
      });
    }

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (!lightbox.classList.contains('active')) return;

      if (e.key === 'Escape') {
        if (lightboxImageFullscreen) {
          setLightboxImageFullscreen(false);
          return;
        }
        cancelLightboxEdit();
        lightbox.classList.remove('active');
        setLightboxKeyboardShift(0);
        currentImageIndex = -1;
        if (lightboxEditSend) {
          lightboxEditSend.textContent = '发送编辑';
          lightboxEditSend.disabled = true;
        }
        if (lightboxEditInput) {
          lightboxEditInput.value = '';
          lightboxEditInput.disabled = false;
        }
        hideEditProgress();
        renderLightboxHistory(null);
        resumeWsAfterEdit();
      } else if (e.key === 'ArrowLeft') {
        setLightboxImageFullscreen(false);
        showPrevImage();
      } else if (e.key === 'ArrowRight') {
        setLightboxImageFullscreen(false);
        showNextImage();
      }
    });
  }

  window.addEventListener('resize', updateLightboxKeyboardShift);
  window.addEventListener('orientationchange', () => {
    setTimeout(updateLightboxKeyboardShift, 120);
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateLightboxKeyboardShift);
    window.visualViewport.addEventListener('scroll', updateLightboxKeyboardShift);
  }

  // Make floating actions draggable
  const floatingActions = document.getElementById('floatingActions');
  if (floatingActions) {
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    floatingActions.style.touchAction = 'none';

    floatingActions.addEventListener('pointerdown', (e) => {
      if (e.target.tagName.toLowerCase() === 'button' || e.target.closest('button')) return;

      e.preventDefault();
      isDragging = true;
      floatingActions.setPointerCapture(e.pointerId);
      startX = e.clientX;
      startY = e.clientY;

      const rect = floatingActions.getBoundingClientRect();

      if (!floatingActions.style.left || floatingActions.style.left === '') {
        floatingActions.style.left = rect.left + 'px';
        floatingActions.style.top = rect.top + 'px';
        floatingActions.style.transform = 'none';
        floatingActions.style.bottom = 'auto';
      }

      initialLeft = parseFloat(floatingActions.style.left);
      initialTop = parseFloat(floatingActions.style.top);

      floatingActions.classList.add('shadow-xl');
    });

    document.addEventListener('pointermove', (e) => {
      if (!isDragging) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      floatingActions.style.left = `${initialLeft + dx}px`;
      floatingActions.style.top = `${initialTop + dy}px`;
    });

    document.addEventListener('pointerup', (e) => {
      if (isDragging) {
        isDragging = false;
        floatingActions.releasePointerCapture(e.pointerId);
        floatingActions.classList.remove('shadow-xl');
      }
    });
  }

  /**
   * 移动端 Sticky Bar 初始化
   */
  function initStickyBar() {
    /* 移动端专属：PC 下直接退出，避免 DOM 被移动 */
    if (!window.matchMedia("(max-width: 900px)").matches) return;
    /* 图标按钮代理 */
    const proxyMap = {
      imClearBtn: 'clearBtn',
      imBatchBtn: 'batchDownloadBtn',
      imSelectAllBtn: 'toggleSelectAllBtn',
      imDownloadSelectedBtn: 'downloadSelectedBtn',
    };
    Object.entries(proxyMap).forEach(([stickyId, origId]) => {
      const stickyEl = document.getElementById(stickyId);
      const origEl = document.getElementById(origId);
      if (stickyEl && origEl) stickyEl.addEventListener('click', () => origEl.click());
    });

    /* 主按钮（开始/停止）同步 */
    const imBtn = document.getElementById('imStartStopBtn');
    const playIcon = imBtn && imBtn.querySelector('.im-btn-icon-play');
    const stopIcon = imBtn && imBtn.querySelector('.im-btn-icon-stop');
    const btnLabel = imBtn && imBtn.querySelector('.im-btn-label');

    function syncMainBtn() {
      if (!imBtn) return;
      const isStopping = startBtn && startBtn.classList.contains('hidden');
      imBtn.classList.toggle('is-stop', !!isStopping);
      if (playIcon) playIcon.style.display = isStopping ? 'none' : '';
      if (stopIcon) stopIcon.style.display = isStopping ? '' : 'none';
      if (btnLabel) btnLabel.textContent = isStopping ? '停止' : '开始';
    }

    if (imBtn) {
      imBtn.addEventListener('click', () => {
        const isStopping = startBtn && startBtn.classList.contains('hidden');
        (isStopping ? stopBtn : startBtn) && (isStopping ? stopBtn : startBtn).click();
      });
    }
    if (startBtn) new MutationObserver(syncMainBtn).observe(startBtn, { attributes: true, attributeFilter: ['class'] });
    syncMainBtn();

    /* 选中数字角标同步 */
    const origBadge = document.getElementById('selectedCount');
    const imBadge = document.getElementById('imSelectedBadge');
    function syncBadge() {
      if (!origBadge || !imBadge) return;
      const count = parseInt(origBadge.textContent || '0', 10);
      imBadge.textContent = String(count);
      imBadge.classList.toggle('visible', count > 0);
    }
    if (origBadge) {
      new MutationObserver(syncBadge).observe(origBadge, { characterData: true, childList: true, subtree: true });
      syncBadge();
    }

    /* 生成设置 Bottom Sheet */
    const settingsBtn = document.getElementById('imSettingsBtn');
    const settingsOverlay = document.getElementById('imSettingsOverlay');
    const settingsCard = document.querySelector('.settings-card');

    let settingsSheet = document.getElementById('imSettingsSheet');
    if (!settingsSheet && settingsCard) {
      settingsSheet = document.createElement('div');
      settingsSheet.id = 'imSettingsSheet';
      settingsSheet.className = 'im-settings-sheet';

      const handle = document.createElement('div');
      handle.className = 'im-settings-sheet-handle';
      settingsSheet.appendChild(handle);

      const titleEl = document.createElement('div');
      titleEl.className = 'im-settings-sheet-title';
      titleEl.textContent = '生成设置';
      settingsSheet.appendChild(titleEl);

      // 移动整个 card-content 到 Bottom Sheet
      const cardContent = settingsCard.querySelector('.card-content');
      if (cardContent) settingsSheet.appendChild(cardContent);

      // 把提示词区域（.settings-block-prompt）取出，放回页面 settings-card
      // 这样提示词始终可见，Bottom Sheet 只含其他设置项
      const promptBlock = settingsSheet.querySelector('.settings-block-prompt');
      if (promptBlock) {
        const promptWrap = document.createElement('div');
        promptWrap.className = 'card-content';
        promptWrap.appendChild(promptBlock);
        settingsCard.appendChild(promptWrap);
      }

      document.body.appendChild(settingsSheet);
    }

    function openSettings() {
      if (!settingsSheet || !settingsOverlay) return;
      settingsOverlay.classList.add('active');
      requestAnimationFrame(() => settingsSheet.classList.add('open'));
    }
    function closeSettings() {
      if (!settingsSheet || !settingsOverlay) return;
      settingsSheet.classList.remove('open');
      settingsOverlay.classList.remove('active');
    }

    if (settingsBtn) settingsBtn.addEventListener('click', openSettings);
    if (settingsOverlay) settingsOverlay.addEventListener('click', closeSettings);
    const sheetHandle = settingsSheet && settingsSheet.querySelector('.im-settings-sheet-handle');
    if (sheetHandle) sheetHandle.addEventListener('click', closeSettings);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && settingsSheet && settingsSheet.classList.contains('open')) closeSettings();
    });
  }

  initStickyBar();
})();
