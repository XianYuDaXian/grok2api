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
  const editExtendPostId = document.getElementById('editExtendPostId');
  const editVideoName = document.getElementById('editVideoName');
  const editVideoNameCard = document.getElementById('editVideoNameCard');
  const editPromptInput = document.getElementById('editPromptInput');
  const editLengthSelect = document.getElementById('editLengthSelect');
  const spliceBtn = document.getElementById('spliceBtn');

  const promptInput = document.getElementById('promptInput');
  const promptRichInput = document.getElementById('promptRichInput');
  const referenceMentionMenu = document.getElementById('referenceMentionMenu');
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
  const singleImageModeSelect = document.getElementById('singleImageModeSelect');
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
  const referenceStrip = document.getElementById('referenceStrip');
  const currentGallery = document.getElementById('currentGallery');
  const previewEmpty = document.getElementById('previewEmpty');
  const currentParentId = document.getElementById('currentParentId');
  const currentMode = document.getElementById('currentMode');
  const refDropZone = document.getElementById('refDropZone');
  const referenceLightbox = document.getElementById('referenceLightbox');
  const referenceLightboxImg = document.getElementById('referenceLightboxImg');
  const closeReferenceLightboxBtn = document.getElementById('closeReferenceLightboxBtn');
  const historyCount = document.getElementById('historyCount');
  const videoHistoryReverseBtn = document.getElementById('videoHistoryReverseBtn');
  const editPreviewWrap = editVideo ? editVideo.closest('.edit-preview-wrap') : null;

  let taskStates = new Map();
  let activeTaskIds = [];
  let isRunning = false;
  let hasRunError = false;
  let startAt = 0;
  const REFERENCE_LIMIT = 7;
  let referenceImages = [];
  let currentModeValue = 'upload';
  let selectedReferenceId = '';
  let activeMentionIndex = -1;
  let isSyncingPromptEditor = false;
  let lastMentionRange = null;
  let lastMentionContext = null;

  function getReferenceMentionLabel(index) {
    return `Image ${index + 1}`;
  }

  function enrichReferenceItem(item, index) {
    const normalized = {
      id: item.id || makeReferenceId('ref'),
      previewUrl: String(item.previewUrl || item.url || item.sourceUrl || '').trim(),
      sourceUrl: String(item.sourceUrl || item.url || item.previewUrl || '').trim(),
      url: String(item.url || item.previewUrl || item.sourceUrl || '').trim(),
      parentPostId: String(item.parentPostId || '').trim(),
      name: String(item.name || '').trim(),
      mentionLabel: String(item.mentionLabel || '').trim()
    };
    if (!normalized.mentionLabel) {
      normalized.mentionLabel = getReferenceMentionLabel(index);
    }
    return normalized;
  }

  function refreshReferenceMentionLabels() {
    referenceImages = referenceImages.map((item, index) => ({
      ...item,
      mentionLabel: getReferenceMentionLabel(index)
    }));
  }
  let elapsedTimer = null;
  let lastProgress = 0;
  let previewCount = 0;
  let refDragCounter = 0;
  let selectedVideoItemId = '';
  let selectedVideoUrl = '';
  let selectedVideoMeta = {};
  let editingRound = 0;
  let editingBusy = false;
  let activeSpliceRun = null;
  let lockedFrameIndex = -1;
  let lockedTimestampMs = 0;
  let currentExtendPostId = '';      // 当前视频 postId（随链式延长更新）
  let currentFileAttachmentId = '';  // 当前视频 postId（当前选中视频的 postId）
  let originalFileAttachmentId = ''; // 原始图片 postId（首次设置后不随延长更新）
  const DEFAULT_REASONING_EFFORT = 'low';
  const EDIT_TIMELINE_MAX = 100000;
  const TAIL_FRAME_GUARD_MS = 80;
  let workVideoObjectUrl = '';
  let editTimelineTaskLocked = false;
  let workspacePreviewSizeLocked = false;
  let workspaceLockedWidth = 0;
  let workspaceLockedHeight = 0;
  let editVideoNameTapTimer = 0;
  let editVideoNameTapCount = 0;
  let videoHistoryReversed = false;

  function buildHistoryTitle(type, serial) {
    const n = Math.max(1, parseInt(String(serial || '1'), 10) || 1);
    if (type === 'splice') {
      return `延长视频${n}`;
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

  function ensureRenameDialog() {
    let overlay = document.getElementById('videoRenameDialog');
    if (overlay) return overlay;
    const style = document.createElement('style');
    style.textContent = `
      .video-rename-dialog-overlay {
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
      .video-rename-dialog-overlay.hidden { display: none; }
      .video-rename-dialog {
        width: min(420px, calc(100vw - 32px));
        border-radius: 16px;
        border: 1px solid var(--border);
        background: var(--video-surface, var(--bg));
        color: var(--fg);
        box-shadow: 0 24px 80px rgba(15, 23, 42, 0.28);
        padding: 18px;
      }
      .video-rename-dialog-title {
        font-size: 16px;
        font-weight: 600;
        color: var(--fg);
      }
      .video-rename-dialog-desc {
        margin-top: 6px;
        font-size: 13px;
        line-height: 1.6;
        color: var(--accents-5);
      }
      .video-rename-dialog-input {
        width: 100%;
        margin-top: 14px;
        border-radius: 12px;
        border: 1px solid var(--border);
        background: var(--accents-1);
        color: var(--fg);
        padding: 12px 14px;
        outline: none;
      }
      .video-rename-dialog-input:focus {
        border-color: var(--accents-5);
        box-shadow: 0 0 0 3px rgba(127, 127, 127, 0.12);
      }
      .video-rename-dialog-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 16px;
      }
      html[data-theme='dark'] .video-rename-dialog {
        background: #141b25;
        border-color: #2b3440;
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
      }
      html[data-theme='dark'] .video-rename-dialog-input {
        background: #101722;
        border-color: #2b3440;
        color: #f5f7fb;
      }
    `;
    document.head.appendChild(style);
    overlay = document.createElement('div');
    overlay.id = 'videoRenameDialog';
    overlay.className = 'video-rename-dialog-overlay hidden';
    overlay.innerHTML = `
      <div class="video-rename-dialog" role="dialog" aria-modal="true" aria-labelledby="videoRenameDialogTitle">
        <div id="videoRenameDialogTitle" class="video-rename-dialog-title">重命名视频</div>
        <div class="video-rename-dialog-desc">新的名称会写入本地元数据，并同步到历史视频、选择视频和缓存管理。</div>
        <input id="videoRenameDialogInput" class="video-rename-dialog-input" type="text" maxlength="120" placeholder="输入视频名称">
        <div class="video-rename-dialog-actions">
          <button id="videoRenameDialogCancel" type="button" class="geist-button-outline">取消</button>
          <button id="videoRenameDialogClear" type="button" class="geist-button-outline">恢复默认</button>
          <button id="videoRenameDialogOk" type="button" class="geist-button">保存</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  function openRenameDialog(initialValue = '') {
    const overlay = ensureRenameDialog();
    const input = overlay.querySelector('#videoRenameDialogInput');
    const okBtn = overlay.querySelector('#videoRenameDialogOk');
    const clearBtn = overlay.querySelector('#videoRenameDialogClear');
    const cancelBtn = overlay.querySelector('#videoRenameDialogCancel');
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

  function formatMs(ms) {
    const safe = Math.max(0, Number(ms) || 0);
    const totalSeconds = Math.floor(safe / 1000);
    const milli = Math.floor(safe % 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milli).padStart(3, '0')}`;
  }

  function enforceInlinePlayback(videoEl) {
    if (!(videoEl instanceof HTMLVideoElement)) return;
    videoEl.playsInline = true;
    videoEl.setAttribute('playsinline', '');
    videoEl.setAttribute('webkit-playsinline', '');
    videoEl.setAttribute('x5-playsinline', 'true');
    videoEl.style.objectFit = 'contain';
    videoEl.style.maxWidth = '100%';
    videoEl.style.maxHeight = '100%';
  }

  function shouldLockWorkspacePreviewSize() {
    return window.matchMedia('(max-width: 1024px)').matches;
  }

  function lockWorkspacePreviewSize(force = false) {
    if (window.innerWidth < 640) return; // Disable on mobile to allow fluid width
    if (!editPreviewWrap || !editVideo) return;
    if (!shouldLockWorkspacePreviewSize()) {
      editPreviewWrap.style.removeProperty('width');
      editPreviewWrap.style.removeProperty('height');
      editPreviewWrap.style.removeProperty('min-height');
      editPreviewWrap.style.removeProperty('max-height');
      workspacePreviewSizeLocked = false;
      return;
    }
    if (workspacePreviewSizeLocked && !force) return;
    const rect = editPreviewWrap.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || 0));
    const height = Math.max(1, Math.round(rect.height || 0));
    if (width < 20 || height < 20) return;
    workspaceLockedWidth = width;
    workspaceLockedHeight = height;
    editPreviewWrap.style.width = `${width}px`;
    editPreviewWrap.style.height = `${height}px`;
    editPreviewWrap.style.minHeight = `${height}px`;
    editPreviewWrap.style.maxHeight = `${height}px`;
    editVideo.style.width = '100%';
    editVideo.style.height = '100%';
    editVideo.style.maxHeight = '100%';
    workspacePreviewSizeLocked = true;
  }

  function shortHash(value) {
    const raw = String(value || '');
    if (!raw) return '-';
    if (raw.length <= 14) return raw;
    return `${raw.slice(0, 8)}...${raw.slice(-6)}`;
  }

  function getCurrentEditVideoMeta() {
    const item = getSelectedVideoItem();
    const safeUrl = item
      ? String(item.dataset.url || '').trim()
      : String(selectedVideoUrl || '').trim();
    return {
      item,
      url: safeUrl,
      postId: item ? String(item.dataset.postId || '').trim() : String(selectedVideoMeta.postId || '').trim(),
      shareLink: item ? String(item.dataset.shareLink || '').trim() : String(selectedVideoMeta.shareLink || '').trim(),
      originalPostId: item ? String(item.dataset.originalPostId || '').trim() : String(selectedVideoMeta.originalPostId || '').trim(),
      name: item ? String(item.dataset.name || '').trim() : String(selectedVideoMeta.name || '').trim(),
      displayName: item ? String(item.dataset.displayName || '').trim() : String(selectedVideoMeta.displayName || '').trim(),
      defaultTitle: item ? String(item.dataset.defaultTitle || '').trim() : String(selectedVideoMeta.defaultTitle || '').trim(),
    };
  }

  function resolveEditVideoDisplayName(meta = {}) {
    return String(
      meta.displayName
      || meta.defaultTitle
      || meta.name
      || meta.postId
      || '-'
    ).trim() || '-';
  }

  function setEditMeta() {
    if (editFrameIndex) editFrameIndex.textContent = lockedFrameIndex >= 0 ? String(lockedFrameIndex) : '-';
    if (editTimestampMs) editTimestampMs.textContent = String(Math.max(0, Math.round(lockedTimestampMs)));
    if (editExtendPostId) editExtendPostId.textContent = shortHash(currentExtendPostId);
    if (editVideoName) {
      const meta = getCurrentEditVideoMeta();
      editVideoName.textContent = resolveEditVideoDisplayName(meta);
      const fullName = resolveEditVideoDisplayName(meta);
      editVideoName.title = meta.url ? `${fullName}\n双击重命名` : '请先选择视频';
      editVideoName.classList.toggle('opacity-60', !meta.url);
      editVideoName.style.whiteSpace = 'nowrap';
      editVideoName.style.overflow = 'hidden';
      editVideoName.style.textOverflow = 'ellipsis';
      editVideoName.style.maxWidth = '100%';
      editVideoName.style.display = 'block';
    }
  }

  const UUID_RE = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;

  // 从缓存视频文件名中提取 parentPostId
  // 文件名格式示例: users-xxx-generated-{postId}-generated_video_hd.mp4
  function extractPostIdFromFileName(name) {
    const s = String(name || '').trim();
    if (!s) return '';
    // 尝试 generated-{uuid}- 模式
    const m = s.match(/generated-([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})-/);
    if (m) return m[1];
    // 回退：匹配最后一个 UUID 格式
    const allUuids = s.match(UUID_RE);
    return allUuids && allUuids.length ? allUuids[allUuids.length - 1] : '';
  }

  function extractPostIdFromShareLink(link) {
    const text = String(link || '').trim();
    if (!text) return '';
    const match = text.match(/\/imagine\/post\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(?:[/?#]|$)/i);
    return match ? match[1] : '';
  }

  function resolveVideoPostId(meta = {}) {
    const directPostId = String(meta.postId || meta.post_id || '').trim();
    if (directPostId) return directPostId;
    const shareLinkPostId = extractPostIdFromShareLink(meta.shareLink || meta.share_link || '');
    if (shareLinkPostId) return shareLinkPostId;
    const originalPostId = String(meta.originalPostId || meta.original_post_id || '').trim();
    if (originalPostId) return originalPostId;
    const namePostId = extractPostIdFromFileName(meta.name || '');
    if (namePostId) return namePostId;
    return extractPostIdFromFileName(meta.url || '');
  }

  function resolveVideoRenameKey(meta = {}) {
    return String(
      meta.postId
      || meta.post_id
      || extractPostIdFromShareLink(meta.shareLink || meta.share_link || '')
      || meta.taskId
      || meta.task_id
      || meta.url
      || ''
    ).trim();
  }

  function getVideoStoredTitle(meta = {}) {
    return String(
      meta.displayName
      || meta.display_name
      || meta.dataset?.displayName
      || ''
    ).trim();
  }

  async function persistVideoStoredTitle(meta = {}, title = '') {
    const authHeader = await ensurePublicKey();
    if (authHeader === null) {
      throw new Error('missing_public_key');
    }
    const resolvedPostId = resolveVideoPostId(meta);
    if (!resolvedPostId) {
      throw new Error('missing_post_id');
    }
    const res = await fetch('/v1/public/video/rename', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        post_id: resolvedPostId,
        share_link: String(meta.shareLink || meta.share_link || '').trim(),
        name: String(meta.name || '').trim(),
        display_name: String(title || '').trim(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.status !== 'success') {
      throw new Error(data.detail || data.error || 'rename_failed');
    }
    return data.result || {};
  }

  function applyVideoCardTitle(item, fallbackTitle = '') {
    if (!item) return;
    const titleEl = item.querySelector('.video-item-title');
    if (!titleEl) return;
    const baseTitle = String(
      item.dataset.defaultTitle
      || fallbackTitle
      || titleEl.textContent
      || ''
    ).trim();
    if (baseTitle) {
      item.dataset.defaultTitle = baseTitle;
    }
    const customTitle = getVideoStoredTitle({
      postId: item.dataset.postId || '',
      shareLink: item.dataset.shareLink || '',
      taskId: item.dataset.taskId || '',
      url: item.dataset.url || '',
      name: item.dataset.name || '',
      displayName: item.dataset.displayName || '',
    });
    titleEl.textContent = customTitle || baseTitle || '视频';
  }

  function syncCachedVideoDisplayName(meta = {}, displayName = '') {
    if (!cacheVideoList) return;
    const resolvedPostId = resolveVideoPostId(meta);
    const resolvedUrl = String(meta.url || '').trim();
    const rows = cacheVideoList.querySelectorAll('.cache-video-item');
    rows.forEach((row) => {
      const rowPostId = String(row.getAttribute('data-post-id') || '').trim();
      const rowUrl = String(row.getAttribute('data-url') || '').trim();
      const matched = (resolvedPostId && rowPostId === resolvedPostId)
        || (resolvedUrl && rowUrl === resolvedUrl);
      if (!matched) return;
      row.setAttribute('data-display-name', String(displayName || '').trim());
      const nameEl = row.querySelector('.cache-video-name');
      if (nameEl) {
        const fallbackName = String(row.getAttribute('data-name') || '').trim() || 'video.mp4';
        nameEl.textContent = String(displayName || '').trim() || fallbackName;
      }
    });
  }

  function applyRenamedVideoState(meta = {}, displayName = '') {
    const nextDisplayName = String(displayName || '').trim();
    if (meta.item) {
      meta.item.dataset.displayName = nextDisplayName;
      applyVideoCardTitle(meta.item);
    }
    if (selectedVideoUrl && String(meta.url || '').trim() === String(selectedVideoUrl || '').trim()) {
      selectedVideoMeta.displayName = nextDisplayName;
      if (!nextDisplayName) {
        selectedVideoMeta.defaultTitle = String(meta.name || selectedVideoMeta.name || selectedVideoMeta.defaultTitle || '').trim();
      } else if (!selectedVideoMeta.defaultTitle) {
        selectedVideoMeta.defaultTitle = String(meta.name || selectedVideoMeta.name || '').trim();
      }
      setEditMeta();
    }
    syncCachedVideoDisplayName(meta, nextDisplayName);
  }

  function applyResolvedVideoIdentity(meta = {}, sourceLabel = '') {
    const resolvedPostId = resolveVideoPostId(meta);
    if (!resolvedPostId) {
      if (sourceLabel) {
        console.warn(`[视频标识] ${sourceLabel} 未解析到 post_id`, meta);
      }
      return '';
    }
    currentExtendPostId = resolvedPostId;
    currentFileAttachmentId = resolvedPostId;
    if (!originalFileAttachmentId) {
      originalFileAttachmentId = resolvedPostId;
    }
    if (sourceLabel) {
      console.log(`[视频标识] ${sourceLabel} 解析 post_id:`, resolvedPostId);
    }
    return resolvedPostId;
  }

  function debugLog(...args) {
    // console.log('[video-extend-debug]', ...args);
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

  function updateDeleteZoneTrack(inputEl) {
    if (!inputEl) return;
    const maxRaw = Number(inputEl.max || EDIT_TIMELINE_MAX);
    const max = Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : EDIT_TIMELINE_MAX;
    const valueRaw = Number(inputEl.value || 0);
    const value = Math.max(0, Math.min(max, Number.isFinite(valueRaw) ? valueRaw : 0));
    const pct = (value / max) * 100;
    inputEl.style.setProperty('--cut-pct', `${pct}%`);
  }

  function refreshAllDeleteZoneTracks() {
    updateDeleteZoneTrack(editTimeline);
  }

  function setSpliceButtonState(state) {
    if (!spliceBtn) return;
    const iconExtend = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>';
    const iconStop = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="14" height="14"/></svg>';
    spliceBtn.classList.remove('is-running', 'is-stopping');
    if (state === 'running') {
      spliceBtn.disabled = false;
      spliceBtn.classList.add('is-running');
      spliceBtn.innerHTML = `${iconStop}<span>中止延长</span>`;
      return;
    }
    if (state === 'stopping') {
      spliceBtn.disabled = true;
      spliceBtn.classList.add('is-stopping');
      spliceBtn.innerHTML = `${iconStop}<span>中止中...</span>`;
      return;
    }
    spliceBtn.disabled = false;
    spliceBtn.innerHTML = `${iconExtend}<span>延长视频</span>`;
  }

  function syncTimelineAvailability() {
    const hasWorkspaceVideo = Boolean(String(selectedVideoUrl || '').trim());
    if (editTimeline) {
      editTimeline.disabled = editTimelineTaskLocked || !hasWorkspaceVideo;
      editTimeline.classList.toggle('is-disabled', editTimeline.disabled);
    }
  }

  function setEditTimelineLock(locked) {
    editTimelineTaskLocked = Boolean(locked);
    syncTimelineAvailability();
  }

  function updateHistoryCount() {
    if (!historyCount || !videoStage) return;
    const count = videoStage.querySelectorAll('.video-item').length;
    historyCount.textContent = String(count);
    if (videoHistoryReverseBtn) {
      videoHistoryReverseBtn.textContent = videoHistoryReversed ? '正序显示' : '倒序显示';
      videoHistoryReverseBtn.setAttribute('aria-pressed', videoHistoryReversed ? 'true' : 'false');
    }
  }

  function syncVideoHistoryOrder() {
    if (!videoStage) return;
    videoStage.classList.toggle('is-reversed', videoHistoryReversed);
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

    item.remove();
    const hasAny = videoStage.querySelector('.video-item');
    if (!hasAny) {
      videoStage.classList.add('hidden');
      if (videoEmpty) videoEmpty.classList.remove('hidden');
    }
    updateHistoryCount();
    refreshVideoSelectionUi();
    syncTimelineAvailability();
  }

  function getParentMemoryApi() {
    return window.ParentPostMemory || null;
  }

  function extractParentPostId(text) {
    const raw = String(text || '').trim();
    if (!raw) return '';
    const cleaned = raw.replace(/^['"\s]+|['"\s]+$/g, '');
    if (!cleaned) return '';
    const api = getParentMemoryApi();
    if (api && typeof api.extractParentPostId === 'function') {
      try {
        const viaApi = String(api.extractParentPostId(cleaned) || '').trim();
        if (viaApi) return viaApi;
      } catch (e) {
        // ignore
      }
    }
    const queryId = cleaned.match(/[?&#](?:parent_post_id|parentPostId|post_id|postId)=([0-9a-fA-F-]{32,36})(?:[&#]|$)/i);
    if (queryId) return queryId[1];

    const direct = cleaned.match(/^[0-9a-fA-F-]{32,36}$/);
    if (direct) return direct[0];
    const generated = cleaned.match(/\/generated\/([0-9a-fA-F-]{32,36})(?:[/?#]|$)/);
    if (generated) return generated[1];
    const imaginePublic = cleaned.match(/\/imagine-public\/images\/([0-9a-fA-F-]{32,36})(?:\.[A-Za-z0-9]+|[/?#]|$)/);
    if (imaginePublic) return imaginePublic[1];
    const imagesTail = cleaned.match(/\/images\/([0-9a-fA-F-]{32,36})(?:\.[A-Za-z0-9]+|[/?#]|$)/);
    if (imagesTail) return imagesTail[1];
    const all = cleaned.match(/([0-9a-fA-F-]{32,36})/g);
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

  function isImagePreviewUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return false;
    if (raw.startsWith('data:image/')) return true;
    if (/\/imagine-public\/images\/[0-9a-fA-F-]{32,36}(?:\.[A-Za-z0-9]+|[/?#]|$)/i.test(raw)) return true;
    if (/\/v1\/files\/image\//i.test(raw)) return true;
    if (/\/users\/.+\.(?:jpg|jpeg|png|webp)(?:[?#].*)?$/i.test(raw)) return true;
    if (/\.(?:jpg|jpeg|png|webp)(?:[?#].*)?$/i.test(raw)) return true;
    return false;
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
      if (isImagePreviewUrl(raw)) return raw;
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
        if (hit && (hit.parentPostId || hit.id)) {
          const parentPostId = String(hit.parentPostId || hit.id || '').trim();
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
    // 强制保底：只要有 parentPostId，url 字段就不能是空的字符串或原始 ID 文本
    const finalUrl = (previewUrl && previewUrl !== parentPostId) ? previewUrl : `https://imagine-public.x.ai/imagine-public/images/${parentPostId}.jpg`;
    return { url: finalUrl, sourceUrl: sourceUrl || finalUrl, parentPostId };
  }

  function makeReferenceId(prefix = 'ref') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function updateReferenceSummary() {
    if (!imageFileName) return;
    imageFileName.textContent = `已添加 ${referenceImages.length}/${REFERENCE_LIMIT} 张`;
  }

  function updateReferenceMeta() {
    const primary = referenceImages[0] || null;
    if (currentParentId) {
      currentParentId.textContent = primary && primary.parentPostId ? primary.parentPostId : '-';
    }
    if (currentMode) {
      currentMode.textContent = currentModeValue || 'upload';
    }
    updateReferenceSummary();
  }

  function renderReferenceStrip() {
    if (!referenceStrip) return;
    refreshReferenceMentionLabels();
    syncPromptRichInputFromTextarea();
    referenceStrip.innerHTML = '';
    if (!referenceImages.length) {
      const empty = document.createElement('div');
      empty.className = 'reference-empty';
      empty.textContent = `可上传 / 粘贴 / 拖拽参考图（最多 ${REFERENCE_LIMIT} 张）`;
      referenceStrip.appendChild(empty);
      updateReferenceMeta();
      return;
    }

    referenceImages.forEach((item) => {
      const index = referenceImages.findIndex((ref) => ref.id === item.id);
      const card = document.createElement('div');
      card.className = 'reference-item';
      card.dataset.id = item.id;
      if (item.id === selectedReferenceId) {
        card.classList.add('is-active');
      }
      card.title = item.parentPostId ? `parentPostId: ${item.parentPostId}` : '点击切换预览';

      const img = document.createElement('img');
      img.src = item.previewUrl || item.sourceUrl || item.url || '';
      img.alt = item.parentPostId ? `parentPostId: ${item.parentPostId}` : '参考图';
      img.addEventListener('click', () => {
        selectedReferenceId = item.id;
        renderReferenceStrip();
        setReferencePreviewItems(referenceImages);
      });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'reference-remove';
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        removeReferenceItem(item.id);
      });

      card.appendChild(img);
      card.appendChild(removeBtn);
      const badge = document.createElement('div');
      badge.className = 'reference-badge';
      badge.textContent = item.mentionLabel || getReferenceMentionLabel(Math.max(0, index));
      card.appendChild(badge);
      referenceStrip.appendChild(card);
    });

    if (referenceImages.length < REFERENCE_LIMIT && imageFileInput) {
      const addSlot = document.createElement('button');
      addSlot.type = 'button';
      addSlot.className = 'reference-add-slot';
      addSlot.textContent = '+';
      addSlot.title = '继续添加';
      addSlot.addEventListener('click', () => imageFileInput.click());
      referenceStrip.appendChild(addSlot);
    }
    updateReferenceMeta();
  }

  function clearReferencePreview() {
    if (currentGallery) {
      currentGallery.innerHTML = '';
      currentGallery.classList.add('hidden');
      currentGallery.dataset.count = '0';
    }
    if (previewEmpty) {
      previewEmpty.classList.remove('hidden');
    }
  }

  function setReferencePreviewItems(items) {
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!currentGallery || !referencePreview) return;
    if (!list.length) {
      selectedReferenceId = '';
      clearReferencePreview();
      return;
    }
    const selected = list.find((item) => item.id === selectedReferenceId) || list[0];
    selectedReferenceId = selected.id;
    currentGallery.innerHTML = '';
    currentGallery.dataset.count = '1';
    currentGallery.classList.remove('hidden');
    if (previewEmpty) {
      previewEmpty.classList.add('hidden');
    }
    const box = document.createElement('div');
    box.className = 'current-gallery-item current-gallery-item-single';
    const img = document.createElement('img');
    img.src = selected.previewUrl || selected.sourceUrl || selected.url || '';
    img.alt = selected.parentPostId ? `parentPostId: ${selected.parentPostId}` : '参考图预览';
    box.appendChild(img);
    currentGallery.appendChild(box);
  }

  function removeReferenceItem(id) {
    const before = referenceImages.length;
    referenceImages = referenceImages.filter((item) => item.id !== id);
    if (referenceImages.length === before) return;
    if (!referenceImages.length) {
      currentModeValue = 'upload';
      selectedReferenceId = '';
      if (imageUrlInput) imageUrlInput.value = '';
      if (parentPostInput) parentPostInput.value = '';
    } else {
      const primary = referenceImages[0];
      if (!referenceImages.some((item) => item.id === selectedReferenceId)) {
        selectedReferenceId = primary.id;
      }
      if (imageUrlInput) {
        imageUrlInput.value = primary.sourceUrl || primary.url || '';
      }
      if (parentPostInput) {
        parentPostInput.value = primary.parentPostId || '';
      }
      currentModeValue = primary.parentPostId ? 'parent_post' : 'upload';
    }
    renderReferenceStrip();
    setReferencePreviewItems(referenceImages);
  }

  function setReferenceItems(items, mode = 'upload') {
    referenceImages = (Array.isArray(items) ? items : [])
      .filter((item) => item && (item.previewUrl || item.sourceUrl || item.url))
      .slice(0, REFERENCE_LIMIT)
      .map((item, index) => enrichReferenceItem(item, index));
    currentModeValue = mode;
    const primary = referenceImages[0] || null;
    selectedReferenceId = primary ? primary.id : '';
    if (imageUrlInput) {
      imageUrlInput.value = primary ? (primary.sourceUrl || primary.url || '') : '';
    }
    if (parentPostInput) {
      parentPostInput.value = primary ? (primary.parentPostId || '') : '';
    }
    renderReferenceStrip();
    setReferencePreviewItems(referenceImages);
    syncPromptRichInputFromTextarea();
  }

  function appendReferenceItems(items, mode = 'upload') {
    const candidates = (Array.isArray(items) ? items : [])
      .filter((item) => item && (item.previewUrl || item.sourceUrl || item.url))
      .map((item) => ({
        ...item,
        parentPostId: String(item.parentPostId || '').trim(),
        sourceUrl: String(item.sourceUrl || item.url || '').trim(),
        url: String(item.url || item.sourceUrl || '').trim()
      }));
    if (!candidates.length) return false;

    const merged = Array.isArray(referenceImages) ? referenceImages.slice() : [];
    let appended = false;
    for (const item of candidates) {
      const itemParentId = String(item.parentPostId || '').trim();
      const itemSourceUrl = String(item.sourceUrl || item.url || '').trim();
      const exists = merged.some((current) => {
        const currentParentId = String(current.parentPostId || '').trim();
        const currentSourceUrl = String(current.sourceUrl || current.url || '').trim();
        if (itemParentId && currentParentId && itemParentId === currentParentId) return true;
        if (itemSourceUrl && currentSourceUrl && itemSourceUrl === currentSourceUrl) return true;
        return false;
      });
      if (exists) {
        continue;
      }
      if (merged.length >= REFERENCE_LIMIT) {
        toast(`最多支持 ${REFERENCE_LIMIT} 张参考图`, 'warning');
        break;
      }
      merged.push(item);
      appended = true;
    }

    if (!appended) return false;
    setReferenceItems(
      merged,
      merged.some((item) => String(item.parentPostId || '').trim()) ? 'parent_post' : mode
    );
    return true;
  }

  function hideReferenceMentionMenu() {
    activeMentionIndex = -1;
    if (!referenceMentionMenu) return;
    referenceMentionMenu.classList.add('hidden');
    referenceMentionMenu.innerHTML = '';
    lastMentionContext = null;
  }

  function getPromptMentionCandidates() {
    return referenceImages.map((item, index) => ({
      id: item.id,
      label: String(item.mentionLabel || getReferenceMentionLabel(index)).trim(),
      token: `@${String(item.mentionLabel || getReferenceMentionLabel(index)).trim()}`,
      originalId: String(item.parentPostId || '').trim(),
      imageUrl: String(item.previewUrl || item.sourceUrl || item.url || '').trim()
    }));
  }

  function updatePromptEditorEmptyState() {
    if (!promptRichInput) return;
    const hasContent = Array.from(promptRichInput.childNodes).some((node) => {
      if (node.nodeType === Node.TEXT_NODE) return String(node.textContent || '').length > 0;
      if (node.nodeType === Node.ELEMENT_NODE) return true;
      return false;
    });
    promptRichInput.classList.toggle('is-empty', !hasContent);
  }

  function createMentionChip(candidate) {
    const chip = document.createElement('span');
    chip.className = 'prompt-mention-chip react-renderer node-mention inline-flex align-middle';
    chip.contentEditable = 'false';
    chip.dataset.mentionToken = candidate.token;
    chip.dataset.mentionLabel = candidate.label;
    chip.dataset.originalId = candidate.originalId || '';
    chip.tabIndex = 0;

    const wrapper = document.createElement('div');
    wrapper.className = 'prompt-mention-chip-inner inline-flex items-center';
    wrapper.dataset.mentionType = 'attachment';
    wrapper.dataset.nodeViewWrapper = '';
    wrapper.style.whiteSpace = 'normal';

    if (candidate.imageUrl) {
      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'prompt-mention-chip-thumb-wrap';

      const thumb = document.createElement('img');
      thumb.className = 'prompt-mention-chip-thumb';
      thumb.src = candidate.imageUrl;
      thumb.alt = '';
      thumbWrap.appendChild(thumb);
      wrapper.appendChild(thumbWrap);
    }

    const label = document.createElement('span');
    label.className = 'prompt-mention-chip-label';
    label.textContent = candidate.token;
    wrapper.appendChild(label);
    chip.appendChild(wrapper);
    return chip;
  }

  function clearActivePromptChip() {
    if (!promptRichInput) return;
    promptRichInput.querySelectorAll('.prompt-mention-chip.is-active').forEach((node) => {
      node.classList.remove('is-active');
    });
  }

  function getSelectedPromptChip() {
    if (!promptRichInput || !window.getSelection) return null;
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    const startNode = range.startContainer;
    if (startNode && startNode.nodeType === Node.ELEMENT_NODE && startNode.classList && startNode.classList.contains('prompt-mention-chip')) {
      return startNode;
    }
    const parent = startNode && startNode.parentElement ? startNode.parentElement.closest('.prompt-mention-chip') : null;
    return parent && promptRichInput.contains(parent) ? parent : null;
  }

  function selectPromptChip(chip) {
    if (!chip || !promptRichInput) return;
    clearActivePromptChip();
    chip.classList.add('is-active');
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNode(chip);
    selection.removeAllRanges();
    selection.addRange(range);
    promptRichInput.focus();
  }

  function getChipAdjacentToSelection(direction = 'backward') {
    if (!promptRichInput || !window.getSelection) return null;
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    const startNode = range.startContainer;
    const offset = range.startOffset;

    if (range.collapsed) {
      if (startNode.nodeType === Node.TEXT_NODE) {
        const textLength = String(startNode.textContent || '').length;
        if (direction === 'backward' && offset !== 0) {
          return null;
        }
        if (direction === 'forward' && offset !== textLength) {
          return null;
        }
        const sibling = direction === 'backward' ? startNode.previousSibling : startNode.nextSibling;
        if (sibling && sibling.nodeType === Node.ELEMENT_NODE && sibling.classList && sibling.classList.contains('prompt-mention-chip')) {
          return sibling;
        }
      } else if (startNode.nodeType === Node.ELEMENT_NODE) {
        const neighbour = direction === 'backward' ? startNode.childNodes[offset - 1] : startNode.childNodes[offset];
        if (neighbour && neighbour.nodeType === Node.TEXT_NODE) {
          const neighbourText = String(neighbour.textContent || '');
          if (neighbourText.length > 0) {
            return null;
          }
        }
        const index = direction === 'backward' ? offset - 1 : offset;
        const candidate = startNode.childNodes[index];
        if (candidate && candidate.nodeType === Node.ELEMENT_NODE && candidate.classList && candidate.classList.contains('prompt-mention-chip')) {
          return candidate;
        }
      }
    } else if (startNode.nodeType === Node.ELEMENT_NODE && startNode.classList && startNode.classList.contains('prompt-mention-chip')) {
      return startNode;
    }
    return null;
  }

  function hasEditableTextNearSelection(direction = 'backward') {
    if (!promptRichInput || !window.getSelection) return false;
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return false;
    const range = selection.getRangeAt(0);
    if (!range.collapsed) return false;
    const startNode = range.startContainer;
    const offset = range.startOffset;

    if (startNode.nodeType === Node.TEXT_NODE) {
      const text = String(startNode.textContent || '');
      return direction === 'backward' ? offset > 0 : offset < text.length;
    }

    if (startNode.nodeType === Node.ELEMENT_NODE) {
      const neighbour = direction === 'backward' ? startNode.childNodes[offset - 1] : startNode.childNodes[offset];
      if (!neighbour) return false;
      if (neighbour.nodeType === Node.TEXT_NODE) {
        return String(neighbour.textContent || '').length > 0;
      }
      return false;
    }

    return false;
  }

  function serializePromptRichInput() {
    if (!promptRichInput) return '';
    const parts = [];
    promptRichInput.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        parts.push(node.textContent || '');
        return;
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node;
        if (el.classList && el.classList.contains('prompt-mention-chip')) {
          parts.push(el.dataset.mentionToken || el.textContent || '');
        } else {
          parts.push(el.textContent || '');
        }
      }
    });
    return parts.join('');
  }

  function setPromptTextareaValue(value) {
    if (!promptInput) return;
    if (promptInput.value === value) return;
    isSyncingPromptEditor = true;
    promptInput.value = value;
    promptInput.dispatchEvent(new Event('input', { bubbles: true }));
    isSyncingPromptEditor = false;
  }

  function resolvePromptMentionContext(range) {
    if (!promptRichInput || !range) return null;
    if (!promptRichInput.contains(range.startContainer)) return null;
    if (range.startContainer.nodeType !== Node.TEXT_NODE) return null;
    const textNode = range.startContainer;
    const before = String(textNode.textContent || '').slice(0, range.startOffset);
    const match = before.match(/@([^\s@]*)$/);
    if (!match) return null;
    return {
      textNode,
      startOffset: before.length - match[1].length - 1,
      endOffset: range.startOffset,
      query: match[1] || ''
    };
  }

  function getMentionContext() {
    if (!promptRichInput) return null;
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return null;
    return resolvePromptMentionContext(selection.getRangeAt(0));
  }

  function setCaretAfterNode(node) {
    if (!promptRichInput || !node) return;
    const range = document.createRange();
    range.setStartAfter(node);
    range.collapse(true);
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(range);
    promptRichInput.focus();
  }

  function syncPromptTextareaFromRichInput() {
    const value = serializePromptRichInput();
    setPromptTextareaValue(value);
    clearActivePromptChip();
    updatePromptEditorEmptyState();
  }

  function rebuildPromptRichInputFromText(value) {
    if (!promptRichInput) return;
    const raw = String(value || '');
    const tokenMap = new Map();
    getPromptMentionCandidates().forEach((item) => {
      tokenMap.set(item.token, item);
      if (item.originalId) {
        tokenMap.set(`@${item.originalId}`, item);
      }
    });

    promptRichInput.innerHTML = '';
    const tokenPattern = /@Image\s+\d+|@[0-9a-fA-F-]{32,36}/g;
    let lastIndex = 0;
    let match;
    while ((match = tokenPattern.exec(raw)) !== null) {
      const [token] = match;
      if (match.index > lastIndex) {
        promptRichInput.appendChild(document.createTextNode(raw.slice(lastIndex, match.index)));
      }
      const candidate = tokenMap.get(token);
      if (candidate) {
        promptRichInput.appendChild(createMentionChip(candidate));
      } else {
        promptRichInput.appendChild(document.createTextNode(token));
      }
      lastIndex = match.index + token.length;
    }
    if (lastIndex < raw.length) {
      promptRichInput.appendChild(document.createTextNode(raw.slice(lastIndex)));
    }
    updatePromptEditorEmptyState();
  }

  function syncPromptRichInputFromTextarea() {
    if (!promptInput || !promptRichInput || isSyncingPromptEditor) return;
    rebuildPromptRichInputFromText(promptInput.value || '');
  }

  function normalizePromptRichInputTokens(moveCaretToEnd = true) {
    if (!promptRichInput) return;
    rebuildPromptRichInputFromText(serializePromptRichInput());
    if (moveCaretToEnd) {
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(promptRichInput);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
    syncPromptTextareaFromRichInput();
  }

  function insertMentionLabel(labelOrCandidate) {
    if (!promptRichInput) return;
    const candidate = typeof labelOrCandidate === 'string'
      ? getPromptMentionCandidates().find((item) => item.label === labelOrCandidate)
      : labelOrCandidate;
    if (!candidate) return;

    const selection = window.getSelection();
    let range = null;
    if (selection && selection.rangeCount) {
      const currentRange = selection.getRangeAt(0);
      if (promptRichInput.contains(currentRange.startContainer)) {
        range = currentRange.cloneRange();
      }
    }
    if (!range && lastMentionRange) {
      range = lastMentionRange.cloneRange();
    }
    const context = resolvePromptMentionContext(range) || lastMentionContext;
    if (!context) {
      const chip = createMentionChip(candidate);
      promptRichInput.appendChild(chip);
      promptRichInput.appendChild(document.createTextNode(' '));
      normalizePromptRichInputTokens(true);
      hideReferenceMentionMenu();
      return;
    }

    if (context.textNode) {
      const raw = String(context.textNode.textContent || '');
      context.textNode.textContent = `${raw.slice(0, context.startOffset)}${raw.slice(context.endOffset)}`;
      const workingRange = document.createRange();
      workingRange.setStart(context.textNode, context.startOffset);
      workingRange.collapse(true);
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(workingRange);
      }
      range = workingRange;
    }

    const chip = createMentionChip(candidate);
    range.insertNode(chip);
    const trailingSpace = document.createTextNode(' ');
    chip.after(trailingSpace);
    setCaretAfterNode(trailingSpace);
    syncPromptTextareaFromRichInput();
    hideReferenceMentionMenu();
  }

  function renderReferenceMentionMenu() {
    if (!referenceMentionMenu || !promptRichInput) return;
    const ctx = getMentionContext();
    if (!ctx || !referenceImages.length) {
      hideReferenceMentionMenu();
      return;
    }
    const query = String(ctx.query || '').trim().toLowerCase();
    lastMentionContext = ctx;
    lastMentionRange = window.getSelection() && window.getSelection().rangeCount
      ? window.getSelection().getRangeAt(0).cloneRange()
      : lastMentionRange;
    const candidates = getPromptMentionCandidates().filter((item) => {
      return !query || item.label.toLowerCase().includes(query) || item.token.toLowerCase().includes(query);
    });
    if (!candidates.length) {
      hideReferenceMentionMenu();
      return;
    }
    if (activeMentionIndex < 0 || activeMentionIndex >= candidates.length) {
      activeMentionIndex = 0;
    }

    referenceMentionMenu.innerHTML = '';
    candidates.forEach((item, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'reference-mention-item';
      if (index === activeMentionIndex) {
        button.classList.add('is-active');
      }
      button.addEventListener('mousedown', (event) => {
        event.preventDefault();
        insertMentionLabel(item);
      });
      button.addEventListener('click', (event) => {
        event.preventDefault();
        insertMentionLabel(item);
      });

      if (item.imageUrl) {
        const thumb = document.createElement('img');
        thumb.className = 'reference-mention-thumb';
        thumb.src = item.imageUrl;
        thumb.alt = item.label;
        button.appendChild(thumb);
      }

      const label = document.createElement('div');
      label.className = 'reference-mention-label';
      label.textContent = item.label;
      button.appendChild(label);

      referenceMentionMenu.appendChild(button);
    });
    referenceMentionMenu.classList.remove('hidden');
  }

  function applyParentPostReference(text, options = {}) {
    const silent = Boolean(options.silent);
    const append = Boolean(options.append);
    const resolved = resolveReferenceByText(text);
    const raw = String(text || '').trim();
    const fallbackId = extractParentPostId(raw);
    const fallbackUrl = fallbackId ? pickSourceUrl({ sourceImageUrl: raw }, fallbackId, raw) : '';
    const finalParentId = resolved.parentPostId || fallbackId;
    const finalSourceUrl = resolved.sourceUrl || fallbackUrl;
    const finalPreviewUrl = resolved.url || finalSourceUrl;
    // 判定条件优化：只有当 ID 为空 且 预览 URL 均为空时才视作失败
    if (!finalParentId && !finalPreviewUrl) {
      if (!silent) {
        toast('未识别到有效 parentPostId', 'warning');
      }
      return false;
    }
    const targetItem = {
      id: makeReferenceId('parent'),
      previewUrl: finalPreviewUrl,
      sourceUrl: finalSourceUrl || finalPreviewUrl,
      url: finalPreviewUrl,
      parentPostId: finalParentId,
      name: finalParentId || 'parentPostId'
    };
    if (append) {
      appendReferenceItems([targetItem], 'parent_post');
    } else {
      setReferenceItems([targetItem], 'parent_post');
    }
    if (!silent) {
      toast(append ? '已追加参考图' : '已使用 parentPostId 填充参考图', 'success');
    }
    return true;
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
      currentExtendPostId = '';
      currentFileAttachmentId = '';
      if (workVideoObjectUrl) {
        try { URL.revokeObjectURL(workVideoObjectUrl); } catch (e) { /* ignore */ }
        workVideoObjectUrl = '';
      }
      if (workVideoFileInput) {
        workVideoFileInput.value = '';
      }
      if (enterEditBtn) enterEditBtn.disabled = true;
      closeEditPanel();
      updateHistoryCount();
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
    item.dataset.defaultTitle = title.textContent;
    
    const prompt = document.createElement('div');
    prompt.className = 'video-item-prompt hidden';

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

      const renameBtn = document.createElement('button');
      renameBtn.className = 'geist-button-outline text-xs px-3 video-rename';
      renameBtn.type = 'button';
      renameBtn.textContent = '重命名';
      renameBtn.disabled = true;

    const editBtn = document.createElement('button');
    editBtn.className = 'geist-button-outline text-xs px-3 video-edit';
    editBtn.type = 'button';
    editBtn.textContent = '编辑';
    editBtn.disabled = true;

    actions.appendChild(openBtn);
    actions.appendChild(downloadBtn);
    actions.appendChild(renameBtn);
    actions.appendChild(editBtn);
    header.appendChild(title);
    header.appendChild(prompt);

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
    syncVideoHistoryOrder();
    updateHistoryCount();
    return item;
  }

  function updateItemLinks(item, url) {
    if (!item) return;
    const openBtn = item.querySelector('.video-open');
    const downloadBtn = item.querySelector('.video-download');
    const renameBtn = item.querySelector('.video-rename');
    const editBtn = item.querySelector('.video-edit');
    const link = item.querySelector('.video-item-link');
    const safeUrl = url || '';
    item.dataset.url = safeUrl;
    item.dataset.completed = safeUrl ? '1' : '0';
    if (!item.dataset.name && safeUrl) {
      try {
        const pathname = new URL(safeUrl, window.location.origin).pathname || '';
        const filename = decodeURIComponent(pathname.split('/').pop() || '').trim();
        if (filename) {
          item.dataset.name = filename;
        }
      } catch (e) {
        const fallbackName = decodeURIComponent(String(safeUrl).split('/').pop() || '').trim();
        if (fallbackName) {
          item.dataset.name = fallbackName;
        }
      }
    }
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
    if (renameBtn) {
      renameBtn.disabled = !safeUrl;
    }
    if (editBtn) {
      editBtn.disabled = !safeUrl;
    }
    if (safeUrl) {
      item.classList.remove('is-pending');
    }
    applyVideoCardTitle(item);
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
    if (imageFileInput) {
      imageFileInput.value = '';
    }
    if (imageUrlInput) {
      imageUrlInput.value = '';
    }
    if (parentPostInput) {
      parentPostInput.value = '';
    }
    referenceImages = [];
    currentModeValue = 'upload';
    renderReferenceStrip();
    clearReferencePreview();
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

  function pickImageFilesFromDataTransfer(dataTransfer) {
    if (!dataTransfer) return [];
    const files = [];
    const pushIfImage = (file) => {
      if (!file) return;
      if (!String(file.type || '').startsWith('image/')) return;
      files.push(file);
    };
    if (dataTransfer.files && dataTransfer.files.length) {
      Array.from(dataTransfer.files).forEach(pushIfImage);
    }
    if (!files.length && dataTransfer.items && dataTransfer.items.length) {
      Array.from(dataTransfer.items).forEach((item) => {
        if (!item || item.kind !== 'file') return;
        const file = item.getAsFile ? item.getAsFile() : null;
        pushIfImage(file);
      });
    }
    return files;
  }

  function setRefDragActive(active) {
    if (!refDropZone) return;
    refDropZone.classList.toggle('dragover', Boolean(active));
  }

  async function applyReferenceImageFiles(files, sourceLabel) {
    const targets = Array.isArray(files) ? files.filter(Boolean) : [];
    if (!targets.length) return 0;
    const slotsLeft = Math.max(0, REFERENCE_LIMIT - referenceImages.length);
    if (slotsLeft <= 0) {
      toast(`最多支持 ${REFERENCE_LIMIT} 张参考图`, 'warning');
      return 0;
    }
    const accepted = targets.slice(0, slotsLeft);
    let added = 0;
    for (const file of accepted) {
      const mimeType = String(file.type || '');
      if (mimeType && !mimeType.startsWith('image/')) {
        continue;
      }
      const dataUrl = await readFileAsDataUrl(file);
      if (!dataUrl.startsWith('data:image/')) {
        continue;
      }
      referenceImages.push({
        id: makeReferenceId('upload'),
        previewUrl: dataUrl,
        sourceUrl: dataUrl,
        url: dataUrl,
        parentPostId: '',
        name: file.name || sourceLabel || '已选择图片',
        mentionLabel: getReferenceMentionLabel(referenceImages.length)
      });
      added += 1;
    }
    if (imageUrlInput) {
      imageUrlInput.value = '';
    }
    if (parentPostInput) {
      parentPostInput.value = '';
    }
    currentModeValue = 'upload';
    renderReferenceStrip();
    setReferencePreviewItems(referenceImages);
    if (sourceLabel && added > 0) {
      toast(`${sourceLabel}已载入 ${added} 张`, 'success');
    }
    if (targets.length > accepted.length) {
      toast(`最多支持 ${REFERENCE_LIMIT} 张参考图，已忽略超出部分`, 'warning');
    }
    return added;
  }

  function normalizeAuthHeader(authHeader) {
    if (!authHeader) return '';
    if (authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7).trim();
    }
    return authHeader;
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
    let refs = Array.isArray(referenceImages) ? referenceImages.slice() : [];
    if (!refs.length && (rawParent || rawUrl)) {
      const resolvedRef = resolveReferenceByText(rawParent || rawUrl);
      const manualRef = {
        id: makeReferenceId('manual'),
        previewUrl: resolvedRef.url || resolvedRef.sourceUrl || rawUrl,
        sourceUrl: resolvedRef.sourceUrl || rawUrl,
        url: resolvedRef.url || resolvedRef.sourceUrl || rawUrl,
        parentPostId: rawParent || resolvedRef.parentPostId || '',
        name: 'manual'
      };
      refs = [manualRef];
      setReferenceItems(refs, manualRef.parentPostId ? 'parent_post' : 'upload');
    }

    const referenceItems = refs.map((item, index) => ({
      parent_post_id: String(item && item.parentPostId ? item.parentPostId : '').trim(),
      image_url: String(item && (item.sourceUrl || item.url) ? (item.sourceUrl || item.url) : '').trim(),
      source_image_url: String(item && item.sourceUrl ? item.sourceUrl : '').trim(),
      mention_alias: String(item && item.mentionLabel ? item.mentionLabel : getReferenceMentionLabel(index)).trim()
    })).filter((item) => item.parent_post_id || item.image_url || item.source_image_url);

    const hasReferenceItems = referenceItems.length > 0;
    const primaryRef = hasReferenceItems ? null : (referenceItems[0] || null);
    const parentPostId = primaryRef ? String(primaryRef.parent_post_id || '').trim() : '';
    const imageUrl = primaryRef ? String(primaryRef.image_url || primaryRef.source_image_url || '').trim() : '';
    const sourceImageUrl = primaryRef ? String(primaryRef.source_image_url || primaryRef.image_url || '').trim() : '';

    const res = await fetch('/v1/public/video/start', {
      method: 'POST',
      headers: {
        ...buildAuthHeaders(authHeader),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt,
        image_url: hasReferenceItems ? null : (parentPostId ? null : (imageUrl || null)),
        parent_post_id: hasReferenceItems ? null : (parentPostId || null),
        source_image_url: hasReferenceItems ? null : (parentPostId ? (sourceImageUrl || null) : null),
        reference_items: referenceItems,
        reasoning_effort: DEFAULT_REASONING_EFFORT,
        aspect_ratio: ratioSelect ? ratioSelect.value : '3:2',
        video_length: lengthSelect ? parseInt(lengthSelect.value, 10) : 6,
        resolution_name: resolutionSelect ? resolutionSelect.value : '480p',
        preset: presetSelect ? presetSelect.value : 'normal',
        single_image_mode: singleImageModeSelect ? singleImageModeSelect.value : 'frame',
        concurrent: getConcurrentValue()
      })
    });
    if (!res.ok) {
      throw new Error(await parseApiErrorText(res, 'Failed to create task'));
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
    const mp4Matches = buffer.match(/https?:\/\/[^\s"'<>]+?\.mp4(?![a-zA-Z0-9])/gi);
    if (mp4Matches && mp4Matches.length) {
      return { url: mp4Matches[mp4Matches.length - 1] };
    }
    const localMatches = buffer.match(/(?:https?:\/\/[^\s"'<>]+)?\/v1\/files\/video\/[^\s"'<>]+?\.mp4(?![a-zA-Z0-9])/gi);
    if (localMatches && localMatches.length) {
      const last = localMatches[localMatches.length - 1];
      if (/^https?:\/\//i.test(last)) {
        return { url: last };
      }
      return { url: `${window.location.origin}${last}` };
    }
    return null;
  }

  function extractVideoUrlFromAnyText(text) {
    const raw = String(text || '');
    if (!raw) return '';
    const info = extractVideoInfo(raw);
    if (info && info.url) return info.url;
    const mp4 = raw.match(/https?:\/\/[^\s"'<>]+\.mp4(?![a-zA-Z0-9])/i);
    if (mp4 && mp4[0]) return mp4[0];
    const local = raw.match(/\/v1\/files\/video\/[^\s"'<>]+(?![a-zA-Z0-9])/i);
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
      enforceInlinePlayback(videoEl);
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
    body.innerHTML = `\n      <video controls preload="metadata" playsinline webkit-playsinline>\n        <source src="${safeUrl}" type="video/mp4">\n      </video>\n    `;
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

  function setPreviewPrompt(item, text) {
    if (!item) return;
    const promptEl = item.querySelector('.video-item-prompt');
    const promptText = String(text || '').trim();
    item.dataset.prompt = promptText;
    if (!promptEl) return;
    if (promptText) {
      promptEl.textContent = promptText;
      promptEl.classList.remove('hidden');
      return;
    }
    promptEl.textContent = '';
    promptEl.classList.add('hidden');
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

  function bindEditVideoSource(url, meta = {}) {
    const safeUrl = String(url || '').trim();
    selectedVideoUrl = safeUrl;
    selectedVideoMeta = {
      postId: String(meta.postId || '').trim(),
      shareLink: String(meta.shareLink || '').trim(),
      originalPostId: String(meta.originalPostId || '').trim(),
      name: String(meta.name || '').trim(),
      displayName: String(meta.displayName || '').trim(),
      defaultTitle: String(meta.defaultTitle || '').trim(),
    };
    if (editHint) {
      editHint.classList.toggle('hidden', Boolean(safeUrl));
    }
    applyResolvedVideoIdentity({ ...meta, url: safeUrl }, 'bindEditVideoSource');
    if (!editVideo) return;
    enforceInlinePlayback(editVideo);
    editVideo.src = safeUrl;
    editVideo.load();
    lockWorkspacePreviewSize();
    lockedFrameIndex = -1;
    lockedTimestampMs = 0;
    setEditMeta();
    syncTimelineAvailability();
  }

  function scrollToWorkspaceTop() {
    if (!editPanel || typeof editPanel.scrollIntoView !== 'function') return;
    editPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    bindEditVideoSource(url, item ? {
      postId: item.dataset.postId || '',
      shareLink: item.dataset.shareLink || '',
      originalPostId: item.dataset.originalPostId || '',
      name: item.dataset.name || '',
      displayName: item.dataset.displayName || '',
      defaultTitle: item.dataset.defaultTitle || '',
    } : {});
  }

  function closeEditPanel() {
    if (editHint) editHint.classList.remove('hidden');
    if (editBody) editBody.classList.remove('hidden');
    selectedVideoMeta = {};
  }

  function scheduleWorkspacePreviewLock(force = false) {
    setTimeout(() => lockWorkspacePreviewSize(force), 0);
    requestAnimationFrame(() => lockWorkspacePreviewSize(force));
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
      const postId = String(item.post_id || '');
      const shareLink = String(item.share_link || '');
      const originalPostId = String(item.original_post_id || '');
        const displayName = getVideoStoredTitle({
          postId,
          shareLink,
          url,
          displayName: item.display_name || '',
        }) || name || `video_${idx + 1}.mp4`;
      const size = formatBytes(item.size_bytes);
      const mtime = formatMtime(item.mtime_ms);
        return `<div class="cache-video-item" data-url="${url}" data-name="${name}" data-post-id="${postId}" data-share-link="${shareLink}" data-original-post-id="${originalPostId}" data-display-name="${String(item.display_name || '')}">
        <div class="cache-video-thumb-wrap">
          <video class="cache-video-thumb" src="${url}" preload="auto" muted playsinline></video>
        </div>
        <div class="cache-video-meta">
          <div class="cache-video-name">${displayName}</div>
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
    const activeUrlRaw = selectedVideoUrl;
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

  function useCachedVideo(url, name, meta = {}) {
    const safeUrl = String(url || '').trim();
    if (!safeUrl) return;
    selectedVideoItemId = `cache-${Date.now()}`;
    selectedVideoUrl = safeUrl;
    originalFileAttachmentId = '';
    applyResolvedVideoIdentity({ ...meta, name, url: safeUrl }, 'useCachedVideo');
    if (enterEditBtn) enterEditBtn.disabled = false;
    closeCacheVideoModal();
    bindEditVideoSource(safeUrl, {
      ...meta,
      name,
      displayName: String(meta.displayName || '').trim(),
      defaultTitle: String(name || '').trim(),
    });
    if (editHint) editHint.classList.add('hidden');
    if (editBody) editBody.classList.remove('hidden');
    setEditMeta();
  }

  function updateTimelineByVideoTime() {
    if (!editVideo || !editTimeline) return;
    const duration = Number(editVideo.duration || 0);
    if (!duration || !Number.isFinite(duration)) return;
    const current = Number(editVideo.currentTime || 0);
    const ratio = Math.max(0, Math.min(1, current / duration));
    editTimeline.value = String(Math.round(ratio * EDIT_TIMELINE_MAX));
    updateDeleteZoneTrack(editTimeline);
    lockedTimestampMs = clampEditTimestampMs(Math.round(current * 1000));
    if (editTimeText) editTimeText.textContent = formatMs(lockedTimestampMs);
  }

  function lockFrameByCurrentTime() {
    if (!editVideo) return;
    let currentTime = Number(editVideo.currentTime || 0);
    const duration = Number(editVideo.duration || 0);
    // 强制限制提取的秒数上限为 20s
    if (currentTime > 20) {
      currentTime = 20;
      if (editTimeText) {
        editTimeText.textContent = formatMs(clampEditTimestampMs(Math.round(currentTime * 1000))) + " (已达官方20s延长上限)";
      }
    }
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
    const promptText = promptInput ? String(promptInput.value || '').trim() : '';

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
      setPreviewPrompt(previewItem, promptText);
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
        single_image_mode: 'frame',
        concurrent,
        n: concurrent,
        edit_context: editCtx
      })
    });
    if (!res.ok) {
      throw new Error(await parseApiErrorText(res, 'create_edit_task_failed'));
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
          buffer += `${String(delta.content)}\n`;
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


  // ====== 视频延长（替代旧 runSplice） ======
  async function runExtendVideo() {
    debugLog('runExtendVideo:start');
    if (editingBusy) {
      toast('延长任务进行中', 'warning');
      return;
    }
    if (!selectedVideoUrl) {
      toast('请先选中视频并进入工作区', 'error');
      return;
    }
    if (!currentExtendPostId) {
      toast('无法识别当前视频的 postId，请从缓存选择视频', 'error');
      return;
    }
    const authHeader = await ensurePublicKey();
    if (authHeader === null) {
      toast('请先配置 Public Key', 'error');
      window.location.href = '/login';
      return;
    }
    const prompt = String(editPromptInput ? editPromptInput.value : '').trim();
    const extensionStartTime = Math.max(0, lockedTimestampMs / 1000);
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
    setStatus('connecting', '视频延长处理中');
    setIndeterminate(true);
    updateProgress(0);
    startAt = Date.now();
    startElapsedTimer();
    try {
      const nextRound = editingRound + 1;
      const concurrent = getConcurrentValue();

      const body = {
        prompt: prompt,
        aspect_ratio: ratioSelect ? ratioSelect.value : '16:9',
        video_length: editLengthSelect ? parseInt(editLengthSelect.value, 10) : 10,
        resolution_name: resolutionSelect ? resolutionSelect.value : '480p',
        preset: (!prompt || prompt.trim() === '') ? 'spicy' : (presetSelect ? presetSelect.value : 'normal'),
        reasoning_effort: typeof DEFAULT_REASONING_EFFORT !== 'undefined' ? DEFAULT_REASONING_EFFORT : null,
        concurrent,
        is_video_extension: true,
        extend_post_id: currentExtendPostId,
        video_extension_start_time: extensionStartTime,
        // original_post_id & file_attachment_id: 对齐官方抓包，始终传原始图片/视频 postId
        original_post_id: currentExtendPostId,
        file_attachment_id: originalFileAttachmentId || currentExtendPostId,
        stitch_with_extend: true,
      };
      debugLog('runExtendVideo:request', JSON.stringify(body));
      const resp = await fetch('/v1/public/video/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
        },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const errText = await parseApiErrorText(resp, '');
        throw new Error(`延长请求失败: ${resp.status} ${errText}`);
      }
      const result = await resp.json();
      const taskIds = result.task_ids || [result.task_id];
      spliceRun.taskIds = taskIds;
      debugLog('runExtendVideo:taskIds', taskIds);
      // 创建历史占位
      const serial = nextRound;
      for (const tid of taskIds) {
        const placeholder = initPreviewSlot();
        setPreviewTitle(placeholder, buildHistoryTitle('splice', serial));
        setPreviewPrompt(placeholder, prompt);
        if (placeholder) placeholder.dataset.taskId = tid;
        spliceRun.placeholders.set(tid, placeholder);
      }
      editingRound = nextRound;
      // 连接 SSE
      const rawPublicKey = normalizeAuthHeader(authHeader);
      for (const tid of taskIds) {
        const sseUrl = buildSseUrl(tid, rawPublicKey);
        const source = new EventSource(sseUrl);
        spliceRun.sources.add(source);
        const taskState = {
          progress: 0,
          videoUrl: '',
          done: false,
          error: false,
          progressBuffer: '',
          contentBuffer: '',
          collectingContent: false
        };
        source.onmessage = (event) => {
          if (spliceRun.cancelled) return;
          const raw = String(event.data || '').trim();
          console.log('[SSE 调试] 收到数据:', raw);
          if (raw === '[DONE]') {
            console.log('[SSE 调试] 收到 [DONE] 标记');
            taskState.done = true;
            source.close();
            checkAllExtendDone(spliceRun);
            return;
          }
          try {
            const parsed = JSON.parse(raw);
            if (parsed.error) {
              console.error('[SSE 调试] 解析到错误对象:', parsed.error);
              taskState.error = true;
              taskState.done = true;
              spliceRun.failedReasons.push(parsed.error);
              spliceRun.failedPlaceholders.add(tid);
              const item = spliceRun.placeholders.get(tid);
              if (item) {
                setPreviewTitle(item, `延长失败: ${parsed.error}`);
                item.classList.add('is-failed');
              }
              source.close();
              checkAllExtendDone(spliceRun);
              return;
            }

            const choice = parsed.choices && parsed.choices[0];
            const delta = choice && choice.delta ? choice.delta : null;
            if (delta && delta.content) {
              const text = delta.content;

              if (text.includes('<think>') || text.includes('</think>')) {
                return;
              }

              if (!taskState.collectingContent) {
                if (text.includes('<video') || text.includes('[video](') || text.includes('http://') || text.includes('https://') || text.includes('<https://')) {
                  taskState.collectingContent = true;
                }
              }

              if (taskState.collectingContent) {
                taskState.contentBuffer += `${text}\n`;
                const info = extractVideoInfo(taskState.contentBuffer);
                let videoUrl = (info && info.url) ? info.url : extractVideoUrlFromAnyText(taskState.contentBuffer);

                // 新增：提取 <source src="...">
                if (!videoUrl) {
                  const m = taskState.contentBuffer.match(/src="([^"]+\.mp4)"/i);
                  if (m) {
                    videoUrl = m[1];
                  }
                }

                if (videoUrl && !taskState.videoUrl) {
                  console.log('[SSE 调试] 解析到生成的视频 URL:', videoUrl);
                  taskState.videoUrl = videoUrl;
                  const item = spliceRun.placeholders.get(tid);
                  if (item) {
                    item.classList.remove('is-generating');
                    item.classList.remove('is-failed');
                    if (info && info.html) {
                      renderVideoFromHtml({ previewItem: item }, info.html);
                    } else {
                      renderVideoFromUrl({ previewItem: item }, videoUrl);
                    }
                  }



                  // 更新工作区视频和 extendPostId
                  selectedVideoUrl = videoUrl;
                  if (editVideo) {
                    editVideo.src = videoUrl;
                    editVideo.load();
                  }
                  // 优先从 create-link 元数据对应的 post_id，最后才回退到 URL
                  const newPostId = applyResolvedVideoIdentity({ url: videoUrl }, 'extend-sse');
                  if (newPostId) {
                    if (item) {
                      item.dataset.postId = newPostId;
                    }
                    console.log('[SSE 调试] 从新视频成功提取到新的 extend_post_id:', newPostId);
                  } else {
                    console.warn('[SSE 调试] 未能从新视频地址提取出新的 extend_post_id!', videoUrl);
                  }
                  setEditMeta();
                  toast('视频延长完成', 'success');
                }
              } else {
                taskState.progressBuffer += text;
                // 从缓冲中匹配所有可能是进度的数字，包括带换行的文本
                const matches = [...taskState.progressBuffer.matchAll(/当前进度\s*(\d+)\s*%/g)];
                if (matches.length) {
                  const lastValue = parseInt(matches[matches.length - 1][1], 10);
                  if (lastValue >= taskState.progress) {
                    taskState.progress = lastValue;
                    setIndeterminate(false);
                    updateProgress(taskState.progress);
                  }
                }
                if (text.includes('超分辨率')) {
                  setStatus('connecting', '超分辨率中');
                  setIndeterminate(true);
                }

                // 定期清理过长的缓冲
                if (taskState.progressBuffer.length > 500) {
                  taskState.progressBuffer = taskState.progressBuffer.slice(-200);
                }
              }
            }
          } catch (e) {
            // debugLog('runExtendVideo:parse_error', e); // ignore chunks split issues
          }
        };
        source.onerror = (err) => {
          console.error('[SSE 调试] EventSource 抛出 onerror 异常', err);
          taskState.error = true;
          taskState.done = true;
          source.close();
          checkAllExtendDone(spliceRun);
        };
      }
    } catch (e) {
      debugLog('runExtendVideo:error', e);
      toast(String(e.message || '视频延长失败'), 'error');
      setStatus('error', '延长失败');
      spliceRun.done = true;
      activeSpliceRun = null;
      editingBusy = false;
      setEditTimelineLock(false);
      setSpliceButtonState('idle');
    }
  }

  function checkAllExtendDone(spliceRun) {
    const allDone = [...spliceRun.placeholders.keys()].every(tid => {
      return spliceRun.failedPlaceholders.has(tid) ||
        (spliceRun.placeholders.get(tid) && spliceRun.placeholders.get(tid).dataset.completed === '1');
    });
    // 简化判断：所有 SSE 都关闭就算完成
    let openSources = 0;
    for (const src of spliceRun.sources) {
      if (src.readyState !== EventSource.CLOSED) openSources++;
    }
    if (openSources > 0) return;
    spliceRun.done = true;
    activeSpliceRun = null;
    editingBusy = false;
    setEditTimelineLock(false);
    setSpliceButtonState('idle');
    stopElapsedTimer();
    setIndeterminate(false);
    if (!spliceRun.failedReasons.length) {
      updateProgress(100);
    }
    if (spliceRun.failedReasons.length) {
      setStatus('error', '延长部分失败');
    } else {
      setStatus('connected', '延长完成');
    }
  }

  async function requestCancelExtend() {
    if (!activeSpliceRun || activeSpliceRun.done) return;
    activeSpliceRun.cancelled = true;
    activeSpliceRun.cancelling = true;
    setSpliceButtonState('stopping');
    for (const src of activeSpliceRun.sources) {
      try { src.close(); } catch (e) { /* ignore */ }
    }
    const taskIdsToStop = Array.from(activeSpliceRun.taskIds || []);
    activeSpliceRun.done = true;
    activeSpliceRun = null;
    editingBusy = false;
    setEditTimelineLock(false);
    setSpliceButtonState('idle');
    stopElapsedTimer();
    setIndeterminate(false);
    setStatus('disconnected', '已取消');
    toast('已中止延长', 'info');

    if (taskIdsToStop.length > 0) {
      const authHeader = await ensurePublicKey();
      stopVideoTask(taskIdsToStop, authHeader).catch(e => console.error('[SSE] 延长中止请求失败', e));
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

  async function handleEditVideoRename() {
      const meta = getCurrentEditVideoMeta();
      if (!meta.url) {
        toast('请先选择一个已生成视频', 'warning');
        return;
      }
      const currentTitle = resolveEditVideoDisplayName(meta);
      const nextTitle = await openRenameDialog(currentTitle === '-' ? '' : currentTitle);
      if (nextTitle === null) return;
      const safeTitle = String(nextTitle || '').trim();
      try {
        const result = await persistVideoStoredTitle({
          postId: meta.postId,
          shareLink: meta.shareLink,
          originalPostId: meta.originalPostId,
          name: meta.name,
          url: meta.url,
        }, safeTitle);
        applyRenamedVideoState(meta, String(result.display_name || ''));
        toast(safeTitle ? '已更新视频名称' : '已恢复默认名称', 'success');
      } catch (error) {
        console.warn('[工作区视频重命名] 保存失败', {
          error: String(error && error.message ? error.message : error || ''),
          postId: meta.postId,
          shareLink: meta.shareLink,
          originalPostId: meta.originalPostId,
          name: meta.name,
          url: meta.url,
        });
        toast('视频名称保存失败', 'error');
      }
  }

  function bindRenameGesture(element, handler) {
    if (!(element instanceof HTMLElement) || typeof handler !== 'function') return;
    element.addEventListener('dblclick', handler);
    element.addEventListener('touchend', (event) => {
      if (!event.cancelable) return;
      const now = Date.now();
      if (now - editVideoNameTapTimer > 320) {
        editVideoNameTapCount = 0;
      }
      editVideoNameTapTimer = now;
      editVideoNameTapCount += 1;
      if (editVideoNameTapCount >= 2) {
        editVideoNameTapCount = 0;
        event.preventDefault();
        handler(event);
      }
    }, { passive: false });
  }

  if (editVideoName) {
    bindRenameGesture(editVideoName, handleEditVideoRename);
  }
  if (editVideoNameCard) {
    bindRenameGesture(editVideoNameCard, handleEditVideoRename);
  }

  if (editTimeline) {
    editTimeline.addEventListener('input', () => {
      if (!editVideo) return;
      const duration = Number(editVideo.duration || 0);
      if (!Number.isFinite(duration) || duration <= 0) return;
      const ratio = Number(editTimeline.value || 0) / EDIT_TIMELINE_MAX;
      let nextTime = Math.max(0, Math.min(duration, duration * ratio));
      // 官方限制最多延长至 30s，即起始点不晚于 20s
      if (nextTime > 20) {
        nextTime = 20;
        // 强制回弹对应的 UI 表现
        const forceRatio = 20 / duration;
        editTimeline.value = String(Math.round(forceRatio * EDIT_TIMELINE_MAX));
      }
      editVideo.currentTime = nextTime;
      updateDeleteZoneTrack(editTimeline);
      lockedTimestampMs = clampEditTimestampMs(Math.round(nextTime * 1000));
      if (editTimeText) {
        editTimeText.textContent = formatMs(lockedTimestampMs);
        if (nextTime === 20 && duration > 20) {
          editTimeText.textContent += " (已达官方20s延长上限)";
        }
      }
      lockFrameByCurrentTime();
    });
  }

  if (editVideo) {
    enforceInlinePlayback(editVideo);
    editVideo.addEventListener('loadedmetadata', () => {
      lockWorkspacePreviewSize();
      const duration = Number(editVideo.duration || 0);
      if (editDurationText) {
        editDurationText.textContent = duration > 0
          ? `总时长 ${formatMs(duration * 1000)}`
          : '总时长 -';
      }
      lockedTimestampMs = 0;
      lockedFrameIndex = 0;

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

  window.addEventListener('load', () => {
    scheduleWorkspacePreviewLock(true);
  });
  window.addEventListener('resize', () => {
    workspacePreviewSizeLocked = false;
    scheduleWorkspacePreviewLock(true);
  });
  window.addEventListener('orientationchange', () => {
    workspacePreviewSizeLocked = false;
    setTimeout(() => scheduleWorkspacePreviewLock(true), 160);
  });


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
      useCachedVideo(row.getAttribute('data-url') || '', row.getAttribute('data-name') || '', {
        postId: row.getAttribute('data-post-id') || '',
        shareLink: row.getAttribute('data-share-link') || '',
        originalPostId: row.getAttribute('data-original-post-id') || '',
        displayName: row.getAttribute('data-display-name') || '',
      });
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
        // 提取 postId 用于延长
        const postId = resolveVideoPostId({
          postId: item.dataset.postId || '',
          shareLink: item.dataset.shareLink || '',
          originalPostId: item.dataset.originalPostId || '',
          name: item.dataset.name || '',
          url: bUrl,
        });
        if (postId) {
          currentExtendPostId = postId;
          currentFileAttachmentId = postId;
          setEditMeta();
          toast('已提取该视频的 postId', 'success');
        } else {
          toast('无法从该视频提取 postId', 'warning');
        }
        return;
      }
      selectedVideoItemId = String(item.dataset.index || '');
      selectedVideoUrl = String(item.dataset.url || '');
      refreshVideoSelectionUi();
      if (enterEditBtn) {
        enterEditBtn.disabled = !selectedVideoUrl;
      }

      if (target.classList.contains('video-edit')) {
        event.preventDefault();
        openEditPanel();
        return;
      }
        if (target.classList.contains('video-rename')) {
          event.preventDefault();
          const currentTitle = String(item.querySelector('.video-item-title')?.textContent || '').trim();
          const nextTitle = await openRenameDialog(currentTitle);
          if (nextTitle === null) return;
          const safeTitle = String(nextTitle || '').trim();
          try {
            const result = await persistVideoStoredTitle({
              postId: item.dataset.postId || '',
              shareLink: item.dataset.shareLink || '',
              originalPostId: item.dataset.originalPostId || '',
              name: item.dataset.name || '',
              url: item.dataset.url || '',
            }, safeTitle);
            applyRenamedVideoState({
              item,
              postId: item.dataset.postId || '',
              shareLink: item.dataset.shareLink || '',
              originalPostId: item.dataset.originalPostId || '',
              name: item.dataset.name || '',
              url: item.dataset.url || '',
            }, String(result.display_name || ''));
          } catch (error) {
            console.warn('[视频重命名] 保存失败', {
              error: String(error && error.message ? error.message : error || ''),
              postId: item.dataset.postId || '',
              shareLink: item.dataset.shareLink || '',
              originalPostId: item.dataset.originalPostId || '',
              name: item.dataset.name || '',
              url: item.dataset.url || '',
            });
            toast('视频名称保存失败', 'error');
            return;
          }
          toast(safeTitle ? '已更新视频名称' : '已恢复默认名称', 'success');
          return;
        }
      if (!target.classList.contains('video-download')) {
        bindEditVideoSource(selectedVideoUrl, {
          postId: item.dataset.postId || '',
          shareLink: item.dataset.shareLink || '',
          originalPostId: item.dataset.originalPostId || '',
          name: item.dataset.name || '',
          displayName: item.dataset.displayName || '',
          defaultTitle: item.dataset.defaultTitle || '',
        });
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
        // 文件名包含 postId：grok_video_{postId}_{index}.mp4
        const postIdInUrl = extractPostIdFromFileName(url);
        const nameParts = ['grok_video'];
        if (postIdInUrl) nameParts.push(postIdInUrl);
        if (index) nameParts.push(index);
        anchor.download = `${nameParts.join('_')}.mp4`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(blobUrl);
      } catch (e) {
        toast('下载失败，请检查视频链接是否可访问', 'error');
      }
    });
  }

  if (videoHistoryReverseBtn) {
    videoHistoryReverseBtn.addEventListener('click', () => {
      videoHistoryReversed = !videoHistoryReversed;
      syncVideoHistoryOrder();
      updateHistoryCount();
    });
  }

  if (imageFileInput) {
    imageFileInput.addEventListener('change', async () => {
      const files = imageFileInput.files ? Array.from(imageFileInput.files) : [];
      if (!files.length) {
        clearFileSelection();
        return;
      }
      try {
        await applyReferenceImageFiles(files, '上传图片');
      } catch (e) {
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
      applyParentPostReference(parentPostInput ? parentPostInput.value : '', { append: true });
    });
  }

  if (parentPostInput) {
    parentPostInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        applyParentPostReference(parentPostInput.value, { append: true });
      }
    });
    parentPostInput.addEventListener('input', () => {
      const raw = parentPostInput.value.trim();
      if (!raw) {
        if (!referenceImages.length) {
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
      event.stopPropagation();
      parentPostInput.value = text;
      applyParentPostReference(text, { silent: true, append: true });
    });
  }

  if (imageUrlInput) {
    imageUrlInput.addEventListener('input', () => {
      const raw = imageUrlInput.value.trim();
      if (!raw) {
        if (parentPostInput) {
          parentPostInput.value = '';
        }
        if (!referenceImages.length) {
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
      setReferenceItems([{
        id: makeReferenceId('url'),
        previewUrl: resolved.url || resolved.sourceUrl || raw,
        sourceUrl: resolved.sourceUrl || raw,
        url: resolved.url || resolved.sourceUrl || raw,
        parentPostId: resolved.parentPostId || '',
        name: 'url'
      }], resolved.parentPostId ? 'parent_post' : 'upload');
    });
    imageUrlInput.addEventListener('paste', (event) => {
      const text = String(event.clipboardData ? event.clipboardData.getData('text') || '' : '').trim();
      if (!text) return;
      event.preventDefault();
      event.stopPropagation();
      imageUrlInput.value = text;
      const applied = applyParentPostReference(text, { silent: true, append: true });
      if (!applied) {
        const resolved = resolveReferenceByText(text);
        if (resolved.parentPostId && parentPostInput) {
          parentPostInput.value = resolved.parentPostId;
        }
        appendReferenceItems([{
          id: makeReferenceId('url'),
          previewUrl: resolved.url || resolved.sourceUrl || text,
          sourceUrl: resolved.sourceUrl || text,
          url: resolved.url || resolved.sourceUrl || text,
          parentPostId: resolved.parentPostId || '',
          name: 'url'
        }], resolved.parentPostId ? 'parent_post' : 'upload');
      }
    });
  }

  document.addEventListener('paste', async (event) => {
    const dataTransfer = event.clipboardData;
    if (!dataTransfer) return;
    const imageFiles = pickImageFilesFromDataTransfer(dataTransfer);
    if (imageFiles.length) {
      event.preventDefault();
      try {
        await applyReferenceImageFiles(imageFiles, '粘贴图片');
      } catch (e) {
        toast(String(e && e.message ? e.message : '图片读取失败'), 'error');
      }
      return;
    }
    const text = String(dataTransfer.getData('text') || '').trim();
    if (!text) return;
    const target = event.target;
    const isTypingInPrompt = target === promptInput;
    const isTypingInParentInput = target === parentPostInput;
    const isTypingInImageUrlInput = target === imageUrlInput;
    if (isTypingInPrompt) return;
    if (!isTypingInParentInput && !isTypingInImageUrlInput && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable)) {
      return;
    }
    const applied = applyParentPostReference(text, { silent: true, append: true });
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
      const files = pickImageFilesFromDataTransfer(event.dataTransfer);
      if (!files.length) {
        toast('未检测到可用图片文件', 'warning');
        return;
      }
      try {
        await applyReferenceImageFiles(files, '拖拽图片');
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

  if (promptRichInput) {
    promptRichInput.addEventListener('input', () => {
      syncPromptTextareaFromRichInput();
      renderReferenceMentionMenu();
    });
    promptRichInput.addEventListener('click', (event) => {
      const chip = event.target instanceof Element ? event.target.closest('.prompt-mention-chip') : null;
      if (chip) {
        event.preventDefault();
        selectPromptChip(chip);
        hideReferenceMentionMenu();
        return;
      }
      clearActivePromptChip();
      renderReferenceMentionMenu();
    });
    promptRichInput.addEventListener('focus', () => {
      renderReferenceMentionMenu();
    });
    promptRichInput.addEventListener('blur', () => {
      window.setTimeout(() => hideReferenceMentionMenu(), 120);
    });
    promptRichInput.addEventListener('keydown', (event) => {
      const hasOpenMentionMenu = referenceMentionMenu && !referenceMentionMenu.classList.contains('hidden');
      if (hasOpenMentionMenu && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        const total = referenceMentionMenu.querySelectorAll('.reference-mention-item').length;
        if (total > 0) {
          event.preventDefault();
          if (event.key === 'ArrowDown') {
            activeMentionIndex = (activeMentionIndex + 1 + total) % total;
          } else {
            activeMentionIndex = (activeMentionIndex - 1 + total) % total;
          }
          renderReferenceMentionMenu();
          return;
        }
      }
      if (hasOpenMentionMenu && event.key === 'Enter') {
        const active = referenceMentionMenu.querySelector('.reference-mention-item.is-active .reference-mention-label');
        if (active) {
          event.preventDefault();
          const candidate = getPromptMentionCandidates().find((item) => item.label === (active.textContent || ''));
          if (candidate) {
            insertMentionLabel(candidate);
          }
          return;
        }
      }
      if (hasOpenMentionMenu && event.key === 'Escape') {
        hideReferenceMentionMenu();
        return;
      }
      const selectedChip = getSelectedPromptChip();
      if ((event.key === 'Backspace' || event.key === 'Delete') && selectedChip) {
        event.preventDefault();
        selectedChip.remove();
        syncPromptTextareaFromRichInput();
        return;
      }
      if (event.key === 'Backspace' && hasEditableTextNearSelection('backward')) {
        return;
      }
      if (event.key === 'Delete' && hasEditableTextNearSelection('forward')) {
        return;
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        const direction = event.key === 'Backspace' ? 'backward' : 'forward';
        const adjacentChip = getChipAdjacentToSelection(direction);
        if (adjacentChip) {
          event.preventDefault();
          if (adjacentChip.classList.contains('is-active')) {
            adjacentChip.remove();
            syncPromptTextareaFromRichInput();
          } else {
            selectPromptChip(adjacentChip);
          }
          return;
        }
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const adjacentChip = getChipAdjacentToSelection(event.key === 'ArrowLeft' ? 'backward' : 'forward');
        if (adjacentChip) {
          event.preventDefault();
          selectPromptChip(adjacentChip);
          return;
        }
      }
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        startConnection();
      }
    });
  }
  if (promptInput) {
    promptInput.addEventListener('input', () => {
      syncPromptRichInputFromTextarea();
      renderReferenceMentionMenu();
    });
  }

  document.addEventListener('click', (event) => {
    if (!referenceMentionMenu || referenceMentionMenu.classList.contains('hidden')) return;
    if (promptRichInput && promptRichInput.contains(event.target)) return;
    if (referenceMentionMenu.contains(event.target)) return;
    hideReferenceMentionMenu();
  });

  [ratioSelect, lengthSelect, resolutionSelect, presetSelect, concurrentSelect, singleImageModeSelect]
    .filter(Boolean)
    .forEach((el) => {
      el.addEventListener('change', updateMeta);
    });

  updateMeta();
  syncVideoHistoryOrder();
  updateHistoryCount();
  refreshAllDeleteZoneTracks();
  syncTimelineAvailability();
  setSpliceButtonState('idle');
  syncPromptRichInputFromTextarea();

  if (spliceBtn) {
    spliceBtn.addEventListener('click', () => {
      if (activeSpliceRun && !activeSpliceRun.done) {
        requestCancelExtend();
        return;
      }
      runExtendVideo();
    });
  }
  if (imageUrlInput && imageUrlInput.value.trim()) {
    const resolved = resolveReferenceByText(imageUrlInput.value.trim());
    setReferenceItems([{
      id: makeReferenceId('init'),
      previewUrl: resolved.url || resolved.sourceUrl || imageUrlInput.value.trim(),
      sourceUrl: resolved.sourceUrl || imageUrlInput.value.trim(),
      url: resolved.url || resolved.sourceUrl || imageUrlInput.value.trim(),
      parentPostId: resolved.parentPostId || '',
      name: 'init'
    }], resolved.parentPostId ? 'parent_post' : 'upload');
    if (resolved.parentPostId && parentPostInput && !parentPostInput.value.trim()) {
      parentPostInput.value = resolved.parentPostId;
    }
  } else {
    renderReferenceStrip();
    clearReferencePreview();
  }

  // ─── 移动端底部 Sticky 操作栏逻辑 ───────────────────────────────────────
  (function initMobileActionBar() {
    const bar = document.getElementById('mobileActionBar');
    if (!bar) return;

    const slotGenerate    = document.getElementById('mobileBarGenerate');
    const slotSplice      = document.getElementById('mobileBarSplice');
    const mobileStart     = document.getElementById('mobileStartBtn');
    const mobileStop      = document.getElementById('mobileStopBtn');
    const mobileSplice    = document.getElementById('mobileSpliceBtn');
    const settingsBtn     = document.getElementById('mobileSettingsBtn');
    const settingsOverlay = document.getElementById('mobileSettingsOverlay');
    // settings-card：作为 bottom sheet 使用
    const settingsCard = document.querySelector('.video-settings-card');
    let scOriginalParent = null;
    let scOriginalNextSibling = null;

    function isMobile() {
      return window.matchMedia('(max-width: 768px)').matches;
    }

    // ── 将 settings-card 移到 body 直接子，避免祖先层叠上下文干扰 position:fixed ──
    function moveCardToBody() {
      if (!settingsCard || settingsCard.parentElement === document.body) return;
      scOriginalParent = settingsCard.parentElement;
      scOriginalNextSibling = settingsCard.nextElementSibling;
      document.body.appendChild(settingsCard);
    }

    function moveCardBack() {
      if (!settingsCard || settingsCard.parentElement !== document.body) return;
      if (scOriginalParent) {
        scOriginalNextSibling
          ? scOriginalParent.insertBefore(settingsCard, scOriginalNextSibling)
          : scOriginalParent.appendChild(settingsCard);
      }
    }

    // ── 齿轮：生成参数 Bottom Sheet 开关 ──
    function openSettingsSheet() {
      document.body.classList.add('mobile-settings-open');
      if (settingsBtn) settingsBtn.setAttribute('aria-expanded', 'true');
    }

    function closeSettingsSheet() {
      document.body.classList.remove('mobile-settings-open');
      if (settingsBtn) settingsBtn.setAttribute('aria-expanded', 'false');
    }

    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        document.body.classList.contains('mobile-settings-open')
          ? closeSettingsSheet()
          : openSettingsSheet();
      });
    }

    // 点击遮罩关闭
    if (settingsOverlay) {
      settingsOverlay.addEventListener('click', closeSettingsSheet);
    }

    // Esc 键关闭
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.body.classList.contains('mobile-settings-open')) {
        closeSettingsSheet();
      }
    });

    // resize：移动端时把节点移到 body，桌面端时关闭 sheet 并移回原位
    window.addEventListener('resize', () => {
      if (isMobile()) {
        moveCardToBody();
      } else {
        closeSettingsSheet();
        moveCardBack();
      }
    });

    // ── 按钮代理：点击 sticky bar 按钮 = 点击原始按钮 ──
    if (mobileStart) {
      mobileStart.addEventListener('click', () => {
        const running = stopBtn && !stopBtn.classList.contains('hidden');
        if (running) {
          if (stopBtn && !stopBtn.disabled) stopBtn.click();
        } else {
          if (startBtn && !startBtn.disabled) startBtn.click();
        }
      });
    }
    if (mobileSplice) {
      mobileSplice.addEventListener('click', () => {
        if (spliceBtn && !spliceBtn.disabled) spliceBtn.click();
      });
    }

    // ── 同步生成按钮状态（running / idle）到一体切换按钮 ──
    function syncGenerateSlotState() {
      if (!mobileStart) return;
      const running = stopBtn && !stopBtn.classList.contains('hidden');
      // 切换图标
      const playIcon = mobileStart.querySelector('.mobile-gen-play');
      const stopIcon = mobileStart.querySelector('.mobile-gen-stop');
      const label = mobileStart.querySelector('.mobile-gen-label');
      if (playIcon) playIcon.style.display = running ? 'none' : '';
      if (stopIcon) stopIcon.style.display = running ? '' : 'none';
      if (label) label.textContent = running ? '停止' : '开始生成';
      mobileStart.className = running
        ? 'geist-button mobile-action-btn gap-2 is-stop'
        : 'geist-button mobile-action-btn gap-2';
      mobileStart.disabled = !running && Boolean(startBtn && startBtn.disabled);
    }

    if (startBtn || stopBtn) {
      const syncObserver = new MutationObserver(syncGenerateSlotState);
      [startBtn, stopBtn].filter(Boolean).forEach((el) => {
        syncObserver.observe(el, { attributes: true, attributeFilter: ['class', 'disabled'] });
      });
    }

    // ── IntersectionObserver：监听 #editPanel 可见性，切换操作插槽 ──
    const targetPanel = document.getElementById('editPanel');
    if (targetPanel && 'IntersectionObserver' in window) {
      let spliceVisible = false;
      const io = new IntersectionObserver(
        (entries) => {
          if (!isMobile()) return;
          entries.forEach((entry) => { spliceVisible = entry.isIntersecting; });
          if (slotGenerate) slotGenerate.classList.toggle('mobile-action-slot--active', !spliceVisible);
          if (slotSplice)   slotSplice.classList.toggle('mobile-action-slot--active', spliceVisible);
        },
        { threshold: 0.7 }
      );
      io.observe(targetPanel);
    }

    // ── 延长视频 sticky 按钮文本 & 状态同步 ──
    function syncSpliceBtnState() {
      if (!mobileSplice || !spliceBtn) return;
      mobileSplice.disabled = spliceBtn.disabled;
      mobileSplice.classList.toggle('is-running', spliceBtn.classList.contains('is-running'));
      mobileSplice.classList.toggle('is-stopping', spliceBtn.classList.contains('is-stopping'));
      mobileSplice.innerHTML = spliceBtn.innerHTML;
    }
    if (spliceBtn) {
      new MutationObserver(syncSpliceBtnState)
        .observe(spliceBtn, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled'] });
    }

    // 初始化状态
    if (isMobile()) moveCardToBody(); // 移到 body 直接子，确保 position:fixed 相对视口
    syncGenerateSlotState();
    syncSpliceBtnState();
  })();

})();
