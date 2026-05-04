// ====== Why Am I Here? - Content Script ======

(function () {
  'use strict';

  const DEFAULT_MIN_CHARS = 50;

  // Prevent duplicate injection
  // Remove previous overlay hook if any (on SPA navigation)
  const existing = document.getElementById('__whyamIhere_host__');
  if (existing) existing.remove();

  if (window.__whyAmIHereInjected) return;
  window.__whyAmIHereInjected = true;

  // ====== Overlay UI (Shadow DOM) ======
  function createOverlay(domain, url, minChars) {
    // Remove existing overlay if any
    const existing = document.getElementById('__whyamIhere_host__');
    if (existing) existing.remove();

    const host = document.createElement('div');
    host.id = '__whyamIhere_host__';
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });

    shadow.innerHTML = `
      <style>
        :host {
          all: initial;
        }
        .overlay-backdrop {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 0, 0, 0.35);
          z-index: 2147483646;
          display: flex;
          align-items: flex-start;
          justify-content: flex-end;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
        }
        .panel {
          position: fixed;
          top: 20px;
          right: 20px;
          width: 380px;
          max-height: calc(100vh - 40px);
          background: #fff;
          border-radius: 16px;
          box-shadow: 0 8px 40px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0,0,0,0.05);
          overflow-y: auto;
          animation: slideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1);
          z-index: 2147483647;
        }
        @keyframes slideIn {
          from { transform: translateX(120%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .panel-header {
          padding: 20px 24px 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .panel-header h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 700;
          color: #1a1a2e;
        }
        .panel-header .subtitle {
          font-size: 12px;
          color: #999;
          font-weight: 400;
        }
        .panel-body {
          padding: 16px 24px;
        }
        .domain-badge {
          display: inline-block;
          background: #fff3e0;
          color: #e65100;
          font-size: 12px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 20px;
          margin-bottom: 12px;
        }
        .prompt-text {
          font-size: 14px;
          color: #555;
          line-height: 1.6;
          margin-bottom: 16px;
        }
        .prompt-text strong {
          color: #1a1a2e;
        }
        textarea {
          width: 100%;
          min-height: 90px;
          padding: 12px 14px;
          border: 2px solid #e0e0e0;
          border-radius: 10px;
          font-size: 14px;
          line-height: 1.6;
          resize: vertical;
          outline: none;
          box-sizing: border-box;
          font-family: inherit;
          transition: border-color 0.2s;
        }
        textarea:focus {
          border-color: #ff9800;
        }
        .char-counter {
          display: flex;
          justify-content: flex-end;
          font-size: 12px;
          color: #999;
          margin-top: 6px;
        }
        .char-counter.warn { color: #e65100; }
        .char-counter.ok { color: #2e7d32; }
        .snooze-section {
          margin-top: 16px;
          background: #fafafa;
          border-radius: 10px;
          padding: 14px 16px;
        }
        .snooze-section label {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: #333;
          margin-bottom: 10px;
        }
        .snooze-presets {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin-bottom: 10px;
        }
        .snooze-preset {
          padding: 5px 12px;
          border: 1.5px solid #ddd;
          background: #fff;
          border-radius: 20px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
          font-family: inherit;
        }
        .snooze-preset:hover {
          border-color: #ff9800;
          color: #e65100;
        }
        .snooze-preset.active {
          background: #fff3e0;
          border-color: #ff9800;
          color: #e65100;
          font-weight: 600;
        }
        .snooze-custom {
          display: flex;
          gap: 8px;
          align-items: center;
          font-size: 13px;
          color: #666;
        }
        .snooze-custom input {
          width: 50px;
          padding: 6px 8px;
          border: 1.5px solid #ddd;
          border-radius: 8px;
          text-align: center;
          font-size: 13px;
          font-family: inherit;
          outline: none;
        }
        .snooze-custom input:focus {
          border-color: #ff9800;
        }
        .submit-btn {
          width: 100%;
          padding: 12px;
          margin-top: 16px;
          background: #1a1a2e;
          color: #fff;
          border: none;
          border-radius: 10px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
        }
        .submit-btn:hover { background: #333; }
        .submit-btn:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
        .footer-note {
          text-align: center;
          font-size: 11px;
          color: #bbb;
          margin-top: 10px;
          padding-bottom: 4px;
        }
      </style>
      <div class="overlay-backdrop">
        <div class="panel">
          <div class="panel-header">
            <div>
              <h2>Why Am I Here? <span class="subtitle">/ 我咋在这？</span></h2>
            </div>
          </div>
          <div class="panel-body">
            <span class="domain-badge">${escapeHtml(domain)}</span>
            <p class="prompt-text">
              你已经在 <strong>${escapeHtml(domain)}</strong> 停留了一段时间。<br>
              请写下你打开这个网站的<strong>目的</strong>（至少 ${minChars} 字）：
            </p>
            <textarea
              id="__why_textarea__"
              placeholder="例如：我想查找关于机器学习的整理贴，收集资料..."
              maxlength="300"
            ></textarea>
            <div class="char-counter" id="__why_counter__">0 / ${minChars} 字（未达标）</div>
            <div class="snooze-section">
              <label>选择下次提醒时间：</label>
              <div class="snooze-presets" id="__why_presets__">
                <button class="snooze-preset" data-h="0" data-m="30">30 分钟</button>
                <button class="snooze-preset active" data-h="1" data-m="0">1 小时</button>
                <button class="snooze-preset" data-h="2" data-m="0">2 小时</button>
                <button class="snooze-preset" data-h="4" data-m="0">4 小时</button>
                <button class="snooze-preset" data-h="12" data-m="0">12 小时</button>
              </div>
              <div class="snooze-custom">
                自定义：
                <input type="number" id="__why_hours__" value="1" min="0" max="72" size="3"> 小时
                <input type="number" id="__why_mins__" value="0" min="0" max="59" size="3"> 分钟
              </div>
            </div>
            <button class="submit-btn" id="__why_submit__" disabled>
              我想好了，提交
            </button>
            <div class="footer-note">写下来，把思路拉回来</div>
          </div>
        </div>
      </div>
    `;

    bindEvents(shadow, host, domain, minChars);
    return host;
  }

  function bindEvents(shadow, host, domain, minChars) {
    const textarea = shadow.getElementById('__why_textarea__');
    const counter = shadow.getElementById('__why_counter__');
    const submitBtn = shadow.getElementById('__why_submit__');
    const presetsContainer = shadow.getElementById('__why_presets__');
    const hoursInput = shadow.getElementById('__why_hours__');
    const minsInput = shadow.getElementById('__why_mins__');

    let snoozeHours = 1;
    let snoozeMinutes = 0;

    function updateSubmitState() {
      const len = textarea.value.replace(/\s/g, '').length;
      counter.textContent = `${len} / ${minChars} 字`;
      counter.className = 'char-counter';
      if (len >= minChars) {
        counter.textContent += ' ✓';
        counter.className = 'char-counter ok';
        submitBtn.disabled = false;
        submitBtn.textContent = '我想好了，提交';
      } else {
        counter.textContent += '（未达标）';
        counter.className = 'char-counter warn';
        submitBtn.disabled = true;
        const remaining = minChars - len;
        submitBtn.textContent = `还差 ${remaining} 字，继续写...`;
      }
    }

    textarea.addEventListener('input', updateSubmitState);

    // Preset buttons
    presetsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.snooze-preset');
      if (!btn) return;
      presetsContainer.querySelectorAll('.snooze-preset').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      snoozeHours = parseInt(btn.dataset.h);
      snoozeMinutes = parseInt(btn.dataset.m);
      hoursInput.value = snoozeHours;
      minsInput.value = snoozeMinutes;
    });

    // Custom inputs
    hoursInput.addEventListener('input', () => {
      snoozeHours = Math.max(0, Math.min(72, parseInt(hoursInput.value) || 0));
      hoursInput.value = snoozeHours;
      presetsContainer.querySelectorAll('.snooze-preset').forEach(b => b.classList.remove('active'));
    });
    minsInput.addEventListener('input', () => {
      snoozeMinutes = Math.max(0, Math.min(59, parseInt(minsInput.value) || 0));
      minsInput.value = snoozeMinutes;
      presetsContainer.querySelectorAll('.snooze-preset').forEach(b => b.classList.remove('active'));
    });

    // Submit
    submitBtn.addEventListener('click', () => {
      const reason = textarea.value.trim();
      if (reason.replace(/\s/g, '').length < minChars) return;

      // Disable immediately to prevent double-submit
      submitBtn.disabled = true;
      submitBtn.textContent = '提交中...';

      const entry = {
        domain,
        url,
        reason,
        snoozeHours,
        snoozeMinutes,
      };

      // 1. Tell background overlay is being dismissed (stop re-scheduling)
      chrome.runtime.sendMessage({ type: 'DISMISS_OVERLAY' }, () => {
        // 2. Save entry
        chrome.runtime.sendMessage({ type: 'SAVE_ENTRY', data: entry }, () => {
          // 3. Set snooze
          chrome.runtime.sendMessage({
            type: 'SET_SNOOZE',
            domain,
            hours: snoozeHours,
            minutes: snoozeMinutes,
          }, () => {
            host.remove();
            window.__whyAmIHereInjected = false;
          });
        });
      });
    });

    // Auto-focus textarea
    setTimeout(() => textarea.focus(), 400);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function getMinChars() {
    return new Promise((resolve) => {
      chrome.storage.sync.get('minChars', (result) => {
        const minChars = Number.parseInt(result.minChars, 10);
        resolve(Number.isFinite(minChars) ? Math.max(1, Math.min(300, minChars)) : DEFAULT_MIN_CHARS);
      });
    });
  }

  // ====== Message listener ======
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SHOW_OVERLAY') {
      getMinChars().then((minChars) => {
        createOverlay(message.domain, message.url, minChars);
        sendResponse({ received: true });
      });
      return true;
    }
  });
})();
