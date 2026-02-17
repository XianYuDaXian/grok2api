(() => {
  const imagePromptInput = document.getElementById('imagePromptInput');
  const videoPromptInput = document.getElementById('videoPromptInput');
  const ratioSelect = document.getElementById('ratioSelect');
  const videoParallelSelect = document.getElementById('videoParallelSelect');
  const resolutionSelect = document.getElementById('resolutionSelect');
  const videoLengthSelect = document.getElementById('videoLengthSelect');
  const nsfwSelect = document.getElementById('nsfwSelect');

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
    videoAuthHeader: '',
    videoRawPublicKey: '',
    lightboxIndex: -1,
    editProgressValue: 0,
    editProgressTimer: null,
    editProgressHideTimer: null,
    editProgressStartedAt: 0,
    editDurationEstimateMs: 14000,
  };
  if (lightboxEditSend) {
    lightboxEditSend.disabled = true;
  }

  function toast(message, type) {
    if (typeof showToast === 'function') {
      showToast(message, type);
    }
  }

  function shortId(value) {
    const raw = String(value || '');
    if (!raw) return '-';
    if (raw.length <= 12) return raw;
    return `${raw.slice(0, 6)}...${raw.slice(-6)}`;
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

  function updateCounters() {
    if (imageCount) {
      imageCount.textContent = `${state.candidates.length} 张`;
    }
    if (videoCount) {
      videoCount.textContent = `${state.videoTaskIds.length} 个任务`;
    }
  }

  function updateImageButtons() {
    if (generateBatchBtn) generateBatchBtn.disabled = state.imageRunning;
    if (nextBatchBtn) nextBatchBtn.disabled = state.imageRunning;
    if (stopBatchBtn) stopBatchBtn.disabled = !state.imageRunning;
  }

  function updateVideoButtons() {
    const hasSelected = Boolean(getSelectedCandidate());
    if (startVideoBtn) startVideoBtn.disabled = state.videoRunning || !hasSelected;
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

  async function createImagineTask(authHeader, prompt, ratio, nsfwEnabled) {
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
      }),
    });
    if (!res.ok) {
      throw new Error(await res.text() || 'imagine_start_failed');
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

  async function requestImagineEditStream(authHeader, prompt, parentPostId, sourceImageUrl, onProgress) {
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
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || 'edit_failed');
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
    const candidate = state.candidates[index];
    if (!candidate) return;
    lightboxImg.src = String(candidate.imageUrl || '').trim();
    renderLightboxHistory(candidate);
    if (lightboxPrev) lightboxPrev.disabled = (index === 0);
    if (lightboxNext) lightboxNext.disabled = (index === state.candidates.length - 1);
    if (lightboxEditSend) {
      const parentPostId = String(candidate.parentPostId || '').trim();
      lightboxEditSend.disabled = !parentPostId;
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
  }

  function closeLightboxView() {
    if (!lightbox) return;
    lightbox.classList.remove('active');
    state.lightboxIndex = -1;
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
    if (lightboxEditSend) {
      lightboxEditSend.disabled = true;
      lightboxEditSend.textContent = '编辑中...';
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
            const safe = Math.max(state.editProgressValue, Math.min(99, next));
            setEditProgress(safe, text || `编辑中 ${safe}%`);
          } else if (text) {
            setEditProgress(state.editProgressValue, text);
          }
        }
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
      const msg = String(e && e.message ? e.message : e);
      finishEditProgress(false, '编辑失败');
      toast(`编辑失败：${msg}`, 'error');
    } finally {
      if (lightboxEditSend) {
        lightboxEditSend.textContent = '发送编辑';
        const current = getCurrentLightboxCandidate();
        const currentParent = current ? String(current.parentPostId || '').trim() : '';
        lightboxEditSend.disabled = !currentParent;
      }
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
    const startCount = state.candidates.length;
    state.imageTargetTotal = startCount + 6;

    let data = null;
    try {
      data = await createImagineTask(authHeader, prompt, ratio, nsfwEnabled);
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
      throw new Error(await res.text() || 'video_start_failed');
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
    item.innerHTML = `
      <div class="video-item-head">
        <div class="video-item-title">任务 ${index}</div>
        <div class="video-item-status running">排队中</div>
      </div>
      <div class="video-body">等待上游返回视频流...</div>
      <div class="video-actions">
        <a class="geist-button-outline text-xs px-3 hidden video-open" target="_blank" rel="noopener">打开</a>
        <button class="geist-button-outline text-xs px-3 video-download" type="button" disabled>下载</button>
      </div>
    `;
    videoResults.appendChild(item);
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
    item.dataset.videoUrl = url || '';
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

  if (generateBatchBtn) {
    generateBatchBtn.addEventListener('click', () => {
      startImageBatch();
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
      await startEditFromLightbox();
    });
  }

  if (lightboxEditInput) {
    lightboxEditInput.addEventListener('click', (e) => {
      e.stopPropagation();
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
      closeLightboxView();
    } else if (e.key === 'ArrowLeft') {
      showPrevLightboxImage();
    } else if (e.key === 'ArrowRight') {
      showNextLightboxImage();
    }
  });

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
})();
