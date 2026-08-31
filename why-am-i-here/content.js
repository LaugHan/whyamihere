// ====== Why Am I Here? - Content Script (P0 redesign: three-path checkpoint) ======

(function () {
  'use strict';

  const DEFAULT_MIN_CHARS = 10;

  // Prevent duplicate injection
  const existing = document.getElementById('__whyamIhere_host__');
  if (existing) existing.remove();

  if (window.__whyAmIHereInjected) return;
  window.__whyAmIHereInjected = true;

  // Rotating question copy (HabitLab: vary the intervention to fight habituation)
  const QUESTIONS = [
    '你为什么打开这个网站？',
    '你现在最该做的一件事是什么？',
    '这次和上一次的理由一样吗？',
    '你本来打算做什么来着？',
    '来到这里，是主动的还是自动的？',
  ];

  // Fair char counting: CJK char = 1, contiguous latin word = 1, number run = 1
  function countIntentChars(text) {
    const s = String(text || '');
    const cjk = (s.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af\u3000-\u303f\uff00-\uffef]/g) || []).length;
    const rest = s.replace(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af\u3000-\u303f\uff00-\uffef]/g, ' ');
    const words = (rest.match(/[a-zA-Z]+/g) || []).length;
    const nums = (rest.match(/\d+/g) || []).length;
    return cjk + words + nums;
  }

  function loadLastSnooze() {
    return new Promise((resolve) => {
      chrome.storage.local.get('lastSnoozeMinutes', (r) => {
        resolve(r.lastSnoozeMinutes || null);
      });
    });
  }

  function saveLastSnooze(minutes) {
    chrome.storage.local.set({ lastSnoozeMinutes: minutes });
  }

  // ====== Overlay UI (Shadow DOM, non-modal: page stays usable) ======
  function createOverlay(domain, url, minChars, dayCount) {
    const existing = document.getElementById('__whyamIhere_host__');
    if (existing) existing.remove();

    const host = document.createElement('div');
    host.id = '__whyamIhere_host__';
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });

    // Progressive escalation from the 3rd prompt today
    const escalated = dayCount >= 3;
    const snoozeOptions = escalated
      ? [[15, '15 分钟'], [30, '30 分钟']]
      : [[15, '15 分钟'], [30, '30 分钟'], [60, '1 小时'], [120, '2 小时'], [240, '4 小时']];
    const grazeOptions = escalated ? [3, 5] : [3, 5, 10];
    const holdMs = escalated ? 4000 : 2000;

    const question = QUESTIONS[Math.max(0, dayCount - 1) % QUESTIONS.length];

    const snoozeChips = snoozeOptions
      .map(([min, label]) => `<button class="snooze-chip" data-min="${min}">${label}</button>`)
      .join('');
    const grazeChips = grazeOptions
      .map((min) => `<button class="graze-chip" data-min="${min}">${min} 分钟</button>`)
      .join('');

    shadow.innerHTML = `
      <style>
        :host { all: initial; }
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
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
          box-sizing: border-box;
        }
        @keyframes slideIn {
          from { transform: translateX(120%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .panel * { box-sizing: border-box; }
        .header {
          padding: 20px 24px 0;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
        }
        .header h2 { margin: 0; font-size: 18px; font-weight: 700; color: #1a1a2e; }
        .header .subtitle { font-size: 12px; color: #999; font-weight: 400; display: block; margin-top: 2px; }
        .day-badge {
          flex-shrink: 0;
          background: #fff3e0;
          color: #e65100;
          font-size: 12px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 20px;
          white-space: nowrap;
          margin-top: 2px;
        }
        .body { padding: 14px 24px 20px; }
        .prompt-text { font-size: 14px; color: #555; line-height: 1.6; margin: 0 0 12px; }
        .prompt-text strong { color: #1a1a2e; }
        .domain-badge {
          display: inline-block;
          background: #f0f2f5;
          color: #555;
          font-size: 12px;
          font-weight: 600;
          padding: 3px 10px;
          border-radius: 20px;
          margin-bottom: 10px;
        }
        .section-label { font-size: 12px; color: #888; font-weight: 600; margin: 14px 0 8px; }
        .chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .intent-chip {
          padding: 7px 14px;
          border: 1.5px solid #ddd;
          background: #fff;
          border-radius: 20px;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.15s;
          font-family: inherit;
          color: #333;
        }
        .intent-chip:hover { border-color: #ff9800; color: #e65100; }
        .intent-chip.active { background: #fff3e0; border-color: #ff9800; color: #e65100; font-weight: 600; }
        textarea {
          width: 100%;
          min-height: 64px;
          padding: 10px 12px;
          border: 2px solid #e0e0e0;
          border-radius: 10px;
          font-size: 13px;
          line-height: 1.6;
          resize: vertical;
          outline: none;
          font-family: inherit;
          transition: border-color 0.2s;
          margin-top: 8px;
        }
        textarea:focus { border-color: #ff9800; }
        .char-counter { text-align: right; font-size: 12px; color: #999; margin-top: 4px; }
        .char-counter.warn { color: #e65100; }
        .char-counter.ok { color: #2e7d32; }
        .snooze-row { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
        .snooze-chip {
          padding: 4px 11px;
          border: 1.5px solid #ddd;
          background: #fff;
          border-radius: 20px;
          font-size: 12px;
          cursor: pointer;
          font-family: inherit;
          color: #444;
        }
        .snooze-chip:hover { border-color: #ff9800; color: #e65100; }
        .snooze-chip.active { background: #fff3e0; border-color: #ff9800; color: #e65100; font-weight: 600; }
        .submit-btn {
          width: 100%;
          padding: 12px;
          margin-top: 14px;
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
        .submit-btn:disabled { background: #ccc; cursor: not-allowed; }
        .divider { display: flex; align-items: center; gap: 10px; color: #bbb; font-size: 12px; margin: 16px 0 10px; }
        .divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: #eee; }
        .alt-row { display: flex; gap: 8px; }
        .alt-btn {
          flex: 1;
          padding: 9px 10px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          border: 1.5px solid #e0e0e0;
          background: #fff;
          color: #444;
          font-family: inherit;
        }
        .alt-btn.danger { border-color: #ffd6d6; color: #c62828; background: #fff5f5; }
        .alt-btn.danger:hover { border-color: #c62828; }
        .graze-wrap { display: none; margin-top: 8px; }
        .graze-wrap.open { display: block; }
        .graze-row { display: flex; gap: 6px; flex-wrap: wrap; }
        .graze-chip {
          flex: 1;
          padding: 8px 8px;
          border: 1.5px solid #e0e0e0;
          background: #fafafa;
          border-radius: 10px;
          font-size: 13px;
          cursor: pointer;
          font-family: inherit;
          color: #333;
        }
        .graze-chip:hover { border-color: #ff9800; color: #e65100; }
        .hold-skip {
          margin-top: 12px;
          width: 100%;
          padding: 10px;
          border-radius: 10px;
          border: none;
          background: #f5f5f5;
          color: #888;
          font-size: 13px;
          cursor: pointer;
          font-family: inherit;
          position: relative;
          overflow: hidden;
          user-select: none;
          -webkit-user-select: none;
        }
        .hold-skip.holding { color: #555; }
        .hold-progress {
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 0%;
          background: rgba(255, 152, 0, 0.25);
          transition: width 0.1s linear;
          pointer-events: none;
        }
        .hold-skip span { position: relative; z-index: 1; }
        .hint { text-align: center; font-size: 11px; color: #c0c0c0; margin-top: 8px; }
      </style>
      <div class="panel">
        <div class="header">
          <div>
            <h2>Why Am I Here? <span class="subtitle">/ 我咋在这？</span></h2>
          </div>
          <span class="day-badge">今天第 ${dayCount} 次</span>
        </div>
        <div class="body">
          <span class="domain-badge">${escapeHtml(domain)}</span>
          <p class="prompt-text">你在这里停留了一会儿。<br><strong>${escapeHtml(question)}</strong></p>

          <div class="section-label">这次来是为了：</div>
          <div class="chips" id="__why_chips__">
            <button class="intent-chip" data-intent="查资料">查资料</button>
            <button class="intent-chip" data-intent="看关注的更新">看关注的更新</button>
            <button class="intent-chip" data-intent="找具体问题">找具体问题</button>
            <button class="intent-chip" data-intent="就随便看看">就随便看看</button>
          </div>
          <textarea id="__why_textarea__" placeholder="或写一句（至少 ${minChars} 字）：例如 查一下这个工具的官方文档，看看有没有我需要的内容" maxlength="300"></textarea>
          <div class="char-counter" id="__why_counter__">0 / ${minChars} 字（未达标）</div>

          <div class="section-label">接下来一段时间不再打扰：</div>
          <div class="snooze-row" id="__why_snoozes__">${snoozeChips}</div>

          <button class="submit-btn" id="__why_submit__" disabled>继续浏览（1 小时后）</button>

          <div class="divider">或者</div>
          <div class="alt-row">
            <button class="alt-btn danger" id="__why_close__">我没目的，关掉它</button>
            <button class="alt-btn" id="__why_graze_toggle__">限时放风 ▾</button>
          </div>
          <div class="graze-wrap" id="__why_graze__">
            <div class="section-label">放风时长（到点自动再问）：</div>
            <div class="graze-row" id="__why_graze_row__">${grazeChips}</div>
          </div>

          <button class="hold-skip" id="__why_hold__"><span class="hold-progress" id="__why_hold_progress__"></span><span id="__why_hold_label__">长按 ${holdMs / 1000} 秒跳过本次（不记录）</span></button>
          <div class="hint">Ctrl / ⌘ + Enter 提交 · Esc 展开更多选择</div>
        </div>
      </div>
    `;

    bindEvents(shadow, host, {
      domain, url, minChars, dayCount,
      snoozeOptions, grazeOptions, holdMs, escalated,
    });
    return host;
  }

  function bindEvents(shadow, host, ctx) {
    const { domain, url, minChars, snoozeOptions, grazeOptions, holdMs, escalated } = ctx;

    const chipsContainer = shadow.getElementById('__why_chips__');
    const textarea = shadow.getElementById('__why_textarea__');
    const counter = shadow.getElementById('__why_counter__');
    const snoozes = shadow.getElementById('__why_snoozes__');
    const submitBtn = shadow.getElementById('__why_submit__');
    const closeBtn = shadow.getElementById('__why_close__');
    const grazeToggle = shadow.getElementById('__why_graze_toggle__');
    const grazeWrap = shadow.getElementById('__why_graze__');
    const grazeRow = shadow.getElementById('__why_graze_row__');
    const holdBtn = shadow.getElementById('__why_hold__');
    const holdProgress = shadow.getElementById('__why_hold_progress__');
    const holdLabel = shadow.getElementById('__why_hold_label__');

    let selectedIntent = null;      // chip text or typed reason
    let snoozeMinutes = null;      // null = use default
    let grazeOpen = false;
    let holdTimer = null;
    let holdStart = null;

    // ---- default snooze: remember last choice; fall back to 60 (15 when escalated) ----
    loadLastSnooze().then((last) => {
      const fallback = escalated ? 15 : 60;
      const preferred = (last !== null && snoozeOptions.some(([m]) => m === last)) ? last : fallback;
      snoozeMinutes = preferred;
      highlightSnooze(preferred);
      updateSubmitLabel();
    });

    function highlightSnooze(min) {
      snoozes.querySelectorAll('.snooze-chip').forEach((b) => {
        b.classList.toggle('active', parseInt(b.dataset.min, 10) === min);
      });
    }

    function updateSubmitLabel() {
      const m = snoozeMinutes || (escalated ? 15 : 60);
      const label = m >= 60
        ? `继续浏览（${m / 60} 小时后）`
        : `继续浏览（${m} 分钟后）`;
      submitBtn.textContent = label;
    }

    function updateSubmitState() {
      const len = countIntentChars(textarea.value);
      const met = selectedIntent !== null || len >= minChars;
      if (met) {
        counter.textContent = `${len} / ${minChars} 字 ✓`;
        counter.className = 'char-counter ok';
        submitBtn.disabled = false;
      } else {
        counter.textContent = `${len} / ${minChars} 字（未达标）`;
        counter.className = 'char-counter warn';
        submitBtn.disabled = true;
      }
    }

    // ---- intent chips ----
    chipsContainer.addEventListener('click', (e) => {
      const chip = e.target.closest('.intent-chip');
      if (!chip) return;
      selectedIntent = chip.dataset.intent;
      chipsContainer.querySelectorAll('.intent-chip').forEach((b) => b.classList.remove('active'));
      chip.classList.add('active');
      updateSubmitState();
    });

    textarea.addEventListener('input', () => {
      if (selectedIntent !== null) {
        selectedIntent = null;
        chipsContainer.querySelectorAll('.intent-chip').forEach((b) => b.classList.remove('active'));
      }
      updateSubmitState();
    });

    // ---- snooze chips ----
    snoozes.addEventListener('click', (e) => {
      const chip = e.target.closest('.snooze-chip');
      if (!chip) return;
      snoozeMinutes = parseInt(chip.dataset.min, 10);
      highlightSnooze(snoozeMinutes);
      saveLastSnooze(snoozeMinutes);
      updateSubmitLabel();
    });

    // ---- focus etiquette: never steal the keyboard from someone typing ----
    const activeEl = document.activeElement;
    const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
    if (!isTyping) {
      setTimeout(() => textarea.focus(), 400);
    }

    // ---- keyboard: Ctrl/Cmd+Enter submit, Esc toggles graze ----
    document.addEventListener('keydown', onKeydown);
    function onKeydown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (!submitBtn.disabled) submit();
      } else if (e.key === 'Escape') {
        toggleGraze(true);
      }
    }

    function toggleGraze(forceOpen) {
      grazeOpen = forceOpen === undefined ? !grazeOpen : forceOpen;
      grazeWrap.classList.toggle('open', grazeOpen);
      grazeToggle.textContent = grazeOpen ? '限时放风 ▴' : '限时放风 ▾';
    }
    grazeToggle.addEventListener('click', () => toggleGraze());

    // ---- submit (path 1: have a purpose) ----
    function submit() {
      const reason = selectedIntent !== null ? selectedIntent : textarea.value.trim();
      const snoozeH = Math.floor(snoozeMinutes / 60);
      const snoozeM = snoozeMinutes % 60;

      submitBtn.disabled = true;
      submitBtn.textContent = '好的，继续吧...';

      const entry = { domain, url, reason, snoozeHours: snoozeH, snoozeMinutes: snoozeM, outcome: 'purpose' };

      chrome.runtime.sendMessage({ type: 'DISMISS_OVERLAY' }, () => {
        chrome.runtime.sendMessage({ type: 'SAVE_ENTRY', data: entry }, () => {
          chrome.runtime.sendMessage({ type: 'SET_SNOOZE', domain, hours: snoozeH, minutes: snoozeM }, () => {
            cleanup();
          });
        });
      });
    }
    submitBtn.addEventListener('click', submit);

    // ---- path 2a: no purpose, close the tab ----
    closeBtn.addEventListener('click', () => {
      closeBtn.disabled = true;
      closeBtn.textContent = '好，再见...';
      const entry = { domain, url, reason: '', snoozeHours: 0, snoozeMinutes: 0, outcome: 'no_purpose_close' };
      chrome.runtime.sendMessage({ type: 'SAVE_ENTRY', data: entry }, () => {
        chrome.runtime.sendMessage({ type: 'DISMISS_OVERLAY' }, () => {
          chrome.runtime.sendMessage({ type: 'CLOSE_TAB' }, () => cleanup());
        });
      });
    });

    // ---- path 2b: bounded grazing ----
    grazeRow.addEventListener('click', (e) => {
      const chip = e.target.closest('.graze-chip');
      if (!chip) return;
      const minutes = parseInt(chip.dataset.min, 10);
      grazeRow.querySelectorAll('.graze-chip').forEach((b) => { b.disabled = true; });
      chip.textContent = `${minutes} 分钟，开始...`;
      const entry = { domain, url, reason: '', snoozeHours: 0, snoozeMinutes: minutes, outcome: 'graze' };
      chrome.runtime.sendMessage({ type: 'SAVE_ENTRY', data: entry }, () => {
        chrome.runtime.sendMessage({ type: 'DISMISS_OVERLAY' }, () => {
          chrome.runtime.sendMessage({ type: 'SET_SNOOZE', domain, hours: 0, minutes }, () => cleanup());
        });
      });
    });

    // ---- path 3: long-press to skip (friction on the exit, not the answer) ----
    function holdStartHandler(e) {
      e.preventDefault();
      holdStart = Date.now();
      holdBtn.classList.add('holding');
      let width = 0;
      holdProgress.style.width = '0%';
      holdLabel.textContent = `再坚持 ${holdMs / 1000} 秒...`;
      holdTimer = setInterval(() => {
        width = Math.min(100, ((Date.now() - holdStart) / holdMs) * 100);
        holdProgress.style.width = `${width}%`;
        if (Date.now() - holdStart >= holdMs) {
          finishHold();
        }
      }, 50);
    }
    function holdCancelHandler() {
      if (!holdTimer) return;
      clearInterval(holdTimer);
      holdTimer = null;
      holdBtn.classList.remove('holding');
      holdProgress.style.width = '0%';
      holdLabel.textContent = `长按 ${holdMs / 1000} 秒跳过本次（不记录）`;
    }
    function finishHold() {
      clearInterval(holdTimer);
      holdTimer = null;
      holdLabel.textContent = '本次已放行';
      chrome.runtime.sendMessage({ type: 'SKIP_EVENT', domain }, () => {
        chrome.runtime.sendMessage({ type: 'DISMISS_OVERLAY' }, () => cleanup());
      });
    }
    holdBtn.addEventListener('mousedown', holdStartHandler);
    holdBtn.addEventListener('touchstart', holdStartHandler, { passive: false });
    holdBtn.addEventListener('mouseup', holdCancelHandler);
    holdBtn.addEventListener('mouseleave', holdCancelHandler);
    holdBtn.addEventListener('touchend', holdCancelHandler);
    holdBtn.addEventListener('touchcancel', holdCancelHandler);

    function cleanup() {
      document.removeEventListener('keydown', onKeydown);
      holdCancelHandler();
      host.remove();
      window.__whyAmIHereInjected = false;
    }
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
        createOverlay(message.domain, message.url, minChars, message.dayCount || 1);
        sendResponse({ received: true });
      });
      return true;
    }
  });
})();
