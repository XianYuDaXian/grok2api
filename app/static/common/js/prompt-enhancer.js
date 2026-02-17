(() => {
  const enhanceStateMap = new WeakMap();

  function toast(message, type) {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
    }
  }

  function injectStyles() {
    if (document.getElementById('promptEnhancerStyle')) return;
    const style = document.createElement('style');
    style.id = 'promptEnhancerStyle';
    style.textContent = `
      .prompt-enhance-wrap {
        position: relative;
        width: 100%;
      }
      .prompt-enhance-wrap > textarea {
        padding-bottom: 40px;
      }
      .prompt-enhance-wrap.lightbox-mode > textarea {
        width: 100%;
        display: block;
        box-sizing: border-box;
        padding-left: 112px;
        padding-right: 116px;
        min-height: 84px;
      }
      .prompt-enhance-wrap.lightbox-mode {
        flex: 1;
        min-width: 0;
        width: 100%;
        position: relative;
      }
      .prompt-enhance-wrap.lightbox-mode > .inline-send-inside,
      .prompt-enhance-wrap.lightbox-mode > #lightboxEditSend,
      .prompt-enhance-wrap.lightbox-mode > .lightbox-edit-send {
        position: absolute !important;
        left: 10px !important;
        bottom: 10px !important;
        z-index: 4;
        height: 30px !important;
        min-width: 104px;
        width: auto !important;
        margin: 0 !important;
        padding: 0 12px !important;
        border-radius: 8px;
        flex: none !important;
      }
      .prompt-enhance-wrap.lightbox-mode > .prompt-enhance-btn {
        position: absolute !important;
        right: 10px !important;
        bottom: 10px !important;
        z-index: 4;
        height: 30px !important;
        min-width: 104px;
        width: auto !important;
        margin: 0 !important;
        padding: 0 12px !important;
      }
      @media (max-width: 768px) {
        .prompt-enhance-wrap.lightbox-mode > textarea {
          padding-left: 104px;
          padding-right: 104px;
          padding-bottom: 50px;
          min-height: 96px;
        }
        .prompt-enhance-wrap.lightbox-mode > .inline-send-inside,
        .prompt-enhance-wrap.lightbox-mode > #lightboxEditSend,
        .prompt-enhance-wrap.lightbox-mode > .lightbox-edit-send {
          left: 8px !important;
          bottom: 8px !important;
          min-width: 92px;
          height: 28px !important;
          padding: 0 10px !important;
        }
        .prompt-enhance-wrap.lightbox-mode > .prompt-enhance-btn {
          right: 8px !important;
          bottom: 8px !important;
          min-width: 92px;
          height: 28px !important;
          padding: 0 10px !important;
        }
      }
      .prompt-enhance-btn {
        position: absolute;
        right: 10px;
        bottom: 10px;
        z-index: 3;
        height: 30px;
        min-width: 92px;
        padding: 0 10px;
        border-radius: 8px;
        background: var(--bg);
        border-color: var(--border);
        color: var(--fg);
        cursor: pointer;
        user-select: none;
      }
      .prompt-enhance-btn:hover {
        border-color: #000;
      }
      html[data-theme='dark'] .prompt-enhance-btn {
        background: #111821;
        border-color: #3b4654;
        color: var(--fg);
      }
      html[data-theme='dark'] .prompt-enhance-btn:hover {
        border-color: #6b7788;
        background: #1a2330;
      }
      .prompt-lang-toggle-btn {
        position: absolute;
        right: 110px;
        bottom: 10px;
        z-index: 3;
        height: 30px;
        min-width: 48px;
        padding: 0 10px;
        border-radius: 8px;
        background: var(--bg);
        border-color: var(--border);
        color: var(--fg);
        cursor: pointer;
        user-select: none;
        display: none;
      }
      .prompt-lang-toggle-btn.is-visible {
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .prompt-lang-toggle-btn:hover {
        border-color: #000;
      }
      html[data-theme='dark'] .prompt-lang-toggle-btn {
        background: #111821;
        border-color: #3b4654;
        color: var(--fg);
      }
      html[data-theme='dark'] .prompt-lang-toggle-btn:hover {
        border-color: #6b7788;
        background: #1a2330;
      }
      .prompt-enhance-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .prompt-lang-toggle-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `;
    document.head.appendChild(style);
  }

  function isPromptTextarea(el) {
    if (!(el instanceof HTMLTextAreaElement)) return false;
    if (el.readOnly) return false;
    const id = String(el.id || '').toLowerCase();
    const placeholder = String(el.placeholder || '');
    if (id.includes('prompt')) return true;
    if (el.classList.contains('lightbox-edit-input')) return true;
    if (placeholder.includes('提示词')) return true;
    return false;
  }

  async function callEnhanceApi(rawPrompt) {
    if (typeof window.ensurePublicKey !== 'function' || typeof window.buildAuthHeaders !== 'function') {
      throw new Error('public_auth_api_missing');
    }
    const authHeader = await window.ensurePublicKey();
    if (authHeader === null) {
      throw new Error('public_key_missing');
    }

    const body = {
      prompt: rawPrompt,
      temperature: 0.7,
    };

    const res = await fetch('/v1/public/prompt/enhance', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...window.buildAuthHeaders(authHeader),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let detail = '';
      try {
        const err = await res.json();
        detail = err && err.error && err.error.message ? String(err.error.message) : '';
      } catch (e) {
        // ignore
      }
      throw new Error(detail || `enhance_failed_${res.status}`);
    }
    const data = await res.json();
    const text = String((data && data.enhanced_prompt) || '').trim();
    if (!text) {
      throw new Error('enhance_empty_response');
    }
    return text;
  }

  function isMobileViewport() {
    return window.matchMedia('(max-width: 768px)').matches;
  }

  function parseEnhancedPrompt(text) {
    const raw = String(text || '').trim();
    const headMatch = raw.match(/^([\s\S]*?)\s*最终提示词：/);
    const enMatch = raw.match(/最终提示词：\s*([\s\S]*?)\s*中文参考版：/);
    const zhMatch = raw.match(/中文参考版：\s*([\s\S]*?)\s*可调参数：/);
    const tailMatch = raw.match(/(可调参数：[\s\S]*)$/);
    return {
      head: headMatch && headMatch[1] ? String(headMatch[1]).trim() : '',
      en: enMatch && enMatch[1] ? String(enMatch[1]).trim() : '',
      zh: zhMatch && zhMatch[1] ? String(zhMatch[1]).trim() : '',
      tail: tailMatch && tailMatch[1] ? String(tailMatch[1]).trim() : '',
      raw,
    };
  }

  function applyPromptToTextarea(textarea, value) {
    textarea.value = value;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function updateToggleButtonText(toggleBtn, mode) {
    toggleBtn.textContent = mode === 'zh' ? '中文' : 'EN';
  }

  function setToggleButtonVisible(toggleBtn, visible) {
    toggleBtn.classList.toggle('is-visible', Boolean(visible));
  }

  function setEnhanceButtonMode(enhanceBtn, mode) {
    enhanceBtn.dataset.mode = mode;
    enhanceBtn.textContent = mode === 'clear' ? '清空' : '增强提示词';
  }

  function resetEnhancerState(textarea, enhanceBtn, toggleBtn) {
    enhanceStateMap.delete(textarea);
    setToggleButtonVisible(toggleBtn, false);
    updateToggleButtonText(toggleBtn, 'zh');
    setEnhanceButtonMode(enhanceBtn, 'enhance');
  }

  function buildDesktopText(state, mode) {
    const middleLabel = mode === 'en' ? '最终提示词：' : '中文参考版：';
    const middleText = mode === 'en' ? state.en : state.zh;
    return `${state.head}\n\n${middleLabel}\n${middleText}\n\n${state.tail}`;
  }

  function applyEnhancedByMode(textarea, toggleBtn, mode) {
    const state = enhanceStateMap.get(textarea);
    if (!state) return;
    const mobile = isMobileViewport();
    if (mode === 'en' && state.en) {
      state.mode = 'en';
      if (mobile) {
        applyPromptToTextarea(textarea, state.en);
      } else {
        applyPromptToTextarea(textarea, buildDesktopText(state, 'en'));
      }
    } else if (mode === 'zh' && state.zh) {
      state.mode = 'zh';
      if (mobile) {
        applyPromptToTextarea(textarea, state.zh);
      } else {
        applyPromptToTextarea(textarea, buildDesktopText(state, 'zh'));
      }
    } else {
      applyPromptToTextarea(textarea, state.raw);
    }
    enhanceStateMap.set(textarea, state);
    updateToggleButtonText(toggleBtn, state.mode);
  }

  async function onEnhanceClick(textarea, enhanceBtn, toggleBtn) {
    const currentMode = String(enhanceBtn.dataset.mode || 'enhance');
    if (currentMode === 'clear') {
      applyPromptToTextarea(textarea, '');
      resetEnhancerState(textarea, enhanceBtn, toggleBtn);
      toast('已清空提示词', 'success');
      return;
    }

    const raw = String(textarea.value || '').trim();
    if (!raw) {
      toast('请先输入提示词', 'warning');
      return;
    }
    enhanceBtn.disabled = true;
    toggleBtn.disabled = true;
    enhanceBtn.textContent = '增强中...';
    try {
      const enhanced = await callEnhanceApi(raw);
      const parsed = parseEnhancedPrompt(enhanced);
      const hasDualLanguage = Boolean(parsed.en && parsed.zh && parsed.head && parsed.tail);
      const mode = ((enhanceStateMap.get(textarea) || {}).mode || 'zh');
      enhanceStateMap.set(textarea, {
        head: parsed.head,
        en: parsed.en,
        zh: parsed.zh,
        tail: parsed.tail,
        raw: parsed.raw,
        mode,
      });

      if (hasDualLanguage) {
        setToggleButtonVisible(toggleBtn, true);
        const applyMode = mode === 'en' ? 'en' : 'zh';
        applyEnhancedByMode(textarea, toggleBtn, applyMode);
      } else {
        setToggleButtonVisible(toggleBtn, false);
        applyPromptToTextarea(textarea, parsed.raw);
      }
      setEnhanceButtonMode(enhanceBtn, 'clear');
      toast('提示词增强完成', 'success');
    } catch (e) {
      const msg = String(e && e.message ? e.message : e);
      if (msg === 'public_key_missing') {
        toast('请先配置 Public Key', 'error');
      } else {
        toast(`提示词增强失败: ${msg}`, 'error');
      }
    } finally {
      enhanceBtn.disabled = false;
      toggleBtn.disabled = false;
      setEnhanceButtonMode(enhanceBtn, String(enhanceBtn.dataset.mode || 'enhance'));
    }
  }

  function mountEnhancer(textarea) {
    if (!isPromptTextarea(textarea)) return;
    if (textarea.dataset.promptEnhancerMounted === '1') return;
    const parent = textarea.parentElement;
    if (!parent) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'prompt-enhance-wrap';
    const isLightbox = textarea.classList.contains('lightbox-edit-input');
    if (isLightbox) {
      wrapper.classList.add('lightbox-mode');
    }
    parent.insertBefore(wrapper, textarea);
    wrapper.appendChild(textarea);

    function syncLightboxSendButton() {
      if (!isLightbox) return;
      const host = wrapper.parentElement;
      if (!host) return;
      const sendBtn = host.querySelector('#lightboxEditSend, .lightbox-edit-send');
      if (!(sendBtn instanceof HTMLButtonElement)) return;
      if (sendBtn.parentElement !== wrapper) {
        wrapper.appendChild(sendBtn);
      }
      sendBtn.classList.add('inline-send-inside');
    }

    if (isLightbox) {
      syncLightboxSendButton();
      requestAnimationFrame(syncLightboxSendButton);
      setTimeout(syncLightboxSendButton, 80);
      const host = wrapper.parentElement;
      if (host) {
        const observer = new MutationObserver(() => syncLightboxSendButton());
        observer.observe(host, { childList: true, subtree: false });
        wrapper.__lightboxSendObserver = observer;
      }
    }

    const langBtn = document.createElement('button');
    langBtn.type = 'button';
    langBtn.className = 'geist-button-outline prompt-lang-toggle-btn';
    updateToggleButtonText(langBtn, 'zh');
    langBtn.addEventListener('click', () => {
      const state = enhanceStateMap.get(textarea);
      if (!state || (!state.en && !state.zh) || !state.head || !state.tail) {
        toast('请先增强提示词', 'warning');
        return;
      }
      const nextMode = (state.mode || 'zh') === 'zh' ? 'en' : 'zh';
      applyEnhancedByMode(textarea, langBtn, nextMode);
    });
    wrapper.appendChild(langBtn);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'geist-button-outline prompt-enhance-btn';
    setEnhanceButtonMode(button, 'enhance');
    button.addEventListener('click', () => onEnhanceClick(textarea, button, langBtn));
    wrapper.appendChild(button);

    textarea.dataset.promptEnhancerMounted = '1';
  }

  function init() {
    injectStyles();
    const areas = Array.from(document.querySelectorAll('textarea'));
    areas.forEach((area) => mountEnhancer(area));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
