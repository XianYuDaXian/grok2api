(() => {
  const modelSelect = document.getElementById('modelSelect');
  const modelPicker = document.getElementById('modelPicker');
  const modelPickerBtn = document.getElementById('modelPickerBtn');
  const modelPickerLabel = document.getElementById('modelPickerLabel');
  const modelPickerMenu = document.getElementById('modelPickerMenu');
  const reasoningSelect = document.getElementById('reasoningSelect');
  const tempRange = document.getElementById('tempRange');
  const tempValue = document.getElementById('tempValue');
  const topPRange = document.getElementById('topPRange');
  const topPValue = document.getElementById('topPValue');
  const systemInput = document.getElementById('systemInput');
  const promptInput = document.getElementById('promptInput');
  const sendBtn = document.getElementById('sendBtn');
  const settingsToggle = document.getElementById('settingsToggle');
  const settingsPanel = document.getElementById('settingsPanel');
  const chatLog = document.getElementById('chatLog');
  const emptyState = document.getElementById('emptyState');
  const statusText = document.getElementById('statusText');
  const attachBtn = document.getElementById('attachBtn');
  const fileInput = document.getElementById('fileInput');
  const fileBadge = document.getElementById('fileBadge');
  const chatSidebar = document.getElementById('chatSidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const newChatBtn = document.getElementById('newChatBtn');
  const collapseSidebarBtn = document.getElementById('collapseSidebarBtn');
  const sidebarExpandBtn = document.getElementById('sidebarExpandBtn');
  const sessionListEl = document.getElementById('sessionList');

  let messageHistory = [];
  let isSending = false;
  let abortController = null;
  let attachments = [];
  let availableModels = [];
  let activeStreamInfo = null;
  let sessionsData = null;
  let followStreamScroll = true;
  let suppressScrollTracking = false;
  let userLockedStreamScroll = false;
  const feedbackUrl = 'https://github.com/chenyme/grok2api/issues/new';
  const STORAGE_KEY = 'grok2api_chat_sessions';
  const SIDEBAR_STATE_KEY = 'grok2api_chat_sidebar_collapsed';
  const MAX_CONTEXT_MESSAGES = 30;
  const AUTO_SCROLL_THRESHOLD = 48;
  const DEFAULT_SESSION_TITLES = ['新会话', 'New Session'];
  const SEND_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"></path><path d="M22 2L15 22L11 13L2 9L22 2Z"></path></svg>';
  const STOP_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"></rect></svg>';

  function generateId() {
    return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function isDefaultTitleValue(title) {
    return DEFAULT_SESSION_TITLES.includes(title);
  }

  function getMessageDisplay(msg) {
    if (!msg) return '';
    if (typeof msg.content === 'string') return msg.content;
    if (typeof msg.display === 'string' && msg.display.trim()) return msg.display;
    if (Array.isArray(msg.content)) {
      const textParts = [];
      let fileCount = 0;
      for (const block of msg.content) {
        if (!block) continue;
        if (block.type === 'text' && block.text) {
          textParts.push(block.text);
        }
        if (block.type === 'file') {
          fileCount += 1;
        }
      }
      const suffix = fileCount > 0 ? `\n[文件] ${fileCount} 个` : '';
      return `${textParts.join('\n')}${suffix}`.trim() || '（复合内容）';
    }
    return '（复合内容）';
  }

  function serializeMessage(msg) {
    if (!msg || typeof msg !== 'object') return msg;
    if (Array.isArray(msg.content)) {
      return {
        ...msg,
        content: getMessageDisplay(msg)
      };
    }
    return msg;
  }

  function saveSessions() {
    if (!sessionsData) return;
    const snapshot = {
      activeId: sessionsData.activeId,
      sessions: sessionsData.sessions.map((session) => ({
        ...session,
        messages: Array.isArray(session.messages) ? session.messages.map(serializeMessage) : []
      }))
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch (e) {
      toast('会话保存失败，可能是浏览器存储空间不足', 'error');
    }
  }

  function getActiveSession() {
    if (!sessionsData) return null;
    return sessionsData.sessions.find((s) => s.id === sessionsData.activeId) || null;
  }

  function trimMessageHistory(maxCount = MAX_CONTEXT_MESSAGES) {
    if (!maxCount || maxCount <= 0) return;
    if (messageHistory.length <= maxCount) return;
    messageHistory = messageHistory.slice(-maxCount);
    const session = getActiveSession();
    if (session) {
      session.messages = messageHistory.slice();
      session.updatedAt = Date.now();
      saveSessions();
      renderSessionList();
    }
  }

  function restoreActiveSession() {
    const session = getActiveSession();
    if (!session) return;
    messageHistory = Array.isArray(session.messages) ? session.messages.slice() : [];
    trimMessageHistory();
    if (chatLog) chatLog.innerHTML = '';
    if (!messageHistory.length) {
      showEmptyState();
      return;
    }
    hideEmptyState();
    for (const msg of messageHistory) {
      const text = getMessageDisplay(msg);
      const entry = createMessage(msg.role, text);
      if (entry && msg.role === 'assistant') {
        updateMessage(entry, text, true);
      }
    }
    if (activeStreamInfo && activeStreamInfo.sessionId === session.id && activeStreamInfo.entry.row) {
      chatLog.appendChild(activeStreamInfo.entry.row);
    }
    scrollToBottom();
  }

  function syncCurrentSession() {
    const session = getActiveSession();
    if (!session) return;
    session.messages = messageHistory.slice();
    session.updatedAt = Date.now();
  }

  function updateSessionTitle(session) {
    if (!session || session.isDefaultTitle === false) return;
    const firstUser = session.messages.find((m) => m.role === 'user');
    if (!firstUser) return;
    const text = getMessageDisplay(firstUser);
    if (!text) return;
    const title = text.replace(/\n/g, ' ').trim().slice(0, 20);
    if (title) {
      session.title = title;
      session.isDefaultTitle = false;
    }
  }

  function renameSession(id, newTitle) {
    if (!sessionsData) return;
    const session = sessionsData.sessions.find((s) => s.id === id);
    if (!session) return;
    const trimmed = (newTitle || '').trim();
    session.title = trimmed || '新会话';
    session.isDefaultTitle = !trimmed && isDefaultTitleValue(session.title);
    session.updatedAt = Date.now();
    saveSessions();
    renderSessionList();
  }

  function startRenameSession(sessionId, titleSpan) {
    if (!sessionsData) return;
    const session = sessionsData.sessions.find((s) => s.id === sessionId);
    if (!session) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'session-rename-input';
    input.value = session.title || '';
    input.maxLength = 40;
    titleSpan.replaceWith(input);
    input.focus();
    input.select();
    const commit = () => renameSession(sessionId, input.value);
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
      if (e.key === 'Escape') {
        input.value = session.title || '新会话';
        input.blur();
      }
    });
  }

  function syncSessionModel() {
    const session = getActiveSession();
    if (!session) return;
    session.model = (modelSelect && modelSelect.value) || '';
  }

  function restoreSessionModel() {
    const session = getActiveSession();
    if (!session || !session.model || !Array.isArray(availableModels)) return;
    if (availableModels.includes(session.model)) {
      setModelValue(session.model);
    }
  }

  function renderSessionList() {
    if (!sessionListEl || !sessionsData) return;
    sessionListEl.innerHTML = '';
    for (const session of sessionsData.sessions) {
      const item = document.createElement('div');
      item.className = `session-item${session.id === sessionsData.activeId ? ' active' : ''}`;
      item.dataset.id = session.id;

      const titleSpan = document.createElement('span');
      titleSpan.className = 'session-title';
      titleSpan.textContent = session.title || '新会话';
      titleSpan.title = titleSpan.textContent;
      titleSpan.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        startRenameSession(session.id, titleSpan);
      });
      item.appendChild(titleSpan);

      if (session.unread && session.id !== sessionsData.activeId) {
        const dot = document.createElement('span');
        dot.className = 'session-unread';
        item.appendChild(dot);
      }

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'session-delete';
      delBtn.title = '删除';
      delBtn.textContent = '×';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSession(session.id);
      });
      item.appendChild(delBtn);

      item.addEventListener('click', () => switchSession(session.id));
      sessionListEl.appendChild(item);
    }
  }

  function createSession() {
    if (!sessionsData) return;
    const id = generateId();
    const session = {
      id,
      title: '新会话',
      isDefaultTitle: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: []
    };
    sessionsData.sessions.unshift(session);
    sessionsData.activeId = id;
    messageHistory = [];
    if (chatLog) chatLog.innerHTML = '';
    showEmptyState();
    saveSessions();
    renderSessionList();
    if (isMobileSidebar()) closeSidebar();
  }

  function deleteSession(id) {
    if (!sessionsData) return;
    const idx = sessionsData.sessions.findIndex((s) => s.id === id);
    if (idx === -1) return;
    sessionsData.sessions.splice(idx, 1);
    if (!sessionsData.sessions.length) {
      createSession();
      return;
    }
    if (sessionsData.activeId === id) {
      const newIdx = Math.min(idx, sessionsData.sessions.length - 1);
      sessionsData.activeId = sessionsData.sessions[newIdx].id;
      restoreActiveSession();
      restoreSessionModel();
    }
    saveSessions();
    renderSessionList();
  }

  function switchSession(id) {
    if (!sessionsData || sessionsData.activeId === id) return;
    syncCurrentSession();
    syncSessionModel();
    sessionsData.activeId = id;
    const target = getActiveSession();
    if (target) target.unread = false;
    restoreActiveSession();
    restoreSessionModel();
    saveSessions();
    renderSessionList();
    if (isMobileSidebar()) closeSidebar();
  }

  function isMobileSidebar() {
    return window.matchMedia('(max-width: 1024px)').matches;
  }

  function setSidebarCollapsed(collapsed) {
    const layout = chatSidebar ? chatSidebar.closest('.chat-layout') : null;
    if (!layout) return;
    layout.classList.toggle('collapsed', collapsed);
    try {
      localStorage.setItem(SIDEBAR_STATE_KEY, collapsed ? '1' : '0');
    } catch (e) {
      // ignore storage errors
    }
  }

  function openSidebar() {
    if (isMobileSidebar()) {
      if (chatSidebar) chatSidebar.classList.add('open');
      if (sidebarOverlay) sidebarOverlay.classList.add('open');
      return;
    }
    setSidebarCollapsed(false);
  }

  function closeSidebar() {
    if (isMobileSidebar()) {
      if (chatSidebar) chatSidebar.classList.remove('open');
      if (sidebarOverlay) sidebarOverlay.classList.remove('open');
      return;
    }
    setSidebarCollapsed(true);
  }

  function toggleSidebar() {
    if (isMobileSidebar()) {
      if (chatSidebar && chatSidebar.classList.contains('open')) {
        closeSidebar();
      } else {
        openSidebar();
      }
      return;
    }
    const layout = chatSidebar ? chatSidebar.closest('.chat-layout') : null;
    if (!layout) return;
    setSidebarCollapsed(!layout.classList.contains('collapsed'));
  }

  function restoreSidebarState() {
    try {
      const raw = localStorage.getItem(SIDEBAR_STATE_KEY);
      setSidebarCollapsed(raw === '1');
    } catch (e) {
      // ignore storage errors
    }
  }

  function loadSessions() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        sessionsData = JSON.parse(raw);
        if (!sessionsData || !Array.isArray(sessionsData.sessions)) {
          sessionsData = null;
        }
      }
    } catch (e) {
      sessionsData = null;
    }
    if (!sessionsData || !sessionsData.sessions.length) {
      const id = generateId();
      sessionsData = {
        activeId: id,
        sessions: [{
          id,
          title: '新会话',
          isDefaultTitle: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: []
        }]
      };
      saveSessions();
    }
    sessionsData.sessions.forEach((session) => {
      if (session && typeof session.isDefaultTitle === 'undefined') {
        session.isDefaultTitle = isDefaultTitleValue(session.title);
      }
      if (!Array.isArray(session.messages)) {
        session.messages = [];
      }
    });
    if (!sessionsData.activeId || !sessionsData.sessions.find((s) => s.id === sessionsData.activeId)) {
      sessionsData.activeId = sessionsData.sessions[0].id;
    }
    restoreActiveSession();
    restoreSessionModel();
    renderSessionList();
  }

  function toast(message, type) {
    if (typeof showToast === 'function') {
      showToast(message, type);
    }
  }

  function setStatus(state, text) {
    if (!statusText) return;
    statusText.textContent = text || '就绪';
    statusText.classList.remove('connected', 'connecting', 'error');
    if (state) statusText.classList.add(state);
  }

  function setSendingState(sending) {
    isSending = sending;
    if (!sendBtn) return;
    sendBtn.disabled = false;
    sendBtn.classList.toggle('is-abort', sending);
    sendBtn.setAttribute('aria-label', sending ? 'Abort' : 'Send');
    sendBtn.innerHTML = sending ? STOP_ICON : SEND_ICON;
  }

  function abortCurrentRequest() {
    if (!isSending || !abortController) return false;
    try {
      abortController.abort();
    } catch (e) {
      // ignore abort races
    }
    setStatus('error', '已中止');
    return true;
  }

  function updateRangeValues() {
    if (tempValue && tempRange) {
      tempValue.textContent = Number(tempRange.value).toFixed(2);
    }
    if (topPValue && topPRange) {
      topPValue.textContent = Number(topPRange.value).toFixed(2);
    }
  }

  function getScrollContainer() {
    const body = document.scrollingElement || document.documentElement;
    if (!body) return null;
    const hasOwnScroll = chatLog && chatLog.scrollHeight > chatLog.clientHeight + 1;
    return hasOwnScroll ? chatLog : body;
  }

  function isNearScrollBottom() {
    const container = getScrollContainer();
    if (!container) return true;
    const remaining = container.scrollHeight - (container.scrollTop + container.clientHeight);
    return remaining <= AUTO_SCROLL_THRESHOLD;
  }

  function updateFollowStreamScroll() {
    if (userLockedStreamScroll) {
      followStreamScroll = false;
      return;
    }
    followStreamScroll = isNearScrollBottom();
  }

  function lockStreamScrollFollow() {
    if (!isSending) return;
    userLockedStreamScroll = true;
    followStreamScroll = false;
  }

  function scrollToBottom(force = false) {
    const container = getScrollContainer();
    if (!container) return;
    if (!force && !followStreamScroll) return;
    suppressScrollTracking = true;
    container.scrollTop = container.scrollHeight;
    requestAnimationFrame(() => {
      suppressScrollTracking = false;
      updateFollowStreamScroll();
    });
  }

  function hideEmptyState() {
    if (emptyState) emptyState.classList.add('hidden');
  }

  function showEmptyState() {
    if (emptyState) emptyState.classList.remove('hidden');
  }

  function escapeHtml(value) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function closeChatImagePreview() {
    const overlay = document.getElementById('chatImagePreviewOverlay');
    if (!overlay) return;
    overlay.remove();
  }

  function openChatImagePreview(src, name) {
    if (!src) return;
    const opened = document.getElementById('chatImagePreviewOverlay');
    if (opened && opened.dataset.src === src) {
      closeChatImagePreview();
      return;
    }
    closeChatImagePreview();
    const overlay = document.createElement('div');
    overlay.id = 'chatImagePreviewOverlay';
    overlay.className = 'chat-image-preview-overlay';
    overlay.dataset.src = src;

    const img = document.createElement('img');
    img.className = 'chat-image-preview-image';
    img.src = src;
    img.alt = name || 'image';
    img.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    overlay.appendChild(img);
    overlay.addEventListener('click', () => closeChatImagePreview());
    document.body.appendChild(overlay);
  }

  function bindMessageImagePreview(root) {
    if (!root || !root.querySelectorAll) return;
    const userImageButtons = root.querySelectorAll('.user-image-btn');
    userImageButtons.forEach((btn) => {
      if (btn.dataset.previewBound === '1') return;
      btn.dataset.previewBound = '1';
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const src = btn.dataset.previewSrc || '';
        const name = btn.dataset.previewName || 'image';
        openChatImagePreview(src, name);
      });
    });

    const images = root.querySelectorAll('img');
    images.forEach((img) => {
      if (img.dataset.previewBound === '1') return;
      img.dataset.previewBound = '1';
      img.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const src = img.getAttribute('src') || '';
        const name = img.getAttribute('alt') || 'image';
        if (!src) return;
        openChatImagePreview(src, name);
      });
    });
  }

  function renderBasicMarkdown(rawText) {
    const text = (rawText || '').replace(/\\n/g, '\n');
    const escaped = escapeHtml(text);
    const codeBlocks = [];
    const fenced = escaped.replace(/```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g, (match, lang, code) => {
      const safeLang = lang ? escapeHtml(lang) : '';
      const encoded = encodeURIComponent(code);
      const html = `<div class="code-block-wrap"><button type="button" class="code-copy-btn" data-copy-code="${encoded}">复制</button><pre class="code-block"><code${safeLang ? ` class="language-${safeLang}"` : ''}>${code}</code></pre></div>`;
      const token = `@@CODEBLOCK_${codeBlocks.length}@@`;
      codeBlocks.push(html);
      return token;
    });

    const renderInline = (value) => {
      let output = value
        .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>');

      output = output.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, url) => {
        const safeAlt = escapeHtml(alt || 'image');
        const safeUrl = escapeHtml(url || '');
        return `<img src="${safeUrl}" alt="${safeAlt}" loading="lazy">`;
      });

      output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, url) => {
        const safeLabel = escapeHtml(label || '');
        const safeUrl = escapeHtml(url || '');
        return `<a href="${safeUrl}" target="_blank" rel="noopener">${safeLabel}</a>`;
      });

      return output;
    };

    const lines = fenced.split(/\r?\n/);
    const htmlParts = [];
    let inUl = false;
    let inOl = false;
    let inTable = false;
    let paragraphLines = [];

    const closeLists = () => {
      if (inUl) {
        htmlParts.push('</ul>');
        inUl = false;
      }
      if (inOl) {
        htmlParts.push('</ol>');
        inOl = false;
      }
    };

    const closeTable = () => {
      if (inTable) {
        htmlParts.push('</tbody></table>');
        inTable = false;
      }
    };

    const flushParagraph = () => {
      if (!paragraphLines.length) return;
      const joined = paragraphLines.join('<br>');
      htmlParts.push(`<p>${renderInline(joined)}</p>`);
      paragraphLines = [];
    };

    const isTableSeparator = (line) => /^\s*\|?(?:\s*:?-+:?\s*\|)+\s*$/.test(line);
    const splitTableRow = (line) => {
      const trimmed = line.trim();
      const row = trimmed.replace(/^\|/, '').replace(/\|$/, '');
      return row.split('|').map(cell => cell.trim());
    };

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed) {
        flushParagraph();
        closeLists();
        closeTable();
        continue;
      }

      const codeTokenMatch = trimmed.match(/^@@CODEBLOCK_(\d+)@@$/);
      if (codeTokenMatch) {
        flushParagraph();
        closeLists();
        closeTable();
        htmlParts.push(trimmed);
        continue;
      }

      const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        flushParagraph();
        closeLists();
        closeTable();
        const level = headingMatch[1].length;
        htmlParts.push(`<h${level}>${renderInline(headingMatch[2])}</h${level}>`);
        continue;
      }

      if (trimmed.includes('|')) {
        const nextLine = lines[i + 1] || '';
        if (!inTable && isTableSeparator(nextLine.trim())) {
          flushParagraph();
          closeLists();
          const headers = splitTableRow(trimmed);
          htmlParts.push('<div class="table-wrap"><table><thead><tr>');
          headers.forEach(cell => htmlParts.push(`<th>${renderInline(cell)}</th>`));
          htmlParts.push('</tr></thead><tbody>');
          inTable = true;
          i += 1;
          continue;
        }
        if (inTable && !isTableSeparator(trimmed)) {
          const cells = splitTableRow(trimmed);
          htmlParts.push('<tr>');
          cells.forEach(cell => htmlParts.push(`<td>${renderInline(cell)}</td>`));
          htmlParts.push('</tr>');
          continue;
        }
      }

      const ulMatch = trimmed.match(/^[-*+•]\s+(.*)$/);
      if (ulMatch) {
        flushParagraph();
        if (!inUl) {
          closeLists();
          closeTable();
          htmlParts.push('<ul>');
          inUl = true;
        }
        htmlParts.push(`<li>${renderInline(ulMatch[1])}</li>`);
        continue;
      }

      const olMatch = trimmed.match(/^\d+[.)、]\s+(.*)$/);
      if (olMatch) {
        flushParagraph();
        if (!inOl) {
          closeLists();
          closeTable();
          htmlParts.push('<ol>');
          inOl = true;
        }
        htmlParts.push(`<li>${renderInline(olMatch[1])}</li>`);
        continue;
      }

      paragraphLines.push(trimmed);
    }

    flushParagraph();
    closeLists();
    closeTable();

    let output = htmlParts.join('');
    codeBlocks.forEach((html, index) => {
      output = output.replace(`@@CODEBLOCK_${index}@@`, html);
    });
    return output;
  }

  function parseThinkSections(raw) {
    const parts = [];
    let cursor = 0;
    while (cursor < raw.length) {
      const start = raw.indexOf('<think>', cursor);
      if (start === -1) {
        parts.push({ type: 'text', value: raw.slice(cursor) });
        break;
      }
      if (start > cursor) {
        parts.push({ type: 'text', value: raw.slice(cursor, start) });
      }
      const thinkStart = start + 7;
      const end = raw.indexOf('</think>', thinkStart);
      if (end === -1) {
        parts.push({ type: 'think', value: raw.slice(thinkStart), open: true });
        cursor = raw.length;
      } else {
        parts.push({ type: 'think', value: raw.slice(thinkStart, end), open: false });
        cursor = end + 8;
      }
    }
    return parts;
  }

  function parseRolloutBlocks(text, defaultId = 'General') {
    const lines = (text || '').split(/\r?\n/);
    const blocks = [];
    let current = null;
    for (const line of lines) {
      const matchDouble = line.match(/^\s*\[([^\]]+)\]\[([^\]]+)\]\s*(.*)$/);
      if (matchDouble) {
        if (current) blocks.push(current);
        current = { id: matchDouble[1], type: matchDouble[2], lines: [] };
        if (matchDouble[3]) current.lines.push(matchDouble[3]);
        continue;
      }
      const matchSingle = line.match(/^\s*\[([^\]]+)\]\s*(.*)$/);
      if (matchSingle) {
        const maybeType = String(matchSingle[1] || '').trim();
        if (/^(WebSearch|SearchImage|AgentThink)$/i.test(maybeType)) {
          if (current) blocks.push(current);
          current = { id: defaultId || 'General', type: maybeType, lines: [] };
          if (matchSingle[2]) current.lines.push(matchSingle[2]);
          continue;
        }
      }
      if (current && /^\s*\[[^\]]+\]\s*$/.test(line)) {
        continue;
      }
      if (current) {
        current.lines.push(line);
      }
    }
    if (current) blocks.push(current);
    return blocks;
  }

  function parseAgentSections(text) {
    const lines = (text || '').split(/\r?\n/);
    const sections = [];
    let current = { title: null, lines: [] };
    let hasAgentHeading = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        current.lines.push(line);
        continue;
      }
      const agentMatch = trimmed.match(/^(Grok\s+Leader|(?:Grok\s+)?Agent\s*\d+)$/i);
      if (agentMatch) {
        hasAgentHeading = true;
        if (current.lines.length) {
          sections.push(current);
        }
        current = { title: agentMatch[1], lines: [] };
        continue;
      }
      current.lines.push(line);
    }
    if (current.lines.length) {
      sections.push(current);
    }
    if (!hasAgentHeading) {
      return [{ title: null, lines }];
    }
    return sections;
  }

  function splitBlocksIntoSyntheticAgents(blocks) {
    const list = Array.isArray(blocks) ? blocks : [];
    if (!list.length) return [];

    const ids = Array.from(new Set(list.map((b) => String(b.id || '').trim()).filter(Boolean)));
    const nonGeneralIds = ids.filter((id) => !/^general$/i.test(id));

    if (nonGeneralIds.length <= 1) {
      return [];
    }
    const groups = [];
    const map = new Map();
    for (const block of list) {
      const key = String(block.id || 'General');
      let group = map.get(key);
      if (!group) {
        group = { key, blocks: [] };
        map.set(key, group);
        groups.push(group);
      }
      group.blocks.push(block);
    }
    return groups.map((group, idx) => ({
      title: idx === 0 ? 'Grok Leader' : `Agent ${idx}`,
      blocks: group.blocks
    }));
  }

  function renderFlatBlocks(blocks) {
    return (Array.isArray(blocks) ? blocks : []).map((item) => {
      const body = renderBasicMarkdown((item.lines || []).join('\n').trim());
      const typeText = escapeHtml(item.type);
      const typeKey = String(item.type || '').trim().toLowerCase().replace(/\s+/g, '');
      const typeAttr = escapeHtml(typeKey);
      return `<div class="think-item-row"><div class="think-item-type" data-type="${typeAttr}">${typeText}</div><div class="think-item-body">${body || '<em>（空）</em>'}</div></div>`;
    }).join('');
  }

  function renderThinkContent(text, openAll) {
    const sections = parseAgentSections(text);
    if (!sections.length) {
      return renderBasicMarkdown(text);
    }
    const renderGroups = (blocks, openAllGroups) => {
      const groups = [];
      const map = new Map();
      for (const block of blocks) {
        const key = block.id;
        let group = map.get(key);
        if (!group) {
          group = { id: key, items: [] };
          map.set(key, group);
          groups.push(group);
        }
        group.items.push(block);
      }
      return groups.map((group) => {
        const items = group.items.map((item) => {
          const body = renderBasicMarkdown(item.lines.join('\n').trim());
          const typeText = escapeHtml(item.type);
          const typeKey = String(item.type || '').trim().toLowerCase().replace(/\s+/g, '');
          const typeAttr = escapeHtml(typeKey);
          return `<div class="think-item-row"><div class="think-item-type" data-type="${typeAttr}">${typeText}</div><div class="think-item-body">${body || '<em>（空）</em>'}</div></div>`;
        }).join('');
        const title = escapeHtml(group.id);
        const openAttr = openAllGroups ? ' open' : '';
        return `<details class="think-rollout-group"${openAttr}><summary><span class="think-rollout-title">${title}</span></summary><div class="think-rollout-body">${items}</div></details>`;
      }).join('');
    };

    const agentBlocks = sections.map((section, idx) => {
      const blocks = parseRolloutBlocks(section.lines.join('\n'), section.title || 'General');
      if (!section.title && blocks.length) {
        const synthetic = splitBlocksIntoSyntheticAgents(blocks);
        if (synthetic.length) {
          return synthetic.map((agent, agentIdx) => {
            const inner = renderFlatBlocks(agent.blocks);
            const title = escapeHtml(agent.title);
            const openAttr = openAll ? ' open' : (idx === 0 && agentIdx === 0 ? ' open' : '');
            return `<details class="think-agent"${openAttr}><summary>${title}</summary><div class="think-agent-items">${inner}</div></details>`;
          }).join('');
        }
      }
      const inner = blocks.length
        ? renderGroups(blocks, openAll)
        : `<div class="think-rollout-body">${renderBasicMarkdown(section.lines.join('\n').trim())}</div>`;
      if (!section.title) {
        return `<div class="think-agent-items">${inner}</div>`;
      }
      const title = escapeHtml(section.title);
      const openAttr = openAll ? ' open' : (idx === 0 ? ' open' : '');
      return `<details class="think-agent"${openAttr}><summary>${title}</summary><div class="think-agent-items">${inner}</div></details>`;
    });
    return `<div class="think-agents">${agentBlocks.join('')}</div>`;
  }

  function renderMarkdown(text) {
    const raw = text || '';
    const parts = parseThinkSections(raw);
    return parts.map((part) => {
      if (part.type === 'think') {
        const body = renderThinkContent(part.value.trim(), part.open);
        const openAttr = part.open ? ' open' : '';
        return `<details class="think-block" data-think="true"${openAttr}><summary class="think-summary">思考</summary><div class="think-content">${body || '<em>（空）</em>'}</div></details>`;
      }
      return renderBasicMarkdown(part.value);
    }).join('');
  }

  function createMessage(role, content) {
    if (!chatLog) return null;
    hideEmptyState();
    const row = document.createElement('div');
    row.className = `message-row ${role === 'user' ? 'user' : 'assistant'}`;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    const contentNode = document.createElement('div');
    contentNode.className = 'message-content';
    contentNode.textContent = content || '';
    bubble.appendChild(contentNode);
    row.appendChild(bubble);

    chatLog.appendChild(row);
    scrollToBottom(true);
    const entry = {
      row,
      contentNode,
      role,
      raw: content || '',
      committed: false,
      startedAt: Date.now(),
      firstTokenAt: null,
      hasThink: false,
      thinkElapsed: null
    };
    return entry;
  }

  function renderUserMessage(entry, text, files) {
    if (!entry || !entry.contentNode) return;
    const prompt = String(text || '').trim();
    const attachmentsList = Array.isArray(files) ? files : [];
    const imageFiles = attachmentsList.filter((item) => String(item.mime || '').startsWith('image/') && item.data);
    const otherFiles = attachmentsList.filter((item) => !(String(item.mime || '').startsWith('image/')));

    const parts = [];
    if (prompt) {
      parts.push(`<div class="user-text-bubble">${renderBasicMarkdown(prompt)}</div>`);
    }
    if (imageFiles.length) {
      const thumbs = imageFiles.map((item) => {
        const src = escapeHtml(item.data || '');
        const name = escapeHtml(item.name || 'image');
        return `<button type="button" class="user-image-btn" data-preview-src="${src}" data-preview-name="${name}" aria-label="预览图片 ${name}"><img src="${src}" alt="${name}" loading="lazy"></button>`;
      }).join('');
      parts.push(`<div class="user-media-row">${thumbs}</div>`);
    }
    if (otherFiles.length) {
      const tags = otherFiles.map((item) => `<span class="user-file-chip">[文件] ${escapeHtml(item.name || 'file')}</span>`).join('');
      parts.push(`<div class="user-file-row">${tags}</div>`);
    }
    if (!parts.length) {
      parts.push('<div class="user-text-bubble">（空）</div>');
    }

    entry.raw = prompt;
    entry.contentNode.classList.add('rendered', 'user-rendered');
    entry.contentNode.innerHTML = parts.join('');
    bindMessageImagePreview(entry.contentNode);
    scrollToBottom(true);
  }

  function applyImageGrid(root) {
    if (!root) return;
    const isIgnorable = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        return !node.textContent.trim();
      }
      return node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR';
    };

    const isImageLink = (node) => {
      if (!node || node.nodeType !== Node.ELEMENT_NODE || node.tagName !== 'A') return false;
      const children = Array.from(node.childNodes);
      if (!children.length) return false;
      return children.every((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          return !child.textContent.trim();
        }
        return child.nodeType === Node.ELEMENT_NODE && child.tagName === 'IMG';
      });
    };

    const extractImageItems = (node) => {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return null;
      if (node.classList && node.classList.contains('img-grid')) return null;
      if (node.tagName === 'IMG') {
        return { items: [node], removeNode: null };
      }
      if (isImageLink(node)) {
        return { items: [node], removeNode: null };
      }
      if (node.tagName === 'P') {
        const items = [];
        const children = Array.from(node.childNodes);
        if (!children.length) return null;
        for (const child of children) {
          if (child.nodeType === Node.TEXT_NODE) {
            if (!child.textContent.trim()) continue;
            return null;
          }
          if (child.nodeType === Node.ELEMENT_NODE) {
            if (child.tagName === 'IMG' || isImageLink(child)) {
              items.push(child);
              continue;
            }
            if (child.tagName === 'BR') continue;
            return null;
          }
          return null;
        }
        if (!items.length) return null;
        return { items, removeNode: node };
      }
      return null;
    };

    const wrapImagesInContainer = (container) => {
      const children = Array.from(container.childNodes);
      let group = [];
      let groupStart = null;
      let removeNodes = [];

      const flush = () => {
        if (group.length < 2) {
          group = [];
          groupStart = null;
          removeNodes = [];
          return;
        }
        const wrapper = document.createElement('div');
        wrapper.className = 'img-grid';
        const cols = Math.min(4, group.length);
        wrapper.style.setProperty('--cols', String(cols));
        if (groupStart) {
          container.insertBefore(wrapper, groupStart);
        } else {
          container.appendChild(wrapper);
        }
        group.forEach((img) => wrapper.appendChild(img));
        removeNodes.forEach((n) => n.parentNode && n.parentNode.removeChild(n));
        group = [];
        groupStart = null;
        removeNodes = [];
      };

      children.forEach((node) => {
        if (group.length && isIgnorable(node)) {
          removeNodes.push(node);
          return;
        }
        const extracted = extractImageItems(node);
        if (extracted && extracted.items.length) {
          if (!groupStart) groupStart = node;
          group.push(...extracted.items);
          if (extracted.removeNode) {
            removeNodes.push(extracted.removeNode);
          }
          return;
        }
        flush();
      });
      flush();
    };

    const containers = [root, ...root.querySelectorAll('.think-content, .think-item-body, .think-rollout-body, .think-agent-items')];
    containers.forEach((container) => {
      if (!container || container.closest('.img-grid')) return;
      if (!container.querySelector || !container.querySelector('img')) return;
      wrapImagesInContainer(container);
    });
  }

  function bindCodeCopyButtons(root) {
    if (!root || !root.querySelectorAll) return;
    const buttons = root.querySelectorAll('.code-copy-btn');
    buttons.forEach((btn) => {
      if (btn.dataset.bound === '1') return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', async () => {
        const encoded = btn.getAttribute('data-copy-code') || '';
        const code = decodeURIComponent(encoded);
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(code);
          } else {
            const temp = document.createElement('textarea');
            temp.value = code;
            temp.style.position = 'fixed';
            temp.style.opacity = '0';
            document.body.appendChild(temp);
            temp.select();
            document.execCommand('copy');
            document.body.removeChild(temp);
          }
          const original = btn.textContent || '复制';
          btn.textContent = '已复制';
          setTimeout(() => {
            btn.textContent = original;
          }, 1200);
        } catch (e) {
          toast('复制失败', 'error');
        }
      });
    });
  }

  function updateMessage(entry, content, finalize = false) {
    if (!entry) return;
    entry.raw = content || '';
    if (!entry.contentNode) return;
    const shouldPreserveScroll = isSending && !followStreamScroll;
    const scrollContainer = shouldPreserveScroll ? getScrollContainer() : null;
    const preservedScrollTop = scrollContainer ? scrollContainer.scrollTop : 0;
    const captureOpenState = (root, selector) => {
      if (!root || !root.querySelectorAll) return null;
      const nodes = Array.from(root.querySelectorAll(selector));
      if (!nodes.length) return null;
      return nodes.map((node) => node.hasAttribute('open'));
    };
    const captureScrollState = (root, selector) => {
      if (!root || !root.querySelectorAll) return null;
      const nodes = Array.from(root.querySelectorAll(selector));
      if (!nodes.length) return null;
      return nodes.map((node) => node.scrollTop || 0);
    };
    const restoreOpenState = (root, selector, states) => {
      if (!root || !root.querySelectorAll || !Array.isArray(states) || !states.length) return;
      const nodes = Array.from(root.querySelectorAll(selector));
      const max = Math.min(nodes.length, states.length);
      for (let i = 0; i < max; i += 1) {
        if (states[i]) {
          nodes[i].setAttribute('open', '');
        } else {
          nodes[i].removeAttribute('open');
        }
      }
    };
    const restoreScrollState = (root, selector, states) => {
      if (!root || !root.querySelectorAll || !Array.isArray(states) || !states.length) return;
      const nodes = Array.from(root.querySelectorAll(selector));
      const max = Math.min(nodes.length, states.length);
      for (let i = 0; i < max; i += 1) {
        nodes[i].scrollTop = states[i] || 0;
      }
    };
    const savedThinkBlockState = captureOpenState(entry.contentNode, '.think-block');
    const savedThinkAgentState = captureOpenState(entry.contentNode, '.think-agent');
    const savedRolloutState = captureOpenState(entry.contentNode, '.think-rollout-group');
    const savedThinkContentScroll = captureScrollState(entry.contentNode, '.think-content');
    const savedThinkAgentItemsScroll = captureScrollState(entry.contentNode, '.think-agent-items');
    const savedThinkRolloutBodyScroll = captureScrollState(entry.contentNode, '.think-rollout-body');
    if (!entry.hasThink && entry.raw.includes('<think>')) {
      entry.hasThink = true;
    }
    if (finalize) {
      entry.contentNode.classList.add('rendered');
      entry.contentNode.innerHTML = renderMarkdown(entry.raw);
    } else {
      if (entry.role === 'assistant') {
        entry.contentNode.innerHTML = renderMarkdown(entry.raw);
      } else {
        entry.contentNode.textContent = entry.raw;
      }
    }
    restoreOpenState(entry.contentNode, '.think-block', savedThinkBlockState);
    restoreOpenState(entry.contentNode, '.think-agent', savedThinkAgentState);
    restoreOpenState(entry.contentNode, '.think-rollout-group', savedRolloutState);
    if (shouldPreserveScroll) {
      restoreScrollState(entry.contentNode, '.think-content', savedThinkContentScroll);
      restoreScrollState(entry.contentNode, '.think-agent-items', savedThinkAgentItemsScroll);
      restoreScrollState(entry.contentNode, '.think-rollout-body', savedThinkRolloutBodyScroll);
    }
    if (entry.hasThink) {
      if (finalize && (entry.thinkElapsed === null || typeof entry.thinkElapsed === 'undefined')) {
        entry.thinkElapsed = 0;
      }
      updateThinkSummary(entry, entry.thinkElapsed);
    }
    if (entry.role === 'assistant' || entry.role === 'user') {
      applyImageGrid(entry.contentNode);
      enhanceBrokenImages(entry.contentNode);
      bindMessageImagePreview(entry.contentNode);
    }
    if (entry.role === 'assistant') {
      bindCodeCopyButtons(entry.contentNode);
      const thinkNodes = entry.contentNode.querySelectorAll('.think-content');
      if (!shouldPreserveScroll) {
        thinkNodes.forEach((node) => {
          node.scrollTop = node.scrollHeight;
        });
      }
      if (finalize && entry.row && !entry.row.querySelector('.message-actions')) {
        attachAssistantActions(entry);
      }
    }
    if (scrollContainer) {
      suppressScrollTracking = true;
      scrollContainer.scrollTop = preservedScrollTop;
      requestAnimationFrame(() => {
        suppressScrollTracking = false;
      });
      return;
    }
    scrollToBottom();
  }

  function enhanceBrokenImages(root) {
    if (!root) return;
    const images = root.querySelectorAll('img');
    images.forEach((img) => {
      if (img.dataset.retryBound) return;
      img.dataset.retryBound = '1';
      img.addEventListener('error', () => {
        if (img.dataset.failed) return;
        img.dataset.failed = '1';
        const wrapper = document.createElement('button');
        wrapper.type = 'button';
        wrapper.className = 'img-retry';
        wrapper.textContent = '图片加载失败，点击重试';
        wrapper.addEventListener('click', () => {
          wrapper.classList.add('loading');
          const original = img.getAttribute('src') || '';
          const cacheBust = original.includes('?') ? '&' : '?';
          img.dataset.failed = '';
          img.src = `${original}${cacheBust}t=${Date.now()}`;
        });
        img.replaceWith(wrapper);
      });
      img.addEventListener('load', () => {
        if (img.dataset.failed) {
          img.dataset.failed = '';
        }
      });
    });
  }

  function updateThinkSummary(entry, elapsedSec) {
    if (!entry || !entry.contentNode) return;
    const summaries = entry.contentNode.querySelectorAll('.think-summary');
    if (!summaries.length) return;
    const text = typeof elapsedSec === 'number' ? `思考 ${elapsedSec} 秒` : '思考中';
    summaries.forEach((node) => {
      node.textContent = text;
      const block = node.closest('.think-block');
      if (!block) return;
      if (typeof elapsedSec === 'number') {
        block.removeAttribute('data-thinking');
      } else {
        block.setAttribute('data-thinking', 'true');
      }
    });
  }

  function clearChat() {
    messageHistory = [];
    if (chatLog) {
      chatLog.innerHTML = '';
    }
    showEmptyState();
  }

  function buildMessages() {
    return buildMessagesFrom(messageHistory);
  }

  function buildMessagesFrom(history) {
    const payload = [];
    const systemPrompt = systemInput ? systemInput.value.trim() : '';
    if (systemPrompt) {
      payload.push({ role: 'system', content: systemPrompt });
    }
    for (const msg of history) {
      payload.push({ role: msg.role, content: msg.content });
    }
    return payload;
  }

  function buildPayload() {
    const payload = {
      model: (modelSelect && modelSelect.value) || 'grok-3',
      messages: buildMessages(),
      stream: true,
      temperature: Number(tempRange ? tempRange.value : 0.8),
      top_p: Number(topPRange ? topPRange.value : 0.95)
    };
    const reasoning = reasoningSelect ? reasoningSelect.value : '';
    if (reasoning) {
      payload.reasoning_effort = reasoning;
    }
    return payload;
  }

  function buildPayloadFrom(history) {
    const payload = {
      model: (modelSelect && modelSelect.value) || 'grok-3',
      messages: buildMessagesFrom(history),
      stream: true,
      temperature: Number(tempRange ? tempRange.value : 0.8),
      top_p: Number(topPRange ? topPRange.value : 0.95)
    };
    const reasoning = reasoningSelect ? reasoningSelect.value : '';
    if (reasoning) {
      payload.reasoning_effort = reasoning;
    }
    return payload;
  }

  function closeModelPicker() {
    if (!modelPicker || !modelPickerMenu || !modelPickerBtn) return;
    modelPicker.classList.remove('open');
    modelPickerMenu.classList.add('hidden');
    modelPickerBtn.setAttribute('aria-expanded', 'false');
  }

  function openModelPicker() {
    if (!modelPicker || !modelPickerMenu || !modelPickerBtn) return;
    modelPicker.classList.add('open');
    modelPickerMenu.classList.remove('hidden');
    modelPickerBtn.setAttribute('aria-expanded', 'true');
  }

  function setModelValue(modelId) {
    if (!modelSelect || !modelId) return;
    modelSelect.value = modelId;
    if (modelPickerLabel) {
      modelPickerLabel.textContent = modelId;
    }
    if (modelPickerMenu) {
      const options = modelPickerMenu.querySelectorAll('.model-option');
      options.forEach((node) => {
        node.classList.toggle('active', node.dataset.value === modelId);
      });
    }
    if (sessionsData) {
      syncSessionModel();
      saveSessions();
      renderSessionList();
    }
  }

  function renderModelOptions(models) {
    if (!modelSelect || !modelPickerMenu) return;
    modelSelect.innerHTML = '';
    modelPickerMenu.innerHTML = '';
    availableModels = Array.isArray(models) ? models.slice() : [];

    availableModels.forEach((id) => {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = id;
      modelSelect.appendChild(option);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'model-option';
      btn.textContent = id;
      btn.dataset.value = id;
      btn.setAttribute('role', 'option');
      btn.addEventListener('click', () => {
        setModelValue(id);
        closeModelPicker();
      });
      modelPickerMenu.appendChild(btn);
    });
  }

  async function loadModels() {
    if (!modelSelect) return;
    const fallback = ['grok-4.1-fast', 'grok-4', 'grok-3', 'grok-3-mini', 'grok-3-thinking', 'grok-4.20-beta'];
    const preferred = 'grok-4.20-beta';
    let list = fallback;

    try {
      const authHeader = await ensurePublicKey();
      if (authHeader === null) {
        renderModelOptions(list);
        if (list.includes(preferred)) {
          setModelValue(preferred);
        } else {
          setModelValue(list[list.length - 1] || preferred);
        }
        return;
      }
      const res = await fetch('/v1/models', {
        cache: 'no-store',
        headers: buildAuthHeaders(authHeader)
      });
      if (!res.ok) throw new Error('models fetch failed');
      const data = await res.json();
      const items = Array.isArray(data && data.data) ? data.data : [];
      const ids = items
        .map(item => item && item.id)
        .filter(Boolean)
        .filter(id => !String(id).startsWith('grok-imagine'))
        .filter(id => !String(id).includes('video'));
      if (ids.length) list = ids;
    } catch (e) {
      list = fallback;
    }

    renderModelOptions(list);
    if (list.includes(preferred)) {
      setModelValue(preferred);
    } else {
      setModelValue(list[list.length - 1] || preferred);
    }
    restoreSessionModel();
  }

  function showAttachmentBadge() {
    if (!fileBadge) return;
    fileBadge.innerHTML = '';
    if (!attachments.length) {
      fileBadge.classList.add('hidden');
      return;
    }
    fileBadge.classList.remove('hidden');
    attachments.forEach((item, index) => {
      const tag = document.createElement('div');
      tag.className = 'file-badge-item';
      tag.dataset.index = String(index);

      const isImage = String(item.mime || '').startsWith('image/');
      if (isImage && item.data) {
        const preview = document.createElement('img');
        preview.className = 'file-preview';
        preview.src = item.data;
        preview.alt = item.name || 'preview';
        tag.classList.add('is-image');
        tag.appendChild(preview);
      }

      const name = document.createElement('span');
      name.className = 'file-name';
      name.textContent = item.name || 'file';
      tag.appendChild(name);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'file-remove';
      removeBtn.dataset.action = 'remove';
      removeBtn.dataset.index = String(index);
      removeBtn.textContent = '×';
      tag.appendChild(removeBtn);

      fileBadge.appendChild(tag);
    });
  }

  function removeAttachmentAt(index) {
    if (!Number.isInteger(index) || index < 0 || index >= attachments.length) return;
    attachments.splice(index, 1);
    if (!attachments.length && fileInput) {
      fileInput.value = '';
    }
    showAttachmentBadge();
    closeAttachmentPreview();
  }

  function clearAttachment() {
    attachments = [];
    if (fileInput) fileInput.value = '';
    showAttachmentBadge();
    closeAttachmentPreview();
  }

  function closeAttachmentPreview() {
    const overlay = document.getElementById('attachmentPreviewOverlay');
    if (!overlay) return;
    overlay.remove();
  }

  function openAttachmentPreview(src, name) {
    if (!src) return;
    closeAttachmentPreview();
    const overlay = document.createElement('div');
    overlay.id = 'attachmentPreviewOverlay';
    overlay.className = 'attachment-preview-overlay';

    const img = document.createElement('img');
    img.className = 'attachment-preview-image';
    img.src = src;
    img.alt = name || 'preview';
    img.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    overlay.appendChild(img);
    overlay.addEventListener('click', () => closeAttachmentPreview());
    document.body.appendChild(overlay);
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsDataURL(file);
    });
  }

  function readFileAsDataUrlFallback(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const buffer = reader.result;
          const bytes = new Uint8Array(buffer);
          let binary = '';
          const chunkSize = 0x8000;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, chunk);
          }
          const b64 = btoa(binary);
          const mime = file && file.type ? file.type : 'application/octet-stream';
          resolve(`data:${mime};base64,${b64}`);
        } catch (e) {
          reject(new Error('文件读取失败'));
        }
      };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsArrayBuffer(file);
    });
  }

  function buildUniqueFileName(name) {
    const baseName = name || 'file';
    const exists = new Set(attachments.map(item => item.name));
    if (!exists.has(baseName)) return baseName;

    const dot = baseName.lastIndexOf('.');
    const hasExt = dot > 0;
    const prefix = hasExt ? baseName.slice(0, dot) : baseName;
    const ext = hasExt ? baseName.slice(dot) : '';
    let index = 2;
    while (true) {
      const candidate = `${prefix} (${index})${ext}`;
      if (!exists.has(candidate)) return candidate;
      index += 1;
    }
  }

  async function handleFileSelect(file) {
    if (!file) return false;
    try {
      let dataUrl = '';
      try {
        dataUrl = await readFileAsDataUrl(file);
      } catch (e) {
        dataUrl = await readFileAsDataUrlFallback(file);
      }
      attachments.push({
        name: buildUniqueFileName(file.name || 'file'),
        data: dataUrl,
        mime: file.type || ''
      });
      try {
        showAttachmentBadge();
      } catch (e) {
        console.error('showAttachmentBadge failed', e);
      }
      return true;
    } catch (e) {
      console.error('handleFileSelect failed', e, file);
      return false;
    }
  }

  function dataTransferHasFiles(dataTransfer) {
    if (!dataTransfer) return false;
    const types = Array.from(dataTransfer.types || []);
    return types.includes('Files');
  }

  function extractFiles(dataTransfer) {
    if (!dataTransfer) return [];
    const items = Array.from(dataTransfer.items || []);
    const filesFromItems = [];
    const seen = new Set();
    const pushUnique = (file) => {
      if (!file) return;
      const size = Number(file.size || 0);
      if (size <= 0) return;
      const key = `${file.name || ''}|${file.type || ''}|${size}|${file.lastModified || 0}`;
      if (seen.has(key)) return;
      seen.add(key);
      filesFromItems.push(file);
    };
    for (const item of items) {
      if (item && item.kind === 'file') {
        const file = item.getAsFile();
        if (!file) continue;
        const type = String(file.type || '').toLowerCase();
        const hasName = Boolean(file.name);
        const isUseful = type.startsWith('image/') || type.startsWith('audio/') || type.startsWith('video/') || type.startsWith('application/') || hasName;
        if (isUseful) pushUnique(file);
      }
    }
    if (filesFromItems.length) return filesFromItems;
    const fallbackFiles = Array.from(dataTransfer.files || []).filter(Boolean).filter((file) => {
      const type = String(file.type || '').toLowerCase();
      return type.startsWith('image/') || type.startsWith('audio/') || type.startsWith('video/') || type.startsWith('application/') || Boolean(file.name);
    });
    fallbackFiles.forEach(pushUnique);
    return filesFromItems;
  }

  function createActionButton(label, title, onClick) {
    const btn = document.createElement('button');
    btn.className = 'action-btn';
    btn.type = 'button';
    btn.textContent = label;
    if (title) btn.title = title;
    if (onClick) btn.addEventListener('click', onClick);
    return btn;
  }

  function attachAssistantActions(entry) {
    if (!entry || !entry.row) return;
    const actions = document.createElement('div');
    actions.className = 'message-actions';

    const retryBtn = createActionButton('重试', '重试上一条回答', () => retryLast());
    const copyBtn = createActionButton('复制', '复制回答内容', () => copyToClipboard(entry.raw || ''));
    const feedbackBtn = createActionButton('反馈', '反馈到 Grok2API', () => {
      window.open(feedbackUrl, '_blank', 'noopener');
    });

    actions.appendChild(retryBtn);
    actions.appendChild(copyBtn);
    actions.appendChild(feedbackBtn);
    entry.row.appendChild(actions);
  }

  async function copyToClipboard(text) {
    if (!text) {
      toast('暂无内容可复制', 'error');
      return;
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const temp = document.createElement('textarea');
        temp.value = text;
        temp.style.position = 'fixed';
        temp.style.opacity = '0';
        document.body.appendChild(temp);
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
      }
      toast('已复制', 'success');
    } catch (e) {
      toast('复制失败', 'error');
    }
  }

  async function retryLast() {
    if (isSending) return;
    if (!messageHistory.length) return;
    let lastUserIndex = -1;
    for (let i = messageHistory.length - 1; i >= 0; i -= 1) {
      if (messageHistory[i].role === 'user') {
        lastUserIndex = i;
        break;
      }
    }
    if (lastUserIndex === -1) {
      toast('没有可重试的对话', 'error');
      return;
    }
    const historySlice = messageHistory.slice(0, lastUserIndex + 1);
    const retrySessionId = sessionsData ? sessionsData.activeId : null;
    const assistantEntry = createMessage('assistant', '');
    setSendingState(true);
    setStatus('connecting', '发送中');
    followStreamScroll = true;
    userLockedStreamScroll = false;

    abortController = new AbortController();
    const payload = buildPayloadFrom(historySlice);

    let headers = { 'Content-Type': 'application/json' };
    try {
      const authHeader = await ensurePublicKey();
      headers = { ...headers, ...buildAuthHeaders(authHeader) };
    } catch (e) {
      // ignore auth helper failures
    }

    try {
      const res = await fetch('/v1/public/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: abortController.signal
      });

      if (!res.ok) {
        throw new Error(`请求失败: ${res.status}`);
      }

      await handleStream(res, assistantEntry, retrySessionId);
      setStatus('connected', '完成');
    } catch (e) {
      if (e && e.name === 'AbortError') {
        updateMessage(assistantEntry, assistantEntry.raw || '已中止', true);
        if (!assistantEntry.committed) {
          assistantEntry.committed = true;
          if (retrySessionId) {
            commitToSession(retrySessionId, assistantEntry.raw || '');
          } else {
            messageHistory.push({ role: 'assistant', content: assistantEntry.raw || '' });
          }
        }
        setStatus('error', '已中止');
      } else {
        updateMessage(assistantEntry, `请求失败: ${e.message || e}`, true);
        setStatus('error', '失败');
        toast('请求失败，请检查服务状态', 'error');
      }
    } finally {
      setSendingState(false);
      abortController = null;
      scrollToBottom();
    }
  }

  async function sendMessage() {
    if (isSending) return;
    const prompt = promptInput ? promptInput.value.trim() : '';
    if (!prompt && attachments.length === 0) {
      toast('请输入内容', 'error');
      return;
    }

    const attachmentsSnapshot = attachments.map((item) => ({ ...item }));
    const userEntry = createMessage('user', '');
    renderUserMessage(userEntry, prompt, attachmentsSnapshot);

    let content = prompt;
    if (attachments.length) {
      const blocks = [];
      if (prompt) {
        blocks.push({ type: 'text', text: prompt });
      }
      attachments.forEach((item) => {
        blocks.push({ type: 'file', file: { file_data: item.data } });
      });
      content = blocks;
    }

    messageHistory.push({ role: 'user', content });
    trimMessageHistory();
    if (promptInput) promptInput.value = '';
    clearAttachment();
    syncCurrentSession();
    syncSessionModel();
    updateSessionTitle(getActiveSession());
    saveSessions();
    renderSessionList();

    const sendSessionId = sessionsData ? sessionsData.activeId : null;
    const assistantEntry = createMessage('assistant', '');
    setSendingState(true);
    setStatus('connecting', '发送中');
    followStreamScroll = true;
    userLockedStreamScroll = false;

    abortController = new AbortController();
    const payload = buildPayload();

    let headers = { 'Content-Type': 'application/json' };
    try {
      const authHeader = await ensurePublicKey();
      headers = { ...headers, ...buildAuthHeaders(authHeader) };
    } catch (e) {
      // ignore auth helper failures
    }

    try {
      const res = await fetch('/v1/public/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: abortController.signal
      });

      if (!res.ok) {
        throw new Error(`请求失败: ${res.status}`);
      }

      await handleStream(res, assistantEntry, sendSessionId);
      setStatus('connected', '完成');
    } catch (e) {
      if (e && e.name === 'AbortError') {
        updateMessage(assistantEntry, assistantEntry.raw || '已中止', true);
        if (assistantEntry.hasThink) {
          const elapsed = assistantEntry.thinkElapsed || Math.max(1, Math.round((Date.now() - assistantEntry.startedAt) / 1000));
          updateThinkSummary(assistantEntry, elapsed);
        }
        setStatus('error', '已中止');
        if (!assistantEntry.committed) {
          assistantEntry.committed = true;
          if (sendSessionId) {
            commitToSession(sendSessionId, assistantEntry.raw || '');
          } else {
            messageHistory.push({ role: 'assistant', content: assistantEntry.raw || '' });
          }
        }
      } else {
        updateMessage(assistantEntry, `请求失败: ${e.message || e}`, true);
        setStatus('error', '失败');
        toast('请求失败，请检查服务状态', 'error');
      }
    } finally {
      setSendingState(false);
      abortController = null;
      scrollToBottom();
    }
  }

  function commitToSession(sessionId, assistantText) {
    if (!sessionId || !sessionsData) return;
    const session = sessionsData.sessions.find((s) => s.id === sessionId);
    if (!session) return;
    session.messages.push({ role: 'assistant', content: assistantText });
    if (session.messages.length > MAX_CONTEXT_MESSAGES) {
      session.messages = session.messages.slice(-MAX_CONTEXT_MESSAGES);
    }
    session.updatedAt = Date.now();
    updateSessionTitle(session);
    if (sessionsData.activeId === sessionId) {
      messageHistory = session.messages.slice();
      trimMessageHistory();
    } else {
      session.unread = true;
    }
    saveSessions();
    renderSessionList();
  }

  async function handleStream(res, assistantEntry, targetSessionId = null) {
    activeStreamInfo = { sessionId: targetSessionId, entry: assistantEntry };
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let assistantText = '';
    try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';
      for (const part of parts) {
        const lines = part.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload) continue;
          if (payload === '[DONE]') {
            updateMessage(assistantEntry, assistantText, true);
            if (assistantEntry.hasThink) {
              const elapsed = assistantEntry.thinkElapsed || Math.max(1, Math.round((Date.now() - assistantEntry.startedAt) / 1000));
              updateThinkSummary(assistantEntry, elapsed);
            }
            assistantEntry.committed = true;
            if (targetSessionId) {
              commitToSession(targetSessionId, assistantText);
            } else {
              messageHistory.push({ role: 'assistant', content: assistantText });
            }
            return;
          }
          try {
            const json = JSON.parse(payload);
            const delta = json && json.choices && json.choices[0] && json.choices[0].delta
              ? json.choices[0].delta.content
              : '';
            if (delta) {
              assistantText += delta;
              if (!assistantEntry.firstTokenAt) {
                assistantEntry.firstTokenAt = Date.now();
              }
              if (!assistantEntry.hasThink && assistantText.includes('<think>')) {
                assistantEntry.hasThink = true;
                assistantEntry.thinkElapsed = null;
                updateThinkSummary(assistantEntry, null);
              }
              if (!targetSessionId || (sessionsData && sessionsData.activeId === targetSessionId)) {
                updateMessage(assistantEntry, assistantText, false);
              }
            }
          } catch (e) {
            // ignore parse errors
          }
        }
      }
    }
    updateMessage(assistantEntry, assistantText, true);
    if (assistantEntry.hasThink) {
      const elapsed = assistantEntry.thinkElapsed || Math.max(1, Math.round((Date.now() - assistantEntry.startedAt) / 1000));
      updateThinkSummary(assistantEntry, elapsed);
    }
    assistantEntry.committed = true;
    if (targetSessionId) {
      commitToSession(targetSessionId, assistantText);
    } else {
      messageHistory.push({ role: 'assistant', content: assistantText });
    }
    } finally {
      activeStreamInfo = null;
    }
  }

  function toggleSettings(show) {
    if (!settingsPanel) return;
    if (typeof show === 'boolean') {
      settingsPanel.classList.toggle('hidden', !show);
      return;
    }
    settingsPanel.classList.toggle('hidden');
  }

  function bindEvents() {
    if (tempRange) tempRange.addEventListener('input', updateRangeValues);
    if (topPRange) topPRange.addEventListener('input', updateRangeValues);
    if (sendBtn) {
      sendBtn.addEventListener('click', () => {
        if (isSending) {
          abortCurrentRequest();
          return;
        }
        sendMessage();
      });
    }
    if (modelPickerBtn) {
      modelPickerBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        if (modelPicker && modelPicker.classList.contains('open')) {
          closeModelPicker();
        } else {
          openModelPicker();
        }
      });
    }
    if (settingsToggle) {
      settingsToggle.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleSettings();
      });
    }
    document.addEventListener('click', (event) => {
      if (modelPicker && !modelPicker.contains(event.target)) {
        closeModelPicker();
      }
      if (!settingsPanel || settingsPanel.classList.contains('hidden')) return;
      if (settingsPanel.contains(event.target) || (settingsToggle && settingsToggle.contains(event.target))) {
        return;
      }
      toggleSettings(false);
    });
    if (promptInput) {
      let composing = false;
      promptInput.addEventListener('compositionstart', () => {
        composing = true;
      });
      promptInput.addEventListener('compositionend', () => {
        composing = false;
      });
      promptInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          if (composing || event.isComposing) return;
          event.preventDefault();
          sendMessage();
        }
      });
      promptInput.addEventListener('paste', async (event) => {
        const files = extractFiles(event.clipboardData);
        if (!files.length) return;
        event.preventDefault();
        let okCount = 0;
        for (const file of files) {
          if (await handleFileSelect(file)) okCount += 1;
        }
        if (okCount > 0) {
          toast(`已粘贴 ${okCount} 个文件`, 'success');
        }
        if (okCount < files.length) {
          toast('部分文件读取失败', 'error');
        }
      });
    }
    if (attachBtn && fileInput) {
      attachBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', async () => {
        const files = Array.from(fileInput.files || []);
        if (!files.length) return;
        let okCount = 0;
        for (const file of files) {
          if (await handleFileSelect(file)) okCount += 1;
        }
        if (okCount > 0) {
          toast(`已选择 ${okCount} 个文件`, 'success');
        }
        if (okCount < files.length) {
          toast('部分文件读取失败', 'error');
        }
        fileInput.value = '';
      });
    }
    if (fileBadge) {
      fileBadge.addEventListener('click', (event) => {
        const removeBtn = event.target.closest('.file-remove');
        if (removeBtn) {
          event.stopPropagation();
          const index = Number(removeBtn.dataset.index);
          if (Number.isInteger(index)) {
            removeAttachmentAt(index);
          }
          return;
        }

        const tag = event.target.closest('.file-badge-item');
        if (!tag) return;
        const index = Number(tag.dataset.index);
        if (!Number.isInteger(index) || index < 0 || index >= attachments.length) return;
        const item = attachments[index];
        const isImage = String(item.mime || '').startsWith('image/');
        if (!isImage || !item.data) return;

        const opened = document.getElementById('attachmentPreviewOverlay');
        if (opened) {
          closeAttachmentPreview();
          return;
        }
        openAttachmentPreview(item.data, item.name);
      });
    }
    if (newChatBtn) {
      newChatBtn.addEventListener('click', createSession);
    }
    if (collapseSidebarBtn) {
      collapseSidebarBtn.addEventListener('click', toggleSidebar);
    }
    if (sidebarExpandBtn) {
      sidebarExpandBtn.addEventListener('click', openSidebar);
    }
    if (sidebarToggle) {
      sidebarToggle.addEventListener('click', toggleSidebar);
    }
    if (sidebarOverlay) {
      sidebarOverlay.addEventListener('click', closeSidebar);
    }

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeModelPicker();
        closeAttachmentPreview();
        closeChatImagePreview();
      }
    });

    const composerInput = document.querySelector('.composer-input');
    if (composerInput) {
      let dragDepth = 0;
      const setDragState = (active) => {
        composerInput.classList.toggle('drag-over', Boolean(active));
      };

      composerInput.addEventListener('dragenter', (event) => {
        if (!dataTransferHasFiles(event.dataTransfer)) return;
        event.preventDefault();
        dragDepth += 1;
        setDragState(true);
      });

      composerInput.addEventListener('dragover', (event) => {
        if (!dataTransferHasFiles(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      });

      composerInput.addEventListener('dragleave', (event) => {
        if (!dataTransferHasFiles(event.dataTransfer)) return;
        event.preventDefault();
        dragDepth = Math.max(0, dragDepth - 1);
        if (dragDepth === 0) {
          setDragState(false);
        }
      });

      composerInput.addEventListener('drop', async (event) => {
        if (!dataTransferHasFiles(event.dataTransfer)) return;
        event.preventDefault();
        dragDepth = 0;
        setDragState(false);
        const files = extractFiles(event.dataTransfer);
        if (!files.length) return;
        let okCount = 0;
        for (const file of files) {
          if (await handleFileSelect(file)) okCount += 1;
        }
        if (okCount > 0) {
          toast(`已添加 ${okCount} 个文件`, 'success');
        }
        if (okCount < files.length) {
          toast('部分文件读取失败', 'error');
        }
      });

      document.addEventListener('dragover', (event) => {
        if (!dataTransferHasFiles(event.dataTransfer)) return;
        event.preventDefault();
      });

      document.addEventListener('drop', (event) => {
        if (!dataTransferHasFiles(event.dataTransfer)) return;
        if (composerInput.contains(event.target)) return;
        event.preventDefault();
      });
    }

    const handleScrollTracking = () => {
      if (suppressScrollTracking) return;
      if (isSending) {
        lockStreamScrollFollow();
        return;
      }
      updateFollowStreamScroll();
    };
    const handleUserScrollIntent = () => {
      lockStreamScrollFollow();
    };
    if (chatLog) {
      chatLog.addEventListener('scroll', handleScrollTracking, { passive: true });
      chatLog.addEventListener('wheel', handleUserScrollIntent, { passive: true });
      chatLog.addEventListener('touchmove', handleUserScrollIntent, { passive: true });
      chatLog.addEventListener('pointerdown', handleUserScrollIntent, { passive: true });
    }
    window.addEventListener('scroll', handleScrollTracking, { passive: true });
    window.addEventListener('wheel', handleUserScrollIntent, { passive: true });
    window.addEventListener('touchmove', handleUserScrollIntent, { passive: true });
  }

  updateRangeValues();
  setSendingState(false);
  bindEvents();
  restoreSidebarState();
  loadSessions();
  loadModels();
})();



