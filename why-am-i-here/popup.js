// ====== Why Am I Here? - Popup Script ======

document.addEventListener('DOMContentLoaded', () => {
  const domainList = document.getElementById('domainList');
  const newDomainInput = document.getElementById('newDomain');
  const addBtn = document.getElementById('addBtn');
  const addError = document.getElementById('addError');
  const snoozeStatus = document.getElementById('snoozeStatus');
  const historyBtn = document.getElementById('historyBtn');
  const timerSecondsInput = document.getElementById('timerSeconds');
  const minCharsInput = document.getElementById('minChars');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const demoModeBtn = document.getElementById('demoModeBtn');
  const settingsStatus = document.getElementById('settingsStatus');

  loadDomains();
  loadSnoozeStatus();
  loadSettings();

  // Add domain
  addBtn.addEventListener('click', addDomain);
  newDomainInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addDomain();
  });

  // Open history
  historyBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'history.html' });
  });

  saveSettingsBtn.addEventListener('click', saveSettings);
  demoModeBtn.addEventListener('click', () => {
    timerSecondsInput.value = 5;
    minCharsInput.value = 10;
    saveSettings('演示模式已开启');
  });

  function addDomain() {
    const domain = newDomainInput.value.trim().toLowerCase();
    addError.textContent = '';

    if (!domain) {
      addError.textContent = '请输入域名';
      return;
    }

    // Basic domain validation
    if (!/^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/.test(domain)) {
      addError.textContent = '域名格式不正确（如: zhihu.com）';
      return;
    }

    chrome.runtime.sendMessage({ type: 'ADD_DOMAIN', domain }, (response) => {
      if (response && response.success) {
        newDomainInput.value = '';
        renderDomains(response.domains);
      } else {
        addError.textContent = (response && response.error) || '添加失败';
      }
    });
  }

  function loadDomains() {
    chrome.runtime.sendMessage({ type: 'GET_DOMAINS' }, (response) => {
      if (response && response.domains) {
        renderDomains(response.domains);
      }
    });
  }

  function renderDomains(domains) {
    domainList.innerHTML = '';
    if (domains.length === 0) {
      domainList.innerHTML = '<li style="color:#aaa;font-style:italic;">暂无监控域名</li>';
      return;
    }
    domains.forEach((domain) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span>${escapeHtml(domain)}</span>
        <button class="remove-domain" data-domain="${escapeHtml(domain)}" title="移除">×</button>
      `;
      li.querySelector('.remove-domain').addEventListener('click', () => removeDomain(domain));
      domainList.appendChild(li);
    });
  }

  function removeDomain(domain) {
    chrome.runtime.sendMessage({ type: 'REMOVE_DOMAIN', domain }, (response) => {
      if (response && response.success) {
        renderDomains(response.domains);
        loadSnoozeStatus();
      }
    });
  }

  function loadSnoozeStatus() {
    chrome.runtime.sendMessage({ type: 'GET_SNOOZE_STATUS' }, (response) => {
      if (response && response.status) {
        renderSnoozeStatus(response.status);
      }
    });
  }

  function loadSettings() {
    chrome.storage.sync.get(['timerSeconds', 'minChars'], (result) => {
      timerSecondsInput.value = result.timerSeconds || 60;
      minCharsInput.value = result.minChars || 50;
    });
  }

  function saveSettings(successMessage = '设置已保存') {
    const timerSeconds = clampNumber(timerSecondsInput.value, 3, 3600, 60);
    const minChars = clampNumber(minCharsInput.value, 1, 300, 50);

    timerSecondsInput.value = timerSeconds;
    minCharsInput.value = minChars;

    chrome.storage.sync.set({ timerSeconds, minChars }, () => {
      settingsStatus.textContent = successMessage;
      window.setTimeout(() => {
        settingsStatus.textContent = '';
      }, 1600);
    });
  }

  function clampNumber(value, min, max, fallback) {
    const number = Number.parseInt(value, 10);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
  }

  function renderSnoozeStatus(status) {
    const entries = Object.entries(status);
    if (entries.length === 0) {
      snoozeStatus.innerHTML = '<span class="no-snooze">所有域名正常监控中</span>';
      return;
    }
    snoozeStatus.innerHTML = entries.map(([domain, until]) => {
      const timeStr = new Date(until).toLocaleTimeString('zh-CN', {
        hour: '2-digit', minute: '2-digit',
      });
      const dateStr = new Date(until).toLocaleDateString('zh-CN', {
        month: 'short', day: 'numeric',
      });
      return `
        <div class="snooze-item">
          <span class="snooze-domain">${escapeHtml(domain)}</span>
          <span class="snooze-time">免打扰至 ${dateStr} ${timeStr}</span>
          <button class="clear-snooze" data-domain="${escapeHtml(domain)}">取消</button>
        </div>
      `;
    }).join('');

    // Bind clear snooze buttons
    snoozeStatus.querySelectorAll('.clear-snooze').forEach(btn => {
      btn.addEventListener('click', () => {
        const domain = btn.dataset.domain;
        chrome.runtime.sendMessage({ type: 'CLEAR_SNOOZE', domain }, () => {
          loadSnoozeStatus();
        });
      });
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});
