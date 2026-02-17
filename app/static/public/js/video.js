(() => {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const clearBtn = document.getElementById('clearBtn');
  const pickCachedVideoBtn = document.getElementById('pickCachedVideoBtn');
  const uploadWorkVideoBtn = document.getElementById('uploadWorkVideoBtn');
  const workVideoFileInput = document.getElementById('workVideoFileInput');
  const cacheVideoModal = document.getElementById('cacheVideoModal');
  const closeCacheVideoModalBtn = document.getElementById('closeCacheVideoModalBtn');
  const cacheVideoList = document.getElementById('cacheVideoList');
  const enterEditBtn = document.getElementById('enterEditBtn');
  const editPanel = document.getElementById('editPanel');
  const editHint = document.getElementById('editHint');
  const editBody = document.getElementById('editBody');
  const cancelEditBtn = document.getElementById('cancelEditBtn');
  const editVideo = document.getElementById('editVideo');
  const editTimeline = document.getElementById('editTimeline');
  const editTimeText = document.getElementById('editTimeText');
  const editDurationText = document.getElementById('editDurationText');
  const editFrameIndex = document.getElementById('editFrameIndex');
  const editTimestampMs = document.getElementById('editTimestampMs');
  const editFrameHash = document.getElementById('editFrameHash');
  const editPromptInput = document.getElementById('editPromptInput');
  const spliceBtn = document.getElementById('spliceBtn');
  const pickMergeVideoBtn = document.getElementById('pickMergeVideoBtn');
  const directMergeBtn = document.getElementById('directMergeBtn');
  const mergeVideoA = document.getElementById('mergeVideoA');
  const mergeVideoB = document.getElementById('mergeVideoB');
  const mergeVideoPreviewA = document.getElementById('mergeVideoPreviewA');
  const mergeVideoPreviewB = document.getElementById('mergeVideoPreviewB');
  const mergeTimelineA = document.getElementById('mergeTimelineA');
  const mergeTimelineB = document.getElementById('mergeTimelineB');
  const mergeTimeTextA = document.getElementById('mergeTimeTextA');
  const mergeTimeTextB = document.getElementById('mergeTimeTextB');
  const mergeDurationA = document.getElementById('mergeDurationA');
  const mergeDurationB = document.getElementById('mergeDurationB');
  const promptInput = document.getElementById('promptInput');
  const imageUrlInput = document.getElementById('imageUrlInput');
  const parentPostInput = document.getElementById('parentPostInput');
  const applyParentBtn = document.getElementById('applyParentBtn');
  const imageFileInput = document.getElementById('imageFileInput');
  const imageFileName = document.getElementById('imageFileName');
  const clearImageFileBtn = document.getElementById('clearImageFileBtn');
  const selectImageFileBtn = document.getElementById('selectImageFileBtn');
  const ratioSelect = document.getElementById('ratioSelect');
  const lengthSelect = document.getElementById('lengthSelect');
  const resolutionSelect = document.getElementById('resolutionSelect');
  const presetSelect = document.getElementById('presetSelect');
  const concurrentSelect = document.getElementById('concurrentSelect');
  const statusText = document.getElementById('statusText');
  const progressBar = document.getElementById('progressBar');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  const durationValue = document.getElementById('durationValue');
  const aspectValue = document.getElementById('aspectValue');
  const lengthValue = document.getElementById('lengthValue');
  const resolutionValue = document.getElementById('resolutionValue');
  const presetValue = document.getElementById('presetValue');
  const countValue = document.getElementById('countValue');
  const videoEmpty = document.getElementById('videoEmpty');
  const videoStage = document.getElementById('videoStage');
  const referencePreview = document.getElementById('referencePreview');
  const referencePreviewImg = document.getElementById('referencePreviewImg');
  const referencePreviewMeta = document.getElementById('referencePreviewMeta');
  const refDropZone = document.getElementById('refDropZone');
  const historyCount = document.getElementById('historyCount');

  let taskStates = new Map();
  let activeTaskIds = [];
  let isRunning = false;
  let hasRunError = false;
  let startAt = 0;
  let fileDataUrl = '';
  let elapsedTimer = null;
  let lastProgress = 0;
  let previewCount = 0;
  let refDragCounter = 0;
  let selectedVideoItemId = '';
  let selectedVideoUrl = '';
  let editingRound = 0;
  let editingBusy = false;
  let activeSpliceRun = null;
  let lockedFrameIndex = -1;
  let lockedTimestampMs = 0;
  let lastFrameHash = '';
  let ffmpegInstance = null;
  let ffmpegLoaded = false;
  let ffmpegLoading = false;
  const DEFAULT_REASONING_EFFORT = 'low';
  const EDIT_TIMELINE_MAX = 100000;
  const TAIL_FRAME_GUARD_MS = 80;
  let mergeTargetVideoUrl = '';
  let mergeTargetVideoName = '';
  let mergeCutMsA = 0;
  let mergeCutMsB = 0;
  let workVideoObjectUrl = '';

  function buildHistoryTitle(type, serial) {
    const n = Math.max(1, parseInt(String(serial || '1'), 10) || 1);
    if (type === 'splice') {
      return `拼接视频${n}`;
    }
    return `生成视频${n}`;
  }
  let cacheModalPickMode = 'edit';
  let cacheModalAnchorEl = null;

  function toast(message, type) {
    if (typeof showToast === 'function') {
      showToast(message, type);
    }
  }

  function formatMs(ms) {
    const safe = Math.max(0, Number(ms) || 0);
    const totalSeconds = Math.floor(safe / 1000);
    const milli = Math.floor(safe % 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milli).padStart(3, '0')}`;
  }

  function shortHash(value) {
    const raw = String(value || '');
    if (!raw) return '-';
    if (raw.length <= 14) return raw;
    return `${raw.slice(0, 8)}...${raw.slice(-6)}`;
  }

  function setEditMeta() {
    if (editFrameIndex) editFrameIndex.textContent = lockedFrameIndex >= 0 ? String(lockedFrameIndex) : '-';
    if (editTimestampMs) editTimestampMs.textContent = String(Math.max(0, Math.round(lockedTimestampMs)));
    if (editFrameHash) editFrameHash.textContent = shortHash(lastFrameHash);
  }

  function getSafeEditMaxTimestampMs() {
    if (!editVideo) return Infinity;
    const durationMs = Math.floor(Math.max(0, Number(editVideo.duration || 0) * 1000));
    if (!durationMs) return Infinity;
    return Math.max(0, durationMs - TAIL_FRAME_GUARD_MS);
  }

  function clampEditTimestampMs(ms) {
    const safe = Math.max(0, Math.round(Number(ms) || 0));
    const maxMs = getSafeEditMaxTimestampMs();
    if (!Number.isFinite(maxMs)) return safe;
    return Math.max(0, Math.min(safe, maxMs));
  }

  function setSpliceButtonState(state) {
    if (!spliceBtn) return;
    const iconSplice = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H6a2 2 0 0 0-2 2v5"/><path d="M13 20h5a2 2 0 0 0 2-2v-5"/><path d="M20 6l-8 8"/><path d="M4 18l8-8"/></svg>';
    const iconStop = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="14" height="14"/></svg>';
    if (state === 'running') {
      spliceBtn.disabled = false;
      spliceBtn.innerHTML = `${iconStop}<span>中止拼接</span>`;
      return;
    }
    if (state === 'stopping') {
      spliceBtn.disabled = true;
      spliceBtn.innerHTML = `${iconStop}<span>中止中...</span>`;
      return;
    }
    spliceBtn.disabled = false;
    spliceBtn.innerHTML = `${iconSplice}<span>拼接视频</span>`;
  }

  function setEditTimelineLock(locked) {
    if (!editTimeline) return;
    editTimeline.disabled = Boolean(locked);
    editTimeline.style.pointerEvents = locked ? 'none' : '';
    editTimeline.style.opacity = locked ? '0.6' : '';
  }

  function updateHistoryCount() {
    if (!historyCount || !videoStage) return;
    const count = videoStage.querySelectorAll('.video-item').length;
    historyCount.textContent = String(count);
  }

  function removePreviewItem(item) {
    if (!item || !videoStage) return;
    const idx = String(item.dataset.index || '');
    const url = String(item.dataset.url || '').trim();
    if (selectedVideoItemId && selectedVideoItemId === idx) {
      selectedVideoItemId = '';
      selectedVideoUrl = '';
      if (enterEditBtn) enterEditBtn.disabled = true;
      closeEditPanel();
    }
    if (mergeTargetVideoUrl && url && mergeTargetVideoUrl === url) {
      mergeTargetVideoUrl = '';
      mergeTargetVideoName = '';
    }
    item.remove();
    const hasAny = videoStage.querySelector('.video-item');
    if (!hasAny) {
      videoStage.classList.add('hidden');
      if (videoEmpty) videoEmpty.classList.remove('hidden');
    }
    updateHistoryCount();
    refreshVideoSelectionUi();
    updateMergeLabels();
    updateManualActionsVisibility();
  }

  function updateMergeLabels() {
    if (mergeVideoA) {
      mergeVideoA.textContent = selectedVideoUrl ? shortHash(selectedVideoUrl) : '-';
    }
    if (mergeVideoB) {
      mergeVideoB.textContent = mergeTargetVideoName || (mergeTargetVideoUrl ? shortHash(mergeTargetVideoUrl) : '-');
    }
  }

  function updateManualActionsVisibility() {
    const hasWorkspaceVideo = Boolean(String(selectedVideoUrl || '').trim());
    if (pickMergeVideoBtn) {
      pickMergeVideoBtn.style.display = hasWorkspaceVideo ? '' : 'none';
    }
    if (directMergeBtn) {
      directMergeBtn.style.display = hasWorkspaceVideo ? '' : 'none';
      directMergeBtn.disabled = !hasWorkspaceVideo;
    }
  }

  function getParentMemoryApi() {
    return window.ParentPostMemory || null;
  }

  function extractParentPostId(text) {
    const raw = String(text || '').trim();
    if (!raw) return '';
    const api = getParentMemoryApi();
    if (api && typeof api.extractParentPostId === 'function') {
      try {
        return String(api.extractParentPostId(raw) || '').trim();
      } catch (e) {
        // ignore
      }
    }
    const direct = raw.match(/^[0-9a-fA-F-]{32,36}$/);
    if (direct) return direct[0];
    const generated = raw.match(/\/generated\/([0-9a-fA-F-]{32,36})(?:\/|$)/);
    if (generated) return generated[1];
    const imaginePublic = raw.match(/\/imagine-public\/images\/([0-9a-fA-F-]{32,36})(?:\.jpg|\/|$)/);
    if (imaginePublic) return imaginePublic[1];
    const all = raw.match(/([0-9a-fA-F-]{32,36})/g);
    return all && all.length ? all[all.length - 1] : '';
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

  function pickSourceUrl(hit, parentPostId, fallbackValue = '') {
    const candidates = [
      hit && hit.sourceImageUrl,
      hit && hit.source_image_url,
      hit && hit.imageUrl,
      hit && hit.image_url,
      fallbackValue,
    ];
    for (const candidate of candidates) {
      const normalized = normalizeHttpSourceUrl(candidate);
      if (normalized) return normalized;
    }
    if (!parentPostId) return '';
    const api = getParentMemoryApi();
    if (api && typeof api.buildImaginePublicUrl === 'function') {
      return String(api.buildImaginePublicUrl(parentPostId) || '').trim();
    }
    return `https://imagine-public.x.ai/imagine-public/images/${parentPostId}.jpg`;
  }

  function pickPreviewUrl(hit, parentPostId, fallbackValue = '') {
    const candidates = [
      hit && hit.imageUrl,
      hit && hit.image_url,
      hit && hit.sourceImageUrl,
      hit && hit.source_image_url,
      fallbackValue,
    ];
    for (const candidate of candidates) {
      const raw = String(candidate || '').trim();
      if (raw) return raw;
    }
    return pickSourceUrl(hit, parentPostId, fallbackValue);
  }

  function resolveReferenceByText(text) {
    const raw = String(text || '').trim();
    if (!raw) return { url: '', sourceUrl: '', parentPostId: '' };
    const api = getParentMemoryApi();
    if (api && typeof api.resolveByText === 'function') {
      try {
        const hit = api.resolveByText(raw);
        if (hit && hit.parentPostId) {
          const parentPostId = String(hit.parentPostId || '').trim();
          const sourceUrl = pickSourceUrl(hit, parentPostId);
          const previewUrl = pickPreviewUrl(hit, parentPostId, sourceUrl);
          return {
            url: previewUrl || sourceUrl,
            sourceUrl,
            parentPostId,
          };
        }
      } catch (e) {
        // ignore
      }
    }
    const parentPostId = extractParentPostId(raw);
    if (!parentPostId) {
      return { url: raw, sourceUrl: normalizeHttpSourceUrl(raw), parentPostId: '' };
    }
    const sourceUrl = pickSourceUrl({ sourceImageUrl: raw }, parentPostId, raw);
    const previewUrl = pickPreviewUrl({ imageUrl: raw, sourceImageUrl: sourceUrl }, parentPostId, sourceUrl);
    return { url: previewUrl || sourceUrl, sourceUrl, parentPostId };
  }

  function applyParentPostReference(text, options = {}) {
    const silent = Boolean(options.silent);
    const resolved = resolveReferenceByText(text);
    if (!resolved.parentPostId || !(resolved.url || resolved.sourceUrl)) {
      if (!silent) {
        toast('未识别到有效 parentPostId', 'warning');
      }
      return false;
    }
    if (imageUrlInput) {
      imageUrlInput.value = resolved.sourceUrl || resolved.url;
    }
    if (parentPostInput) {
      parentPostInput.value = resolved.parentPostId;
    }
    clearFileSelection();
    setReferencePreview(resolved.url || resolved.sourceUrl, resolved.parentPostId);
    if (!silent) {
      toast('已使用 parentPostId 填充参考图', 'success');
    }
    return true;
  }

  function clearReferencePreview() {
    if (!referencePreview) return;
    referencePreview.classList.add('hidden');
    if (referencePreviewImg) {
      referencePreviewImg.removeAttribute('src');
    }
    if (referencePreviewMeta) {
      referencePreviewMeta.textContent = '';
    }
  }

  function buildReferencePreviewMeta(url, parentPostId) {
    const raw = String(url || '').trim();
    if (parentPostId) {
      return `parentPostId: ${parentPostId}`;
    }
    if (!raw) return '';
    if (raw.startsWith('data:image/')) {
      return '本地图片（Base64 已隐藏）';
    }
    return raw;
  }

  function setReferencePreview(url, parentPostId) {
    const safeUrl = String(url || '').trim();
    if (!safeUrl || !referencePreview || !referencePreviewImg) {
      clearReferencePreview();
      return;
    }
    referencePreview.classList.remove('hidden');
    referencePreviewImg.src = safeUrl;
    referencePreviewImg.alt = parentPostId ? `parentPostId: ${parentPostId}` : '参考图预览';
    referencePreviewImg.onerror = () => {
      if (!parentPostId) return;
      const api = getParentMemoryApi();
      const memoryHit = api && typeof api.getByParentPostId === 'function'
        ? api.getByParentPostId(parentPostId)
        : null;
      const candidates = [
        memoryHit && memoryHit.imageUrl,
        memoryHit && memoryHit.sourceImageUrl,
        api && typeof api.buildImaginePublicUrl === 'function'
          ? String(api.buildImaginePublicUrl(parentPostId) || '').trim()
          : `https://imagine-public.x.ai/imagine-public/images/${parentPostId}.jpg`,
      ].map((it) => String(it || '').trim()).filter(Boolean);
      for (const next of candidates) {
        if (next === safeUrl || referencePreviewImg.src === next) {
          continue;
        }
        referencePreviewImg.src = next;
        return;
      }
      referencePreviewImg.onerror = null;
    };
    if (referencePreviewMeta) {
      referencePreviewMeta.textContent = buildReferencePreviewMeta(safeUrl, parentPostId);
    }
  }

  function setStatus(state, text) {
    if (!statusText) return;
    statusText.textContent = text;
    statusText.classList.remove('connected', 'connecting', 'error');
    if (state) {
      statusText.classList.add(state);
    }
  }

  function setButtons(running) {
    if (!startBtn || !stopBtn) return;
    if (running) {
      startBtn.classList.add('hidden');
      stopBtn.classList.remove('hidden');
    } else {
      startBtn.classList.remove('hidden');
      stopBtn.classList.add('hidden');
      startBtn.disabled = false;
    }
  }

  function updateProgress(value) {
    const safe = Math.max(0, Math.min(100, Number(value) || 0));
    lastProgress = safe;
    if (progressFill) {
      progressFill.style.width = `${safe}%`;
    }
    if (progressText) {
      progressText.textContent = `${safe}%`;
    }
  }

  function updateMeta() {
    if (aspectValue && ratioSelect) {
      aspectValue.textContent = ratioSelect.value;
    }
    if (lengthValue && lengthSelect) {
      lengthValue.textContent = `${lengthSelect.value}s`;
    }
    if (resolutionValue && resolutionSelect) {
      resolutionValue.textContent = resolutionSelect.value;
    }
    if (presetValue && presetSelect) {
      presetValue.textContent = presetSelect.value;
    }
    if (countValue && concurrentSelect) {
      countValue.textContent = concurrentSelect.value;
    }
  }

  function resetOutput(keepPreview) {
    taskStates = new Map();
    activeTaskIds = [];
    hasRunError = false;
    lastProgress = 0;
    updateProgress(0);
    setIndeterminate(false);
    if (!keepPreview) {
      if (videoStage) {
        videoStage.innerHTML = '';
        videoStage.classList.add('hidden');
      }
      if (videoEmpty) {
        videoEmpty.classList.remove('hidden');
      }
      previewCount = 0;
      selectedVideoItemId = '';
      selectedVideoUrl = '';
      if (editVideo) {
        editVideo.removeAttribute('src');
        editVideo.load();
      }
      mergeTargetVideoUrl = '';
      mergeTargetVideoName = '';
      mergeCutMsA = 0;
      mergeCutMsB = 0;
      if (workVideoObjectUrl) {
        try { URL.revokeObjectURL(workVideoObjectUrl); } catch (e) { /* ignore */ }
        workVideoObjectUrl = '';
      }
      if (workVideoFileInput) {
        workVideoFileInput.value = '';
      }
      if (enterEditBtn) enterEditBtn.disabled = true;
      closeEditPanel();
      updateMergeLabels();
      updateHistoryCount();
      updateManualActionsVisibility();
    }
    if (durationValue) {
      durationValue.textContent = '耗时 -';
    }
  }

  function initPreviewSlot() {
    if (!videoStage) return;
    previewCount += 1;
    const item = document.createElement('div');
    item.className = 'video-item';
    item.dataset.index = String(previewCount);
    item.dataset.completed = '0';
    item.classList.add('is-pending');

    const header = document.createElement('div');
    header.className = 'video-item-bar';

    const title = document.createElement('div');
    title.className = 'video-item-title';
    title.textContent = `视频 ${previewCount}`;

    const actions = document.createElement('div');
    actions.className = 'video-item-actions video-item-actions-overlay';

    const openBtn = document.createElement('a');
    openBtn.className = 'geist-button-outline text-xs px-3 video-open hidden';
    openBtn.target = '_blank';
    openBtn.rel = 'noopener';
    openBtn.textContent = '打开';

    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'geist-button-outline text-xs px-3 video-download';
    downloadBtn.type = 'button';
    downloadBtn.textContent = '下载';
    downloadBtn.disabled = true;

    const editBtn = document.createElement('button');
    editBtn.className = 'geist-button-outline text-xs px-3 video-edit';
    editBtn.type = 'button';
    editBtn.textContent = '编辑';
    editBtn.disabled = true;

    const setBBtn = document.createElement('button');
    setBBtn.className = 'geist-button-outline text-xs px-3 video-set-b';
    setBBtn.type = 'button';
    setBBtn.textContent = '设为视频2';
    setBBtn.disabled = true;

    actions.appendChild(openBtn);
    actions.appendChild(downloadBtn);
    actions.appendChild(editBtn);
    actions.appendChild(setBBtn);
    header.appendChild(title);

    const body = document.createElement('div');
    body.className = 'video-item-body';
    body.innerHTML = '<div class="video-item-placeholder">生成中…</div>';
    body.appendChild(actions);

    const link = document.createElement('div');
    link.className = 'video-item-link';

    item.appendChild(header);
    item.appendChild(body);
    item.appendChild(link);
    videoStage.appendChild(item);
    videoStage.classList.remove('hidden');
    if (videoEmpty) {
      videoEmpty.classList.add('hidden');
    }
    updateHistoryCount();
    return item;
  }

  function updateItemLinks(item, url) {
    if (!item) return;
    const openBtn = item.querySelector('.video-open');
    const downloadBtn = item.querySelector('.video-download');
    const editBtn = item.querySelector('.video-edit');
    const setBBtn = item.querySelector('.video-set-b');
    const link = item.querySelector('.video-item-link');
    const safeUrl = url || '';
    item.dataset.url = safeUrl;
    item.dataset.completed = safeUrl ? '1' : '0';
    if (link) {
      link.textContent = '';
      link.classList.remove('has-url');
    }
    if (openBtn) {
      if (safeUrl) {
        openBtn.href = safeUrl;
        openBtn.classList.remove('hidden');
      } else {
        openBtn.classList.add('hidden');
        openBtn.removeAttribute('href');
      }
    }
    if (downloadBtn) {
      downloadBtn.dataset.url = safeUrl;
      downloadBtn.disabled = !safeUrl;
    }
    if (editBtn) {
      editBtn.disabled = !safeUrl;
    }
    if (setBBtn) {
      setBBtn.disabled = !safeUrl;
    }
    if (safeUrl) {
      item.classList.remove('is-pending');
    }
  }

  function setIndeterminate(active) {
    if (!progressBar) return;
    if (active) {
      progressBar.classList.add('indeterminate');
    } else {
      progressBar.classList.remove('indeterminate');
    }
  }

  function startElapsedTimer() {
    stopElapsedTimer();
    if (!durationValue) return;
    elapsedTimer = setInterval(() => {
      if (!startAt) return;
      const seconds = Math.max(0, Math.round((Date.now() - startAt) / 1000));
      durationValue.textContent = `耗时 ${seconds}s`;
    }, 1000);
  }

  function stopElapsedTimer() {
    if (elapsedTimer) {
      clearInterval(elapsedTimer);
      elapsedTimer = null;
    }
  }

  function clearFileSelection() {
    fileDataUrl = '';
    if (imageFileInput) {
      imageFileInput.value = '';
    }
    if (imageFileName) {
      imageFileName.textContent = '未选择文件';
    }
    const rawUrl = imageUrlInput ? imageUrlInput.value.trim() : '';
    if (rawUrl) {
      const resolved = resolveReferenceByText(rawUrl);
      setReferencePreview(resolved.url || resolved.sourceUrl || rawUrl, resolved.parentPostId || '');
    } else {
      clearReferencePreview();
    }
  }

  async function readFileAsDataUrl(file) {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('读取文件失败'));
      reader.readAsDataURL(file);
    });
  }

  function hasFiles(dataTransfer) {
    if (!dataTransfer) return false;
    if (dataTransfer.files && dataTransfer.files.length > 0) return true;
    const types = dataTransfer.types;
    if (!types) return false;
    return Array.from(types).includes('Files');
  }

  function pickImageFileFromDataTransfer(dataTransfer) {
    if (!dataTransfer) return null;
    if (dataTransfer.files && dataTransfer.files.length) {
      for (const file of dataTransfer.files) {
        if (file && String(file.type || '').startsWith('image/')) {
          return file;
        }
      }
    }
    if (dataTransfer.items && dataTransfer.items.length) {
      for (const item of dataTransfer.items) {
        if (!item) continue;
        if (item.kind === 'file') {
          const file = item.getAsFile ? item.getAsFile() : null;
          if (file && String(file.type || '').startsWith('image/')) {
            return file;
          }
        }
      }
    }
    return null;
  }

  function setRefDragActive(active) {
    if (!refDropZone) return;
    refDropZone.classList.toggle('dragover', Boolean(active));
  }

  async function applyReferenceImageFile(file, sourceLabel) {
    if (!file) return;
    const mimeType = String(file.type || '');
    if (mimeType && !mimeType.startsWith('image/')) {
      toast('仅支持图片文件', 'warning');
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    if (!dataUrl.startsWith('data:image/')) {
      throw new Error('图片格式不受支持');
    }
    fileDataUrl = dataUrl;
    if (imageUrlInput) {
      imageUrlInput.value = '';
    }
    if (parentPostInput) {
      parentPostInput.value = '';
    }
    if (imageFileInput) {
      imageFileInput.value = '';
    }
    if (imageFileName) {
      imageFileName.textContent = file.name || sourceLabel || '已选择图片';
    }
    setReferencePreview(fileDataUrl, '');
    if (sourceLabel) {
      toast(`${sourceLabel}已载入`, 'success');
    }
  }

  function normalizeAuthHeader(authHeader) {
    if (!authHeader) return '';
    if (authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7).trim();
    }
    return authHeader;
  }

  function getFfmpegApis() {
    const ffmpegApi = window.FFmpegWASM || {};
    const utilApi = window.FFmpegUtil || {};
    const FFmpegCtor = ffmpegApi.FFmpeg || ffmpegApi.createFFmpeg || null;
    const fetchFile = utilApi.fetchFile || null;
    return { FFmpegCtor, fetchFile };
  }

  async function fetchWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { signal: controller.signal, cache: 'force-cache' });
      if (!resp.ok) {
        throw new Error(`fetch_${resp.status}`);
      }
      return await resp.blob();
    } finally {
      clearTimeout(timer);
    }
  }

  async function toBlobUrlFromCandidates(urls, mime, timeoutMs = 12000) {
    let lastErr = null;
    for (const url of urls) {
      try {
        const blob = await fetchWithTimeout(url, timeoutMs);
        return URL.createObjectURL(new Blob([blob], { type: mime }));
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('blob_url_candidates_failed');
  }

  async function toOptionalBlobUrl(urls, mime, timeoutMs = 12000) {
    try {
      return await toBlobUrlFromCandidates(urls, mime, timeoutMs);
    } catch (e) {
      return '';
    }
  }

  async function ensureFfmpeg() {
    if (ffmpegLoaded && ffmpegInstance) return ffmpegInstance;
    if (ffmpegLoading) {
      for (let i = 0; i < 80; i++) {
        await new Promise((r) => setTimeout(r, 100));
        if (ffmpegLoaded && ffmpegInstance) return ffmpegInstance;
      }
      throw new Error('ffmpeg_load_timeout');
    }
    const { FFmpegCtor } = getFfmpegApis();
    if (!FFmpegCtor) {
      throw new Error('ffmpeg_runtime_missing');
    }
    ffmpegLoading = true;
    try {
      const candidates = {
        coreURL: [
          '/v1/public/video/vendor/ffmpeg-core.js',
        ],
        wasmURL: [
          '/v1/public/video/vendor/ffmpeg-core.wasm',
        ],
        workerURL: [
          // worker 文件在部分 ffmpeg core 版本中不存在，默认不请求以避免无效报错
        ],
      };
      // 统一转为同源 blob URL，避免跨域 Worker 限制，同时实现多源超时切换。
      const coreURL = await toBlobUrlFromCandidates(candidates.coreURL, 'text/javascript');
      const wasmURL = await toBlobUrlFromCandidates(candidates.wasmURL, 'application/wasm');
      const workerURL = await toOptionalBlobUrl(candidates.workerURL, 'text/javascript');
      if (typeof FFmpegCtor === 'function') {
        try {
          // 兼容 @ffmpeg/ffmpeg 0.12+ 的 class FFmpeg
          ffmpegInstance = new FFmpegCtor();
        } catch (e) {
          // 回退兼容 createFFmpeg 工厂模式
          ffmpegInstance = FFmpegCtor({ log: false });
        }
        if (ffmpegInstance && typeof ffmpegInstance.load === 'function') {
          const loadConfig = { coreURL, wasmURL };
          if (workerURL) {
            loadConfig.workerURL = workerURL;
          }
          await ffmpegInstance.load(loadConfig);
        }
      }
      if (!ffmpegInstance) {
        throw new Error('ffmpeg_instance_init_failed');
      }
      ffmpegLoaded = true;
      return ffmpegInstance;
    } finally {
      ffmpegLoading = false;
    }
  }

  async function resetFfmpegInstance() {
    if (!ffmpegInstance) return;
    try {
      if (typeof ffmpegInstance.terminate === 'function') {
        await ffmpegInstance.terminate();
      }
    } catch (e) {
      // ignore
    }
    ffmpegInstance = null;
    ffmpegLoaded = false;
    ffmpegLoading = false;
  }

  function ffTaskPrefix(tag) {
    return `${tag}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function isFsError(e) {
    const msg = String(e && e.message ? e.message : e);
    return msg.includes('FS error') || msg.includes('ErrnoError');
  }

  function toStableUint8(input) {
    if (input instanceof Uint8Array) {
      return new Uint8Array(input);
    }
    if (input instanceof ArrayBuffer) {
      return new Uint8Array(input.slice(0));
    }
    if (ArrayBuffer.isView(input)) {
      const view = input;
      const start = view.byteOffset || 0;
      const end = start + (view.byteLength || 0);
      return new Uint8Array(view.buffer.slice(start, end));
    }
    throw new Error('binary_input_invalid');
  }

  function toStableArrayBuffer(input) {
    return toStableUint8(input).buffer;
  }

  async function sha256Hex(bytes) {
    const stableBytes = toStableUint8(bytes);
    const hashBuffer = await crypto.subtle.digest('SHA-256', stableBytes);
    return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function fetchArrayBuffer(url) {
    const resp = await fetch(url, { mode: 'cors' });
    if (!resp.ok) {
      throw new Error(`fetch_failed_${resp.status}`);
    }
    const raw = await resp.arrayBuffer();
    return raw.slice(0);
  }

  async function ffmpegWriteFile(ff, name, data) {
    const stable = toStableUint8(data);
    if (typeof ff.writeFile === 'function') {
      return await ff.writeFile(name, stable);
    }
    if (ff.FS) {
      ff.FS('writeFile', name, stable);
      return;
    }
    throw new Error('ffmpeg_writefile_unsupported');
  }

  async function ffmpegReadFile(ff, name) {
    if (typeof ff.readFile === 'function') {
      const out = await ff.readFile(name);
      return toStableUint8(out);
    }
    if (ff.FS) {
      const out = ff.FS('readFile', name);
      return toStableUint8(out);
    }
    throw new Error('ffmpeg_readfile_unsupported');
  }

  async function ffmpegDeleteFileSafe(ff, name) {
    try {
      if (typeof ff.deleteFile === 'function') {
        await ff.deleteFile(name);
        return;
      }
      if (ff.FS) {
        ff.FS('unlink', name);
      }
    } catch (e) {
      // ignore
    }
  }

  async function ffmpegExec(ff, args) {
    if (typeof ff.exec === 'function') {
      return await ff.exec(args);
    }
    if (typeof ff.run === 'function') {
      return await ff.run(...args);
    }
    throw new Error('ffmpeg_exec_unsupported');
  }

  function buildSseUrl(taskId, rawPublicKey) {
    const httpProtocol = window.location.protocol === 'https:' ? 'https' : 'http';
    const base = `${httpProtocol}://${window.location.host}/v1/public/video/sse`;
    const params = new URLSearchParams();
    params.set('task_id', taskId);
    params.set('t', String(Date.now()));
    if (rawPublicKey) {
      params.set('public_key', rawPublicKey);
    }
    return `${base}?${params.toString()}`;
  }

  function getConcurrentValue() {
    const raw = concurrentSelect ? parseInt(concurrentSelect.value, 10) : 1;
    if (!Number.isFinite(raw)) return 1;
    return Math.max(1, Math.min(4, raw));
  }

  async function createVideoTasks(authHeader) {
    const prompt = promptInput ? promptInput.value.trim() : '';
    const rawUrl = imageUrlInput ? imageUrlInput.value.trim() : '';
    const rawParent = parentPostInput ? parentPostInput.value.trim() : '';
    if (fileDataUrl && rawUrl) {
      toast('参考图只能选择其一：URL/Base64 或 本地上传', 'error');
      throw new Error('invalid_reference');
    }
    let resolvedRef = { url: '', sourceUrl: '', parentPostId: '' };
    if (!fileDataUrl) {
      resolvedRef = resolveReferenceByText(rawParent || rawUrl);
    }
    const parentPostId = fileDataUrl ? '' : String(resolvedRef.parentPostId || '').trim();
    const imageUrl = fileDataUrl ? fileDataUrl : (parentPostId ? '' : resolvedRef.url);
    if (!fileDataUrl && resolvedRef.parentPostId) {
      if (imageUrlInput) {
        imageUrlInput.value = resolvedRef.sourceUrl || resolvedRef.url;
      }
      if (parentPostInput) {
        parentPostInput.value = resolvedRef.parentPostId;
      }
      setReferencePreview(resolvedRef.url || resolvedRef.sourceUrl, resolvedRef.parentPostId);
    }
    const res = await fetch('/v1/public/video/start', {
      method: 'POST',
      headers: {
        ...buildAuthHeaders(authHeader),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt,
        image_url: imageUrl || null,
        parent_post_id: parentPostId || null,
        source_image_url: parentPostId ? (resolvedRef.sourceUrl || null) : null,
        reasoning_effort: DEFAULT_REASONING_EFFORT,
        aspect_ratio: ratioSelect ? ratioSelect.value : '3:2',
        video_length: lengthSelect ? parseInt(lengthSelect.value, 10) : 6,
        resolution_name: resolutionSelect ? resolutionSelect.value : '480p',
        preset: presetSelect ? presetSelect.value : 'normal',
        concurrent: getConcurrentValue()
      })
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || 'Failed to create task');
    }
    const data = await res.json();
    if (data && Array.isArray(data.task_ids) && data.task_ids.length > 0) {
      return data.task_ids
        .map((id) => String(id || '').trim())
        .filter((id) => id.length > 0);
    }
    if (data && data.task_id) {
      return [String(data.task_id)];
    }
    throw new Error('empty_task_ids');
  }

  async function stopVideoTask(taskIds, authHeader) {
    const normalized = Array.isArray(taskIds)
      ? taskIds.map((id) => String(id || '').trim()).filter((id) => id.length > 0)
      : [];
    if (!normalized.length) return;
    try {
      await fetch('/v1/public/video/stop', {
        method: 'POST',
        headers: {
          ...buildAuthHeaders(authHeader),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ task_ids: normalized })
      });
    } catch (e) {
      // ignore
    }
  }

  function extractVideoInfo(buffer) {
    if (!buffer) return null;
    if (buffer.includes('<video')) {
      const matches = buffer.match(/<video[\s\S]*?<\/video>/gi);
      if (matches && matches.length) {
        return { html: matches[matches.length - 1] };
      }
    }
    const mdMatches = buffer.match(/\[video\]\(([^)]+)\)/g);
    if (mdMatches && mdMatches.length) {
      const last = mdMatches[mdMatches.length - 1];
      const urlMatch = last.match(/\[video\]\(([^)]+)\)/);
      if (urlMatch) {
        return { url: urlMatch[1] };
      }
    }
    const urlMatches = buffer.match(/https?:\/\/[^\s<)]+/g);
    if (urlMatches && urlMatches.length) {
      return { url: urlMatches[urlMatches.length - 1] };
    }
    return null;
  }

  function extractVideoUrlFromAnyText(text) {
    const raw = String(text || '');
    if (!raw) return '';
    const info = extractVideoInfo(raw);
    if (info && info.url) return info.url;
    const mp4 = raw.match(/https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/i);
    if (mp4 && mp4[0]) return mp4[0];
    const local = raw.match(/\/v1\/files\/video\/[^\s"'<>]+/i);
    if (local && local[0]) {
      if (local[0].startsWith('http')) return local[0];
      return `${window.location.origin}${local[0]}`;
    }
    return '';
  }

  function renderVideoFromHtml(taskState, html) {
    const container = taskState && taskState.previewItem;
    if (!container) return;
    const body = container.querySelector('.video-item-body');
    if (!body) return;
    const actions = body.querySelector('.video-item-actions-overlay');
    body.innerHTML = html;
    if (actions) {
      body.appendChild(actions);
    }
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
    updateItemLinks(container, videoUrl);
  }

  function renderVideoFromUrl(taskState, url) {
    const container = taskState && taskState.previewItem;
    if (!container) return;
    const safeUrl = url || '';
    const body = container.querySelector('.video-item-body');
    if (!body) return;
    const actions = body.querySelector('.video-item-actions-overlay');
    body.innerHTML = `\n      <video controls preload="metadata">\n        <source src="${safeUrl}" type="video/mp4">\n      </video>\n    `;
    if (actions) {
      body.appendChild(actions);
    }
    updateItemLinks(container, safeUrl);
  }

  function setPreviewTitle(item, text) {
    if (!item) return;
    const title = item.querySelector('.video-item-title');
    if (title) {
      title.textContent = String(text || '');
    }
  }

  function getSelectedVideoItem() {
    if (!selectedVideoItemId || !videoStage) return null;
    return videoStage.querySelector(`.video-item[data-index="${selectedVideoItemId}"]`);
  }

  function refreshVideoSelectionUi() {
    if (!videoStage) return;
    const items = videoStage.querySelectorAll('.video-item');
    items.forEach((item) => {
      const isSelected = item.dataset.index === selectedVideoItemId;
      item.classList.toggle('is-selected', isSelected);
    });
  }

  function bindEditVideoSource(url) {
    const safeUrl = String(url || '').trim();
    selectedVideoUrl = safeUrl;
    if (editHint) {
      editHint.classList.toggle('hidden', Boolean(safeUrl));
    }
    if (!editVideo) return;
    editVideo.src = safeUrl;
    editVideo.load();
    lockedFrameIndex = -1;
    lockedTimestampMs = 0;
    lastFrameHash = '';
    setEditMeta();
    updateMergeLabels();
    updateManualActionsVisibility();
    bindMergeVideoA(safeUrl);
  }

  function scrollToWorkspaceTop() {
    if (!editPanel || typeof editPanel.scrollIntoView !== 'function') return;
    editPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function bindMergeVideoA(url) {
    const safeUrl = String(url || '').trim();
    if (!mergeVideoPreviewA) return;
    mergeVideoPreviewA.src = safeUrl;
    mergeVideoPreviewA.load();
    mergeCutMsA = 0;
    if (mergeTimeTextA) mergeTimeTextA.textContent = formatMs(0);
    if (mergeTimelineA) mergeTimelineA.value = '0';
  }

  function bindMergeVideoB(url) {
    const safeUrl = String(url || '').trim();
    if (!mergeVideoPreviewB) return;
    mergeVideoPreviewB.src = safeUrl;
    mergeVideoPreviewB.load();
    mergeCutMsB = 0;
    if (mergeTimeTextB) mergeTimeTextB.textContent = formatMs(0);
    if (mergeTimelineB) mergeTimelineB.value = '0';
  }

  function openEditPanel() {
    const item = getSelectedVideoItem();
    const url = item
      ? String(item.dataset.url || '').trim()
      : String(selectedVideoUrl || '').trim();
    if (!url) {
      if (editHint) editHint.classList.remove('hidden');
      toast('请先选中一个已生成视频', 'warning');
      return;
    }
    if (editHint) editHint.classList.add('hidden');
    if (editBody) editBody.classList.remove('hidden');
    bindEditVideoSource(url);
  }

  function closeEditPanel() {
    if (editHint) editHint.classList.remove('hidden');
    if (editBody) editBody.classList.remove('hidden');
  }

  function positionCacheVideoModal() {
    if (!cacheVideoModal) return;
    const content = cacheVideoModal.querySelector('.modal-content');
    if (!(content instanceof HTMLElement)) return;
    const anchor = cacheModalAnchorEl instanceof HTMLElement ? cacheModalAnchorEl : null;
    if (!anchor) return;
    content.style.right = 'auto';
    content.style.bottom = 'auto';
    content.style.transform = 'none';
    content.style.maxWidth = 'min(560px, calc(100vw - 24px))';
    const rect = anchor.getBoundingClientRect();
    const margin = 8;
    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    const contentWidth = Math.round(content.getBoundingClientRect().width || Math.min(560, Math.max(280, vw - 24)));
    const contentHeight = Math.round(content.getBoundingClientRect().height || 420);
    let left = rect.left;
    if (left + contentWidth > vw - 12) {
      left = vw - 12 - contentWidth;
    }
    if (left < 12) left = 12;
    let top = rect.bottom + margin;
    if (top + contentHeight > vh - 12) {
      top = rect.top - margin - contentHeight;
    }
    if (top < 12) {
      top = 12;
    }
    content.style.left = `${Math.round(left)}px`;
    content.style.top = `${Math.round(top)}px`;
  }

  function ensureCacheModalInBody() {
    if (!cacheVideoModal) return;
    if (cacheVideoModal.parentElement !== document.body) {
      document.body.appendChild(cacheVideoModal);
    }
  }

  function openCacheVideoModal(anchorEl) {
    if (!cacheVideoModal) return;
    ensureCacheModalInBody();
    cacheModalAnchorEl = anchorEl instanceof HTMLElement ? anchorEl : null;
    cacheVideoModal.classList.remove('hidden');
    cacheVideoModal.classList.add('is-open');
    positionCacheVideoModal();
    requestAnimationFrame(() => positionCacheVideoModal());
    setTimeout(() => positionCacheVideoModal(), 0);
  }

  function closeCacheVideoModal() {
    if (!cacheVideoModal) return;
    cacheVideoModal.classList.remove('is-open');
    cacheVideoModal.classList.add('hidden');
    cacheModalAnchorEl = null;
  }

  function formatBytes(bytes) {
    const n = Number(bytes || 0);
    if (n <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const idx = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
    const val = n / Math.pow(1024, idx);
    return `${val.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
  }

  function formatMtime(ms) {
    const d = new Date(Number(ms || 0));
    if (!Number.isFinite(d.getTime())) return '-';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${hh}:${mm}`;
  }

  function normalizeVideoUrlForCompare(url) {
    const raw = String(url || '').trim();
    if (!raw) return '';
    return raw.replace(/\/+$/, '');
  }

  function normalizePlayableVideoUrl(url) {
    let raw = String(url || '').trim();
    if (!raw) return '';
    raw = raw.replace(/[)\]>.,;]+$/g, '');
    raw = raw.replace(/(\.mp4)\/+$/i, '$1');
    return raw;
  }

  async function loadCachedVideos() {
    const authHeader = await ensurePublicKey();
    if (authHeader === null) {
      toast('请先配置 Public Key', 'error');
      window.location.href = '/login';
      return [];
    }
    const res = await fetch('/v1/public/video/cache/list?page=1&page_size=100', {
      headers: buildAuthHeaders(authHeader),
    });
    if (!res.ok) {
      throw new Error(`load_cache_failed_${res.status}`);
    }
    const data = await res.json();
    return Array.isArray(data.items) ? data.items : [];
  }

  function renderCachedVideoList(items) {
    if (!cacheVideoList) return;
    if (!items.length) {
      cacheVideoList.innerHTML = '<div class="video-empty">暂无缓存视频</div>';
      return;
    }
    const html = items.map((item, idx) => {
      const name = String(item.name || '');
      const url = String(item.view_url || '');
      const size = formatBytes(item.size_bytes);
      const mtime = formatMtime(item.mtime_ms);
      return `<div class="cache-video-item" data-url="${url}" data-name="${name}">
        <div class="cache-video-thumb-wrap">
          <video class="cache-video-thumb" src="${url}" preload="auto" muted playsinline></video>
        </div>
        <div class="cache-video-meta">
          <div class="cache-video-name">${name || `video_${idx + 1}.mp4`}</div>
          <div class="cache-video-sub">${size} · ${mtime}</div>
        </div>
        <button class="geist-button-outline text-xs px-3 cache-video-use" type="button">使用</button>
      </div>`;
    }).join('');
    cacheVideoList.innerHTML = html;
    const thumbs = cacheVideoList.querySelectorAll('.cache-video-thumb');
    thumbs.forEach((el) => {
      el.addEventListener('loadeddata', () => {
        try {
          el.currentTime = 0;
          el.pause();
        } catch (e) {
          // ignore
        }
      }, { once: true });
    });
    const activeUrlRaw = cacheModalPickMode === 'merge_target'
      ? mergeTargetVideoUrl
      : selectedVideoUrl;
    const activeUrl = normalizeVideoUrlForCompare(activeUrlRaw);
    if (!activeUrl) return;
    const rows = cacheVideoList.querySelectorAll('.cache-video-item');
    let activeRow = null;
    rows.forEach((row) => {
      const rowUrl = normalizeVideoUrlForCompare(row.getAttribute('data-url') || '');
      const isActive = rowUrl && rowUrl === activeUrl;
      row.classList.toggle('is-active', isActive);
      if (isActive) activeRow = row;
    });
    if (activeRow && typeof activeRow.scrollIntoView === 'function') {
      activeRow.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  function useCachedVideo(url, name) {
    const safeUrl = String(url || '').trim();
    if (!safeUrl) return;
    if (cacheModalPickMode === 'merge_target') {
      mergeTargetVideoUrl = safeUrl;
      mergeTargetVideoName = String(name || '').trim();
      updateMergeLabels();
      bindMergeVideoB(safeUrl);
      closeCacheVideoModal();
      toast('已选择视频2', 'success');
      return;
    }
    selectedVideoItemId = `cache-${Date.now()}`;
    selectedVideoUrl = safeUrl;
    if (imageUrlInput) imageUrlInput.value = safeUrl;
    if (imageFileName && name) imageFileName.textContent = name;
    if (enterEditBtn) enterEditBtn.disabled = false;
    closeCacheVideoModal();
    openEditPanel();
  }

  function updateTimelineByVideoTime() {
    if (!editVideo || !editTimeline) return;
    const duration = Number(editVideo.duration || 0);
    if (!duration || !Number.isFinite(duration)) return;
    const current = Number(editVideo.currentTime || 0);
    const ratio = Math.max(0, Math.min(1, current / duration));
    editTimeline.value = String(Math.round(ratio * EDIT_TIMELINE_MAX));
    lockedTimestampMs = clampEditTimestampMs(Math.round(current * 1000));
    if (editTimeText) editTimeText.textContent = formatMs(lockedTimestampMs);
  }

  function lockFrameByCurrentTime() {
    if (!editVideo) return;
    const currentTime = Number(editVideo.currentTime || 0);
    lockedTimestampMs = clampEditTimestampMs(Math.round(currentTime * 1000));
    const approxFps = 30;
    lockedFrameIndex = Math.max(0, Math.round(currentTime * approxFps));
    setEditMeta();
  }

  function updateAggregateProgress() {
    if (!taskStates.size) {
      updateProgress(0);
      return;
    }
    let total = 0;
    taskStates.forEach((state) => {
      total += state.done ? 100 : (state.progress || 0);
    });
    updateProgress(Math.round(total / taskStates.size));
  }

  function handleDelta(taskState, text) {
    if (!taskState) return;
    if (!text) return;
    if (text.includes('<think>') || text.includes('</think>')) {
      return;
    }
    if (text.includes('超分辨率')) {
      setStatus('connecting', '超分辨率中');
      setIndeterminate(true);
      if (progressText) {
        progressText.textContent = '超分辨率中';
      }
      return;
    }

    if (!taskState.collectingContent) {
      const maybeVideo = text.includes('<video') || text.includes('[video](') || text.includes('http://') || text.includes('https://');
      if (maybeVideo) {
        taskState.collectingContent = true;
      }
    }

    if (taskState.collectingContent) {
      taskState.contentBuffer += text;
      const info = extractVideoInfo(taskState.contentBuffer);
      if (info) {
        if (info.html) {
          renderVideoFromHtml(taskState, info.html);
        } else if (info.url) {
          renderVideoFromUrl(taskState, info.url);
        }
      }
      return;
    }

    taskState.progressBuffer += text;
    const matches = [...taskState.progressBuffer.matchAll(/进度\s*(\d+)%/g)];
    if (matches.length) {
      const last = matches[matches.length - 1];
      const value = parseInt(last[1], 10);
      setIndeterminate(false);
      taskState.progress = value;
      updateAggregateProgress();
      taskState.progressBuffer = taskState.progressBuffer.slice(
        Math.max(0, taskState.progressBuffer.length - 200)
      );
    }
  }

  function closeAllSources() {
    taskStates.forEach((taskState) => {
      if (!taskState || !taskState.source) {
        return;
      }
      try {
        taskState.source.close();
      } catch (e) {
        // ignore
      }
      taskState.source = null;
    });
  }

  function markTaskFinished(taskId, hasError) {
    const taskState = taskStates.get(taskId);
    if (!taskState || taskState.done) {
      return;
    }
    const previewItem = taskState.previewItem || null;
    const hasVideoUrl = Boolean(previewItem && String(previewItem.dataset.url || '').trim());
    taskState.done = true;
    if (!hasError && hasVideoUrl) {
      taskState.progress = 100;
    } else {
      hasRunError = true;
      if (previewItem) {
        removePreviewItem(previewItem);
      }
    }
    if (taskState.source) {
      try {
        taskState.source.close();
      } catch (e) {
        // ignore
      }
      taskState.source = null;
    }
    updateAggregateProgress();

    const allDone = Array.from(taskStates.values()).every((state) => state.done);
    if (allDone) {
      finishRun(hasRunError);
    }
  }

  async function startConnection() {
    const prompt = promptInput ? promptInput.value.trim() : '';
    if (!prompt) {
      toast('请输入提示词', 'error');
      return;
    }

    if (isRunning) {
      toast('已在生成中', 'warning');
      return;
    }

    const authHeader = await ensurePublicKey();
    if (authHeader === null) {
      toast('请先配置 Public Key', 'error');
      window.location.href = '/login';
      return;
    }

    isRunning = true;
    startBtn.disabled = true;
    updateMeta();
    resetOutput(true);
    setStatus('connecting', '连接中');

    let taskIds = [];
    try {
      taskIds = await createVideoTasks(authHeader);
    } catch (e) {
      setStatus('error', '创建任务失败');
      startBtn.disabled = false;
      isRunning = false;
      return;
    }

    if (!taskIds.length) {
      setStatus('error', '创建任务失败');
      startBtn.disabled = false;
      isRunning = false;
      return;
    }

    taskStates = new Map();
    previewCount = videoStage ? videoStage.querySelectorAll('.video-item').length : 0;
    for (const taskId of taskIds) {
      const previewItem = initPreviewSlot();
      setPreviewTitle(previewItem, buildHistoryTitle('generated', previewItem && previewItem.dataset ? previewItem.dataset.index : previewCount));
      taskStates.set(taskId, {
        taskId,
        source: null,
        previewItem,
        progressBuffer: '',
        contentBuffer: '',
        collectingContent: false,
        progress: 0,
        done: false
      });
    }
    activeTaskIds = taskIds.slice();
    hasRunError = false;

    startAt = Date.now();
    setStatus('connected', `生成中 (${taskIds.length} 路)`);
    setButtons(true);
    setIndeterminate(true);
    updateAggregateProgress();
    startElapsedTimer();

    const rawPublicKey = normalizeAuthHeader(authHeader);
    taskIds.forEach((taskId, index) => {
      const url = buildSseUrl(taskId, rawPublicKey);
      const es = new EventSource(url);
      const taskState = taskStates.get(taskId);
      if (!taskState) {
        try {
          es.close();
        } catch (e) {
          // ignore
        }
        return;
      }
      taskState.source = es;

      es.onopen = () => {
        setStatus('connected', `生成中 (${taskIds.length} 路)`);
      };

      es.onmessage = (event) => {
        if (!event || !event.data) return;
        if (event.data === '[DONE]') {
          markTaskFinished(taskId, false);
          return;
        }
        let payload = null;
        try {
          payload = JSON.parse(event.data);
        } catch (e) {
          return;
        }
        if (payload && payload.error) {
          toast(`任务 ${index + 1}: ${payload.error}`, 'error');
          setStatus('error', '部分任务失败');
          markTaskFinished(taskId, true);
          return;
        }
        const choice = payload.choices && payload.choices[0];
        const delta = choice && choice.delta ? choice.delta : null;
        if (delta && delta.content) {
          handleDelta(taskState, delta.content);
        }
        if (choice && choice.finish_reason === 'stop') {
          markTaskFinished(taskId, false);
        }
      };

      es.onerror = () => {
        if (!isRunning) return;
        setStatus('error', '部分任务连接异常');
        markTaskFinished(taskId, true);
      };
    });
  }

  async function stopConnection() {
    const authHeader = await ensurePublicKey();
    if (authHeader !== null) {
      await stopVideoTask(activeTaskIds, authHeader);
    }
    taskStates.forEach((taskState) => {
      if (!taskState || taskState.done) return;
      if (taskState.previewItem) {
        removePreviewItem(taskState.previewItem);
      }
    });
    closeAllSources();
    isRunning = false;
    taskStates = new Map();
    activeTaskIds = [];
    hasRunError = false;
    stopElapsedTimer();
    setIndeterminate(false);
    setButtons(false);
    setStatus('', '未连接');
  }

  async function createEditVideoTasks(authHeader, frameDataUrl, editPrompt, editCtx) {
    const concurrent = getConcurrentValue();
    const res = await fetch('/v1/public/video/start', {
      method: 'POST',
      headers: {
        ...buildAuthHeaders(authHeader),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: editPrompt,
        image_url: frameDataUrl,
        parent_post_id: null,
        source_image_url: null,
        reasoning_effort: DEFAULT_REASONING_EFFORT,
        aspect_ratio: ratioSelect ? ratioSelect.value : '3:2',
        video_length: lengthSelect ? parseInt(lengthSelect.value, 10) : 6,
        resolution_name: resolutionSelect ? resolutionSelect.value : '480p',
        preset: presetSelect ? presetSelect.value : 'custom',
        concurrent,
        n: concurrent,
        edit_context: editCtx
      })
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || 'create_edit_task_failed');
    }
    const data = await res.json();
    if (data && Array.isArray(data.task_ids) && data.task_ids.length > 0) {
      return data.task_ids
        .map((v) => String(v || '').trim())
        .filter(Boolean);
    }
    const taskId = String((data && data.task_id) || '').trim();
    if (taskId) return [taskId];
    throw new Error('edit_task_id_missing');
  }

  async function waitEditVideoResult(taskId, rawPublicKey, spliceRun) {
    return await new Promise((resolve, reject) => {
      if (spliceRun && spliceRun.cancelled) {
        reject(new Error('edit_cancelled'));
        return;
      }
      if (spliceRun && spliceRun.pendingRejects) {
        spliceRun.pendingRejects.add(reject);
      }
      const url = buildSseUrl(taskId, rawPublicKey);
      const es = new EventSource(url);
      let buffer = '';
      let rawEventBuffer = '';
      let done = false;
      if (spliceRun && spliceRun.sources) {
        spliceRun.sources.add(es);
      }

      const closeSafe = () => {
        try { es.close(); } catch (e) { /* ignore */ }
        if (spliceRun && spliceRun.sources) {
          spliceRun.sources.delete(es);
        }
        if (spliceRun && spliceRun.pendingRejects) {
          spliceRun.pendingRejects.delete(reject);
        }
      };

      es.onmessage = (event) => {
        if (spliceRun && spliceRun.cancelled) {
          if (!done) {
            done = true;
            closeSafe();
            reject(new Error('edit_cancelled'));
          }
          return;
        }
        if (!event || !event.data) return;
        rawEventBuffer += String(event.data);
        if (event.data === '[DONE]') {
          if (done) return;
          const info = extractVideoInfo(buffer);
          const anyUrl = extractVideoUrlFromAnyText(`${buffer}\n${rawEventBuffer}`);
          closeSafe();
          if ((info && info.url) || anyUrl) {
            done = true;
            resolve(normalizePlayableVideoUrl((info && info.url) || anyUrl));
            return;
          }
          done = true;
          reject(new Error('edit_video_url_missing'));
          return;
        }
        let payload = null;
        try {
          payload = JSON.parse(event.data);
        } catch (e) {
          return;
        }
        if (payload && payload.error) {
          closeSafe();
          done = true;
          reject(new Error(String(payload.error || 'edit_video_failed')));
          return;
        }
        const choice = payload.choices && payload.choices[0];
        const delta = choice && choice.delta ? choice.delta : null;
        if (delta && delta.content) {
          buffer += String(delta.content);
          const info = extractVideoInfo(buffer);
          const payloadUrl = extractVideoUrlFromAnyText(JSON.stringify(payload));
          if ((info && info.url) || payloadUrl) {
            closeSafe();
            done = true;
            resolve(normalizePlayableVideoUrl((info && info.url) || payloadUrl));
          }
        }
      };
      es.onerror = () => {
        if (done) return;
        closeSafe();
        done = true;
        if (spliceRun && spliceRun.cancelled) {
          reject(new Error('edit_cancelled'));
          return;
        }
        reject(new Error('edit_sse_error'));
      };
    });
  }

  async function requestCancelSplice() {
    const run = activeSpliceRun;
    if (!run || run.done) return;
    if (run.cancelling) return;
    run.cancelled = true;
    run.cancelling = true;
    setStatus('connecting', '正在中止拼接...');
    setSpliceButtonState('stopping');
    if (run.sources && run.sources.size) {
      run.sources.forEach((es) => {
        try { es.close(); } catch (e) { /* ignore */ }
      });
      run.sources.clear();
    }
    if (run.pendingRejects && run.pendingRejects.size) {
      run.pendingRejects.forEach((rejectFn) => {
        try { rejectFn(new Error('edit_cancelled')); } catch (e) { /* ignore */ }
      });
      run.pendingRejects.clear();
    }
    if (run.taskIds && run.taskIds.length) {
      try {
        await stopVideoTask(run.taskIds, run.authHeader);
      } catch (e) {
        // ignore
      }
    }
    if (run.placeholders) {
      run.placeholders.forEach((item) => {
        if (!item) return;
        const completed = String(item.dataset.completed || '0') === '1';
        if (!completed) {
          removePreviewItem(item);
        }
      });
    }
    run.cancelling = false;
    toast('已中止拼接任务', 'warning');
  }

  async function extractFrameAtCurrentPoint(videoUrl) {
    const srcBuffer = await fetchArrayBuffer(videoUrl);

    const runOnce = async () => {
      await resetFfmpegInstance();
      const ff = await ensureFfmpeg();
      const prefix = ffTaskPrefix('edit');
      const inputName = `${prefix}_input.mp4`;
      const frameName = `${prefix}_frame.png`;
      try {
        await ffmpegWriteFile(ff, inputName, srcBuffer);
        const baseMs = clampEditTimestampMs(lockedTimestampMs);
        const candidates = [baseMs, baseMs - 34, baseMs - 68, baseMs - 102]
          .map((v) => Math.max(0, Math.round(v)));
        let frameBytes = null;
        for (const ms of candidates) {
          const seconds = (ms / 1000).toFixed(3);
          try {
            await ffmpegExec(ff, ['-y', '-ss', seconds, '-i', inputName, '-frames:v', '1', frameName]);
            frameBytes = await ffmpegReadFile(ff, frameName);
            lockedTimestampMs = ms;
            break;
          } catch (e) {
            await ffmpegDeleteFileSafe(ff, frameName);
          }
        }
        if (!frameBytes) {
          throw new Error('extract_frame_failed_near_tail');
        }
        const frameHash = await sha256Hex(frameBytes);
        const sourceHash = await sha256Hex(srcBuffer);
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < frameBytes.length; i += chunk) {
          binary += String.fromCharCode(...frameBytes.subarray(i, i + chunk));
        }
        const dataUrl = `data:image/png;base64,${btoa(binary)}`;
        lastFrameHash = frameHash;
        setEditMeta();
        return {
          dataUrl,
          frameHash,
          sourceHash,
          sourceBuffer: toStableArrayBuffer(srcBuffer),
        };
      } finally {
        await ffmpegDeleteFileSafe(ff, inputName);
        await ffmpegDeleteFileSafe(ff, frameName);
      }
    };

    try {
      return await runOnce();
    } catch (e) {
      if (isFsError(e)) {
        return await runOnce();
      }
      throw e;
    }
  }

  async function concatVideosLocal(sourceBuffer, generatedVideoUrl) {
    const safeGeneratedUrl = normalizePlayableVideoUrl(generatedVideoUrl);
    const generatedBuffer = await fetchArrayBuffer(safeGeneratedUrl);
    const sourceStable = toStableArrayBuffer(sourceBuffer);

    const runOnce = async () => {
      const ff = await ensureFfmpeg();
      const prefix = ffTaskPrefix('concat');
      const segASource = `${prefix}_a_source.mp4`;
      const segBSource = `${prefix}_b_source.mp4`;
      const mergedVideoFile = `${prefix}_merged_video.mp4`;
      const mergedFile = `${prefix}_merged.mp4`;
      try {
        const trimSeconds = (Math.max(0, lockedTimestampMs) / 1000).toFixed(3);
        if (Number(trimSeconds) <= 0) {
          return new Blob([toStableUint8(generatedBuffer)], { type: 'video/mp4' });
        }
        await ffmpegWriteFile(ff, segASource, sourceStable);
        await ffmpegWriteFile(ff, segBSource, generatedBuffer);
        try {
          await ffmpegExec(
            ff,
            [
              '-y',
              '-i', segASource,
              '-i', segBSource,
              '-filter_complex',
              `[0:v]trim=end=${trimSeconds},setpts=PTS-STARTPTS[v0];[1:v]setpts=PTS-STARTPTS[v1];[v0][v1]concat=n=2:v=1:a=0[v];[0:a]atrim=end=${trimSeconds},asetpts=PTS-STARTPTS[a0]`,
              '-map', '[v]',
              '-c:v', 'libx264',
              '-preset', 'ultrafast',
              '-pix_fmt', 'yuv420p',
              '-r', '30',
              mergedVideoFile
            ]
          );
        } catch (videoFallbackErr) {
          await ffmpegExec(
            ff,
            [
              '-y',
              '-i', segASource,
              '-i', segBSource,
              '-filter_complex',
              `[0:v]trim=end=${trimSeconds},setpts=PTS-STARTPTS[v0];[1:v]setpts=PTS-STARTPTS[v1];[v0][v1]concat=n=2:v=1:a=0[v]`,
              '-map', '[v]',
              '-c:v', 'libx264',
              '-preset', 'ultrafast',
              '-pix_fmt', 'yuv420p',
              '-r', '30',
              mergedVideoFile
            ]
          );
        }
        try {
          await ffmpegExec(
            ff,
            [
              '-y',
              '-i', mergedVideoFile,
              '-t', trimSeconds,
              '-i', segASource,
              '-map', '0:v',
              '-map', '1:a?',
              '-c:v', 'copy',
              '-c:a', 'aac',
              '-ar', '48000',
              '-ac', '2',
              '-shortest',
              mergedFile
            ]
          );
        } catch (audioMuxErr) {
          const mergedOnly = await ffmpegReadFile(ff, mergedVideoFile);
          return new Blob([toStableUint8(mergedOnly)], { type: 'video/mp4' });
        }
        const merged = await ffmpegReadFile(ff, mergedFile);
        return new Blob([toStableUint8(merged)], { type: 'video/mp4' });
      } finally {
        await ffmpegDeleteFileSafe(ff, segASource);
        await ffmpegDeleteFileSafe(ff, segBSource);
        await ffmpegDeleteFileSafe(ff, mergedVideoFile);
        await ffmpegDeleteFileSafe(ff, mergedFile);
      }
    };

    let lastErr = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await resetFfmpegInstance();
        return await runOnce();
      } catch (e) {
        lastErr = e;
        const msg = String(e && e.message ? e.message : e);
        if (msg === 'edit_cancelled') {
          throw e;
        }
      } finally {
        await resetFfmpegInstance();
      }
    }
    throw lastErr || new Error('concat_failed');
  }

  async function concatTwoVideosManual(videoAUrl, videoBUrl, cutAMs, cutBMs) {
    const bufferA = await fetchArrayBuffer(videoAUrl);
    const bufferB = await fetchArrayBuffer(videoBUrl);
    const cutA = (Math.max(0, Number(cutAMs) || 0) / 1000).toFixed(3);
    const cutB = (Math.max(0, Number(cutBMs) || 0) / 1000).toFixed(3);

    const runOnce = async () => {
      await resetFfmpegInstance();
      const ff = await ensureFfmpeg();
      const prefix = ffTaskPrefix('manual_merge');
      const srcA = `${prefix}_a_source.mp4`;
      const srcB = `${prefix}_b_source.mp4`;
      const segA = `${prefix}_a.mp4`;
      const segB = `${prefix}_b.mp4`;
      const segANorm = `${prefix}_a_norm.mp4`;
      const segBNorm = `${prefix}_b_norm.mp4`;
      const list = `${prefix}_list.txt`;
      const out = `${prefix}_out.mp4`;
      const files = [srcA, srcB, segA, segB, segANorm, segBNorm, list, out];
      try {
        await ffmpegWriteFile(ff, srcA, bufferA);
        await ffmpegWriteFile(ff, srcB, bufferB);

        let hasA = false;
        let hasB = false;
        if (Number(cutA) > 0) {
          await ffmpegExec(ff, ['-y', '-i', srcA, '-t', cutA, '-c', 'copy', segA]);
          hasA = true;
        }
        await ffmpegExec(ff, ['-y', '-ss', cutB, '-i', srcB, '-c', 'copy', segB]);
        hasB = true;

        const parts = [];
        if (hasA) parts.push(segA);
        if (hasB) parts.push(segB);
        if (!parts.length) {
          throw new Error('manual_merge_empty_output');
        }

        await ffmpegWriteFile(
          ff,
          list,
          new TextEncoder().encode(parts.map((p) => `file '${p}'`).join('\n') + '\n')
        );
        try {
          await ffmpegExec(ff, ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out]);
        } catch (copyErr) {
          if (hasA) {
            await ffmpegExec(
              ff,
              ['-y', '-i', srcA, '-t', cutA, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000', '-ac', '2', segANorm]
            );
          }
          await ffmpegExec(
            ff,
            ['-y', '-ss', cutB, '-i', srcB, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000', '-ac', '2', segBNorm]
          );
          const normParts = [];
          if (hasA) normParts.push(segANorm);
          normParts.push(segBNorm);
          await ffmpegWriteFile(
            ff,
            list,
            new TextEncoder().encode(normParts.map((p) => `file '${p}'`).join('\n') + '\n')
          );
          await ffmpegExec(
            ff,
            ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000', '-ac', '2', out]
          );
        }
        const merged = await ffmpegReadFile(ff, out);
        return new Blob([toStableUint8(merged)], { type: 'video/mp4' });
      } finally {
        for (const f of files) {
          await ffmpegDeleteFileSafe(ff, f);
        }
      }
    };

    try {
      return await runOnce();
    } catch (e) {
      if (isFsError(e)) {
        return await runOnce();
      }
      throw e;
    }
  }

  async function directMergeTwoVideos() {
    const sourceA = String(selectedVideoUrl || '').trim();
    const sourceB = String(mergeTargetVideoUrl || '').trim();
    if (!sourceA) {
      toast('请先选中视频1', 'warning');
      return;
    }
    if (!sourceB) {
      toast('请先选择视频2', 'warning');
      return;
    }
    if (sourceA === sourceB) {
      toast('视频1和视频2不能相同', 'warning');
      return;
    }
    if (editingBusy) {
      toast('拼接任务进行中', 'warning');
      return;
    }
    editingBusy = true;
    setEditTimelineLock(true);
    if (directMergeBtn) directMergeBtn.disabled = true;
    setStatus('connecting', '手动两段拼接处理中');
    try {
      const mergedBlob = await concatTwoVideosManual(sourceA, sourceB, mergeCutMsA, mergeCutMsB);
      const mergedUrl = URL.createObjectURL(mergedBlob);
      const item = initPreviewSlot() || null;
      if (item) {
        selectedVideoItemId = String(item.dataset.index || '');
        item.dataset.url = mergedUrl;
        setPreviewTitle(item, buildHistoryTitle('splice', item.dataset.index || previewCount));
        renderVideoFromUrl({ previewItem: item }, mergedUrl);
        refreshVideoSelectionUi();
      }
      bindEditVideoSource(mergedUrl);
      scrollToWorkspaceTop();
      setStatus('connected', '手动拼接完成');
      toast('手动拼接完成', 'success');
    } catch (e) {
      setStatus('error', '手动拼接失败');
      toast(`手动拼接失败: ${String(e && e.message ? e.message : e)}`, 'error');
    } finally {
      editingBusy = false;
      setEditTimelineLock(false);
      if (directMergeBtn) directMergeBtn.disabled = false;
    }
  }

  async function runSplice() {
    if (editingBusy) {
      toast('拼接任务进行中', 'warning');
      return;
    }
    if (!selectedVideoUrl) {
      toast('请先选中视频并进入编辑模式', 'error');
      return;
    }
    const authHeader = await ensurePublicKey();
    if (authHeader === null) {
      toast('请先配置 Public Key', 'error');
      window.location.href = '/login';
      return;
    }
    const prompt = String(editPromptInput ? editPromptInput.value : '').trim();
    if (!prompt) {
      toast('请输入拼接提示词', 'warning');
      return;
    }
    if (!('crypto' in window) || !crypto.subtle) {
      toast('当前浏览器不支持拼接所需的加密能力', 'error');
      return;
    }
    editingBusy = true;
    setEditTimelineLock(true);
    const spliceRun = {
      cancelled: false,
      cancelling: false,
      done: false,
      authHeader,
      taskIds: [],
      placeholders: new Map(),
      failedPlaceholders: new Set(),
      failedReasons: [],
      sources: new Set(),
      pendingRejects: new Set(),
    };
    activeSpliceRun = spliceRun;
    setSpliceButtonState('running');
    setStatus('connecting', '截帧与拼接处理中');
    try {
      const sourceVideoUrl = String(selectedVideoUrl || '').trim();
      const nextRound = editingRound + 1;
      const frameInfo = await extractFrameAtCurrentPoint(sourceVideoUrl);
      const editCtx = {
        source_video_url: sourceVideoUrl,
        source_video_sha256: frameInfo.sourceHash,
        splice_at_ms: Math.round(lockedTimestampMs),
        frame_index: Math.max(0, lockedFrameIndex),
        frame_hash_sha256: frameInfo.frameHash,
        edit_session_id: selectedVideoItemId || 'video-edit',
        round: nextRound
      };
      const taskIds = await createEditVideoTasks(authHeader, frameInfo.dataUrl, prompt, editCtx);
      spliceRun.taskIds = taskIds.slice();
      const rawPublicKey = normalizeAuthHeader(authHeader);
      setStatus('connecting', `拼接生成中 (${taskIds.length} 路)`);
      for (const taskId of taskIds) {
        const item = initPreviewSlot() || null;
        if (!item) continue;
        spliceRun.placeholders.set(taskId, item);
        setPreviewTitle(item, buildHistoryTitle('splice', item.dataset.index || previewCount));
      }

      let successCount = 0;
      let lastMergedUrl = '';
      let processChain = Promise.resolve();
      const waitTasks = taskIds.map((taskId) =>
        waitEditVideoResult(taskId, rawPublicKey, spliceRun)
          .then((generatedVideoUrl) => {
            processChain = processChain.then(async () => {
              if (spliceRun.cancelled) return;
              const item = spliceRun.placeholders.get(taskId) || null;
              try {
                const mergedBlob = await concatVideosLocal(frameInfo.sourceBuffer, generatedVideoUrl);
                if (spliceRun.cancelled) {
                  throw new Error('edit_cancelled');
                }
                const mergedUrl = URL.createObjectURL(mergedBlob);
                if (item) {
                  selectedVideoItemId = String(item.dataset.index || '');
                  item.dataset.url = mergedUrl;
                  item.dataset.completed = '1';
                  item.dataset.round = String(nextRound);
                  setPreviewTitle(item, buildHistoryTitle('splice', item.dataset.index || previewCount));
                  const state = { previewItem: item };
                  renderVideoFromUrl(state, mergedUrl);
                  refreshVideoSelectionUi();
                }
                lastMergedUrl = mergedUrl;
                successCount += 1;
              } catch (singleErr) {
                if (item) {
                  spliceRun.failedPlaceholders.add(item);
                }
                spliceRun.failedReasons.push(String(singleErr && singleErr.message ? singleErr.message : singleErr));
                if (String(singleErr && singleErr.message || '') === 'edit_cancelled') {
                  return;
                }
              }
            });
          })
          .catch((err) => {
            if (String(err && err.message || '') === 'edit_cancelled') {
              return;
            }
            spliceRun.failedReasons.push(String(err && err.message ? err.message : err));
            const missItem = spliceRun.placeholders.get(taskId) || null;
            if (missItem) spliceRun.failedPlaceholders.add(missItem);
          })
      );
      await Promise.allSettled(waitTasks);
      await processChain;
      if (spliceRun.failedPlaceholders && spliceRun.failedPlaceholders.size) {
        spliceRun.failedPlaceholders.forEach((item) => {
          if (!item) return;
          const completed = String(item.dataset.completed || '0') === '1';
          if (!completed) {
            removePreviewItem(item);
          }
        });
        spliceRun.failedPlaceholders.clear();
      }

      if (spliceRun.cancelled) {
        throw new Error('edit_cancelled');
      }
      if (!successCount || !lastMergedUrl) {
        const firstReason = String((spliceRun.failedReasons && spliceRun.failedReasons[0]) || '').trim();
        throw new Error(firstReason || 'edit_all_failed');
      }
      bindEditVideoSource(lastMergedUrl);
      scrollToWorkspaceTop();
      editingRound = nextRound;
      setStatus('connected', `拼接完成（成功 ${successCount}/${taskIds.length}）`);
      toast(`拼接完成，成功 ${successCount}/${taskIds.length}`, 'success');
    } catch (e) {
      const msg = String(e && e.message ? e.message : e);
      if (msg === 'edit_cancelled') {
        setStatus('', '未连接');
      } else {
        setStatus('error', '拼接失败');
        if (msg === 'extract_frame_failed_near_tail') {
          toast('拼接失败: 当前帧过于接近结尾，请前移 2-3 帧再试', 'error');
        } else if (msg === 'edit_video_url_missing') {
          toast('拼接失败: 生成结果未返回视频地址', 'error');
        } else {
          toast(`拼接失败: ${msg}`, 'error');
        }
      }
    } finally {
      spliceRun.done = true;
      if (activeSpliceRun === spliceRun) {
        activeSpliceRun = null;
      }
      editingBusy = false;
      setEditTimelineLock(false);
      setSpliceButtonState('idle');
    }
  }

  function finishRun(hasError) {
    if (!isRunning) return;
    closeAllSources();
    isRunning = false;
    activeTaskIds = [];
    setButtons(false);
    stopElapsedTimer();
    if (!hasError) {
      setStatus('connected', '完成');
      setIndeterminate(false);
      updateProgress(100);
    } else {
      setStatus('error', '部分任务失败');
      setIndeterminate(false);
    }
    if (durationValue && startAt) {
      const seconds = Math.max(0, Math.round((Date.now() - startAt) / 1000));
      durationValue.textContent = `耗时 ${seconds}s`;
    }
  }

  if (startBtn) {
    startBtn.addEventListener('click', () => startConnection());
  }

  if (stopBtn) {
    stopBtn.addEventListener('click', () => stopConnection());
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (isRunning) {
        toast('生成进行中，停止后再清空', 'warning');
        return;
      }
      resetOutput();
    });
  }

  if (enterEditBtn) {
    enterEditBtn.disabled = true;
    enterEditBtn.addEventListener('click', () => {
      openEditPanel();
    });
  }

  if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', () => {
      closeEditPanel();
    });
  }

  if (editTimeline) {
    editTimeline.addEventListener('input', () => {
      if (!editVideo) return;
      const duration = Number(editVideo.duration || 0);
      if (!Number.isFinite(duration) || duration <= 0) return;
      const ratio = Number(editTimeline.value || 0) / EDIT_TIMELINE_MAX;
      const nextTime = Math.max(0, Math.min(duration, duration * ratio));
      editVideo.currentTime = nextTime;
      lockedTimestampMs = clampEditTimestampMs(Math.round(nextTime * 1000));
      if (editTimeText) editTimeText.textContent = formatMs(lockedTimestampMs);
      lockFrameByCurrentTime();
    });
  }

  if (editVideo) {
    editVideo.addEventListener('loadedmetadata', () => {
      const duration = Number(editVideo.duration || 0);
      if (editDurationText) {
        editDurationText.textContent = duration > 0
          ? `总时长 ${formatMs(duration * 1000)}`
          : '总时长 -';
      }
      lockedTimestampMs = 0;
      lockedFrameIndex = 0;
      lastFrameHash = '';
      setEditMeta();
      updateTimelineByVideoTime();
    });
    editVideo.addEventListener('timeupdate', () => {
      updateTimelineByVideoTime();
      lockFrameByCurrentTime();
    });
    editVideo.addEventListener('seeked', () => {
      updateTimelineByVideoTime();
      lockFrameByCurrentTime();
    });
  }

  if (mergeVideoPreviewA) {
    mergeVideoPreviewA.addEventListener('loadedmetadata', () => {
      const duration = Number(mergeVideoPreviewA.duration || 0);
      if (mergeDurationA) {
        mergeDurationA.textContent = duration > 0 ? `总时长 ${formatMs(duration * 1000)}` : '总时长 -';
      }
      mergeCutMsA = 0;
      if (mergeTimeTextA) mergeTimeTextA.textContent = formatMs(0);
      if (mergeTimelineA) mergeTimelineA.value = '0';
    });
  }

  if (mergeVideoPreviewB) {
    mergeVideoPreviewB.addEventListener('loadedmetadata', () => {
      const duration = Number(mergeVideoPreviewB.duration || 0);
      if (mergeDurationB) {
        mergeDurationB.textContent = duration > 0 ? `总时长 ${formatMs(duration * 1000)}` : '总时长 -';
      }
      mergeCutMsB = 0;
      if (mergeTimeTextB) mergeTimeTextB.textContent = formatMs(0);
      if (mergeTimelineB) mergeTimelineB.value = '0';
    });
  }

  if (mergeTimelineA) {
    mergeTimelineA.addEventListener('input', () => {
      if (!mergeVideoPreviewA) return;
      const duration = Number(mergeVideoPreviewA.duration || 0);
      if (!Number.isFinite(duration) || duration <= 0) return;
      const ratio = Number(mergeTimelineA.value || 0) / EDIT_TIMELINE_MAX;
      const nextTime = Math.max(0, Math.min(duration, duration * ratio));
      mergeVideoPreviewA.currentTime = nextTime;
      mergeCutMsA = Math.round(nextTime * 1000);
      if (mergeTimeTextA) mergeTimeTextA.textContent = formatMs(mergeCutMsA);
    });
  }

  if (mergeTimelineB) {
    mergeTimelineB.addEventListener('input', () => {
      if (!mergeVideoPreviewB) return;
      const duration = Number(mergeVideoPreviewB.duration || 0);
      if (!Number.isFinite(duration) || duration <= 0) return;
      const ratio = Number(mergeTimelineB.value || 0) / EDIT_TIMELINE_MAX;
      const nextTime = Math.max(0, Math.min(duration, duration * ratio));
      mergeVideoPreviewB.currentTime = nextTime;
      mergeCutMsB = Math.round(nextTime * 1000);
      if (mergeTimeTextB) mergeTimeTextB.textContent = formatMs(mergeCutMsB);
    });
  }

  if (spliceBtn) {
    spliceBtn.addEventListener('click', () => {
      if (activeSpliceRun && !activeSpliceRun.done) {
        requestCancelSplice();
        return;
      }
      runSplice();
    });
  }

  if (directMergeBtn) {
    directMergeBtn.addEventListener('click', () => {
      directMergeTwoVideos();
    });
  }

  if (pickCachedVideoBtn) {
    pickCachedVideoBtn.addEventListener('click', async () => {
      try {
        cacheModalPickMode = 'edit';
        openCacheVideoModal(pickCachedVideoBtn);
        if (cacheVideoList) {
          cacheVideoList.innerHTML = '<div class="video-empty">正在读取缓存视频...</div>';
        }
        const items = await loadCachedVideos();
        renderCachedVideoList(items);
      } catch (e) {
        if (cacheVideoList) {
          cacheVideoList.innerHTML = '<div class="video-empty">读取失败，请稍后重试</div>';
        }
        toast('读取缓存视频失败', 'error');
      }
    });
  }

  if (uploadWorkVideoBtn && workVideoFileInput) {
    uploadWorkVideoBtn.addEventListener('click', () => {
      workVideoFileInput.click();
    });
    workVideoFileInput.addEventListener('change', () => {
      const file = workVideoFileInput.files && workVideoFileInput.files[0];
      if (!file) return;
      if (workVideoObjectUrl) {
        try { URL.revokeObjectURL(workVideoObjectUrl); } catch (e) { /* ignore */ }
        workVideoObjectUrl = '';
      }
      const localUrl = URL.createObjectURL(file);
      workVideoObjectUrl = localUrl;
      selectedVideoItemId = `upload-${Date.now()}`;
      selectedVideoUrl = localUrl;
      if (enterEditBtn) enterEditBtn.disabled = false;
      bindEditVideoSource(localUrl);
      openEditPanel();
      toast('本地视频已载入工作区', 'success');
    });
  }

  if (pickMergeVideoBtn) {
    pickMergeVideoBtn.addEventListener('click', async () => {
      try {
        cacheModalPickMode = 'merge_target';
        openCacheVideoModal(pickMergeVideoBtn);
        if (cacheVideoList) {
          cacheVideoList.innerHTML = '<div class="video-empty">正在读取缓存视频...</div>';
        }
        const items = await loadCachedVideos();
        renderCachedVideoList(items);
      } catch (e) {
        if (cacheVideoList) {
          cacheVideoList.innerHTML = '<div class="video-empty">读取失败，请稍后重试</div>';
        }
        toast('读取缓存视频失败', 'error');
      }
    });
  }
  if (closeCacheVideoModalBtn) {
    closeCacheVideoModalBtn.addEventListener('click', () => {
      closeCacheVideoModal();
    });
  }

  if (cacheVideoModal) {
    cacheVideoModal.addEventListener('click', (event) => {
      if (event.target === cacheVideoModal) {
        closeCacheVideoModal();
      }
    });
  }

  window.addEventListener('resize', () => {
    if (cacheVideoModal && !cacheVideoModal.classList.contains('hidden')) {
      positionCacheVideoModal();
    }
  });

  window.addEventListener('scroll', () => {
    if (cacheVideoModal && !cacheVideoModal.classList.contains('hidden')) {
      positionCacheVideoModal();
    }
  }, { passive: true });

  if (cacheVideoList) {
    cacheVideoList.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.classList.contains('cache-video-use')) return;
      const row = target.closest('.cache-video-item');
      if (!row) return;
      useCachedVideo(row.getAttribute('data-url') || '', row.getAttribute('data-name') || '');
    });
  }

  if (videoStage) {
    videoStage.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const item = target.closest('.video-item');
      if (!item) return;
      if (target.classList.contains('video-set-b')) {
        event.preventDefault();
        const bUrl = String(item.dataset.url || '').trim();
        if (!bUrl) {
          toast('该视频暂无可用地址', 'warning');
          return;
        }
        mergeTargetVideoUrl = bUrl;
        mergeTargetVideoName = `视频 ${String(item.dataset.index || '')}`;
        updateMergeLabels();
        bindMergeVideoB(mergeTargetVideoUrl);
        toast('已将该视频设为视频2', 'success');
        return;
      }
      selectedVideoItemId = String(item.dataset.index || '');
      selectedVideoUrl = String(item.dataset.url || '');
      refreshVideoSelectionUi();
      if (enterEditBtn) {
        enterEditBtn.disabled = !selectedVideoUrl;
      }
      updateMergeLabels();
      bindMergeVideoA(selectedVideoUrl);
      if (target.classList.contains('video-edit')) {
        event.preventDefault();
        openEditPanel();
        return;
      }
      if (!target.classList.contains('video-download')) {
        bindEditVideoSource(selectedVideoUrl);
        return;
      }
      event.preventDefault();
      const url = item.dataset.url || target.dataset.url || '';
      const index = item.dataset.index || '';
      if (!url) return;
      try {
        const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) {
          throw new Error('download_failed');
        }
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = blobUrl;
        anchor.download = index ? `grok_video_${index}.mp4` : 'grok_video.mp4';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(blobUrl);
      } catch (e) {
        toast('下载失败，请检查视频链接是否可访问', 'error');
      }
    });
  }

  if (imageFileInput) {
    imageFileInput.addEventListener('change', async () => {
      const file = imageFileInput.files && imageFileInput.files[0];
      if (!file) {
        clearFileSelection();
        return;
      }
      try {
        await applyReferenceImageFile(file, '上传图片');
      } catch (e) {
        fileDataUrl = '';
        toast(String(e && e.message ? e.message : '文件读取失败'), 'error');
        clearReferencePreview();
      }
    });
  }

  if (selectImageFileBtn && imageFileInput) {
    selectImageFileBtn.addEventListener('click', () => {
      imageFileInput.click();
    });
  }

  if (clearImageFileBtn) {
    clearImageFileBtn.addEventListener('click', () => {
      clearFileSelection();
    });
  }

  if (applyParentBtn) {
    applyParentBtn.addEventListener('click', () => {
      applyParentPostReference(parentPostInput ? parentPostInput.value : '');
    });
  }

  if (parentPostInput) {
    parentPostInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        applyParentPostReference(parentPostInput.value);
      }
    });
    parentPostInput.addEventListener('input', () => {
      const raw = parentPostInput.value.trim();
      if (!raw) {
        if (!fileDataUrl) {
          clearReferencePreview();
        }
        return;
      }
      applyParentPostReference(raw, { silent: true });
    });
    parentPostInput.addEventListener('paste', (event) => {
      const text = String(event.clipboardData ? event.clipboardData.getData('text') || '' : '').trim();
      if (!text) return;
      event.preventDefault();
      parentPostInput.value = text;
      applyParentPostReference(text, { silent: true });
    });
  }

  if (imageUrlInput) {
    imageUrlInput.addEventListener('input', () => {
      const raw = imageUrlInput.value.trim();
      if (!raw) {
        if (parentPostInput) {
          parentPostInput.value = '';
        }
        if (!fileDataUrl) {
          clearReferencePreview();
        }
        return;
      }
      const hasUrlLikePrefix = raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:image/') || raw.startsWith('/');
      if (!hasUrlLikePrefix) {
        const applied = applyParentPostReference(raw, { silent: true });
        if (applied) {
          return;
        }
      }
      const resolved = resolveReferenceByText(raw);
      if (resolved.parentPostId && parentPostInput) {
        parentPostInput.value = resolved.parentPostId;
      }
      if (raw && fileDataUrl) {
        clearFileSelection();
      }
      setReferencePreview(resolved.url || resolved.sourceUrl || raw, resolved.parentPostId || '');
    });
    imageUrlInput.addEventListener('paste', (event) => {
      const text = String(event.clipboardData ? event.clipboardData.getData('text') || '' : '').trim();
      if (!text) return;
      event.preventDefault();
      imageUrlInput.value = text;
      const applied = applyParentPostReference(text, { silent: true });
      if (!applied) {
        const resolved = resolveReferenceByText(text);
        if (resolved.parentPostId && parentPostInput) {
          parentPostInput.value = resolved.parentPostId;
        }
        if (fileDataUrl) {
          clearFileSelection();
        }
        setReferencePreview(resolved.url || resolved.sourceUrl || text, resolved.parentPostId || '');
      }
    });
  }

  document.addEventListener('paste', async (event) => {
    const dataTransfer = event.clipboardData;
    if (!dataTransfer) return;
    const imageFile = pickImageFileFromDataTransfer(dataTransfer);
    if (imageFile) {
      event.preventDefault();
      try {
        await applyReferenceImageFile(imageFile, '粘贴图片');
      } catch (e) {
        toast(String(e && e.message ? e.message : '图片读取失败'), 'error');
      }
      return;
    }
    const text = String(dataTransfer.getData('text') || '').trim();
    if (!text) return;
    const target = event.target;
    const allowTarget = target === parentPostInput || target === imageUrlInput || !(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement);
    if (!allowTarget || target === promptInput) {
      return;
    }
    const applied = applyParentPostReference(text, { silent: true });
    if (applied) {
      event.preventDefault();
    }
  });

  if (refDropZone) {
    refDropZone.addEventListener('dragenter', (event) => {
      if (!hasFiles(event.dataTransfer)) return;
      event.preventDefault();
      refDragCounter += 1;
      setRefDragActive(true);
    });

    refDropZone.addEventListener('dragover', (event) => {
      if (!hasFiles(event.dataTransfer)) return;
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
      setRefDragActive(true);
    });

    refDropZone.addEventListener('dragleave', (event) => {
      if (!hasFiles(event.dataTransfer)) return;
      event.preventDefault();
      refDragCounter = Math.max(0, refDragCounter - 1);
      if (refDragCounter === 0) {
        setRefDragActive(false);
      }
    });

    refDropZone.addEventListener('drop', async (event) => {
      event.preventDefault();
      refDragCounter = 0;
      setRefDragActive(false);
      const file = pickImageFileFromDataTransfer(event.dataTransfer);
      if (!file) {
        toast('未检测到可用图片文件', 'warning');
        return;
      }
      try {
        await applyReferenceImageFile(file, '拖拽图片');
      } catch (e) {
        toast(String(e && e.message ? e.message : '图片读取失败'), 'error');
      }
    });
  }

  window.addEventListener('dragover', (event) => {
    if (!hasFiles(event.dataTransfer)) return;
    event.preventDefault();
  });

  window.addEventListener('drop', (event) => {
    if (!hasFiles(event.dataTransfer)) return;
    if (refDropZone && event.target instanceof Node && refDropZone.contains(event.target)) {
      return;
    }
    event.preventDefault();
    refDragCounter = 0;
    setRefDragActive(false);
  });

  if (promptInput) {
    promptInput.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        startConnection();
      }
    });
  }

  [ratioSelect, lengthSelect, resolutionSelect, presetSelect, concurrentSelect]
    .filter(Boolean)
    .forEach((el) => {
      el.addEventListener('change', updateMeta);
    });

  updateMeta();
  updateMergeLabels();
  updateHistoryCount();
  updateManualActionsVisibility();
  setSpliceButtonState('idle');
  if (imageUrlInput && imageUrlInput.value.trim()) {
    const resolved = resolveReferenceByText(imageUrlInput.value.trim());
    setReferencePreview(resolved.url || resolved.sourceUrl || imageUrlInput.value.trim(), resolved.parentPostId || '');
    if (resolved.parentPostId && parentPostInput && !parentPostInput.value.trim()) {
      parentPostInput.value = resolved.parentPostId;
    }
  } else {
    clearReferencePreview();
  }
})();
