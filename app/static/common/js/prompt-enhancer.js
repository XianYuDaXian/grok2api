(() => {

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
      .prompt-enhance-btn:disabled {
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

  async function onEnhanceClick(textarea, button) {
    const raw = String(textarea.value || '').trim();
    if (!raw) {
      toast('请先输入提示词', 'warning');
      return;
    }
    const prevText = button.textContent;
    button.disabled = true;
    button.textContent = '增强中...';
    try {
      const enhanced = await callEnhanceApi(raw);
      textarea.value = enhanced;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
      toast('提示词增强完成', 'success');
    } catch (e) {
      const msg = String(e && e.message ? e.message : e);
      if (msg === 'public_key_missing') {
        toast('请先配置 Public Key', 'error');
      } else {
        toast(`提示词增强失败: ${msg}`, 'error');
      }
    } finally {
      button.disabled = false;
      button.textContent = prevText;
    }
  }

  function mountEnhancer(textarea) {
    if (!isPromptTextarea(textarea)) return;
    if (textarea.dataset.promptEnhancerMounted === '1') return;
    const parent = textarea.parentElement;
    if (!parent) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'prompt-enhance-wrap';
    parent.insertBefore(wrapper, textarea);
    wrapper.appendChild(textarea);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'geist-button-outline prompt-enhance-btn';
    button.textContent = '增强提示词';
    button.addEventListener('click', () => onEnhanceClick(textarea, button));
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
