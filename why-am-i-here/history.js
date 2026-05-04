// ====== Why Am I Here? - History Page Script ======

document.addEventListener('DOMContentLoaded', () => {
  const historyList = document.getElementById('historyList');
  const emptyState = document.getElementById('emptyState');
  const domainFilter = document.getElementById('domainFilter');
  const entryCount = document.getElementById('entryCount');
  const snoozeBanner = document.getElementById('snoozeBanner');

  let allEntries = [];
  let snoozeStatus = {};

  loadAll();

  domainFilter.addEventListener('change', () => {
    renderHistory();
  });

  function loadAll() {
    // Load history and snooze status in parallel
    chrome.runtime.sendMessage({ type: 'GET_HISTORY' }, (response) => {
      if (response && response.history) {
        allEntries = response.history;
      }
      chrome.runtime.sendMessage({ type: 'GET_SNOOZE_STATUS' }, (res) => {
        if (res && res.status) {
          snoozeStatus = res.status;
        }
        populateDomainFilter();
        renderSnoozeBanner();
        renderHistory();
      });
    });
  }

  function populateDomainFilter() {
    const domains = [...new Set(allEntries.map(e => e.domain))].sort();
    const currentValue = domainFilter.value;
    domainFilter.innerHTML = '<option value="">全部域名</option>';
    domains.forEach(d => {
      const option = document.createElement('option');
      option.value = d;
      option.textContent = d;
      domainFilter.appendChild(option);
    });
    domainFilter.value = currentValue;
  }

  function renderSnoozeBanner() {
    const entries = Object.entries(snoozeStatus);
    if (entries.length === 0) {
      snoozeBanner.className = 'snooze-banner';
      snoozeBanner.innerHTML = '';
      return;
    }
    snoozeBanner.className = 'snooze-banner has-snooze';
    snoozeBanner.innerHTML = entries.map(([domain, until]) => {
      const dateStr = new Date(until).toLocaleString('zh-CN', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
      return `
        <span class="snooze-banner-text">
          <strong>${escapeHtml(domain)}</strong> 免打扰中，至 ${dateStr}
        </span>
        <button class="cancel-banner-btn" data-domain="${escapeHtml(domain)}">取消免打扰</button>
      `;
    }).join('');

    snoozeBanner.querySelectorAll('.cancel-banner-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        cancelSnooze(btn.dataset.domain);
      });
    });
  }

  function cancelSnooze(domain) {
    chrome.runtime.sendMessage({ type: 'CLEAR_SNOOZE', domain }, () => {
      delete snoozeStatus[domain];
      renderSnoozeBanner();
      // Also refresh the cards to hide cancel-snooze buttons
      renderHistory();
    });
  }

  function renderHistory() {
    const filterDomain = domainFilter.value;
    const filtered = filterDomain
      ? allEntries.filter(e => e.domain === filterDomain)
      : allEntries;

    entryCount.textContent = `共 ${filtered.length} 条记录`;

    if (filtered.length === 0) {
      historyList.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';
    historyList.innerHTML = filtered.map(entry => {
      const date = new Date(entry.timestamp);
      const dateStr = date.toLocaleDateString('zh-CN', {
        year: 'numeric', month: 'short', day: 'numeric',
      });
      const timeStr = date.toLocaleTimeString('zh-CN', {
        hour: '2-digit', minute: '2-digit',
      });
      const snoozeStr = entry.snoozeHours || entry.snoozeMinutes
        ? `设定免打扰：${entry.snoozeHours || 0} 小时 ${entry.snoozeMinutes || 0} 分钟后`
        : '';

      // Show URL if available
      const urlHtml = entry.url
        ? `<div class="card-url"><a href="${escapeHtml(entry.url)}" target="_blank" title="${escapeHtml(entry.url)}">${escapeHtml(truncateUrl(entry.url, 60))}</a></div>`
        : '';

      // Show cancel-snooze button if this domain is currently snoozed
      const isCurrentlySnoozed = snoozeStatus.hasOwnProperty(entry.domain);
      const cancelBtnHtml = isCurrentlySnoozed
        ? `<div class="card-actions">
            <button class="action-btn cancel-snooze" data-domain="${escapeHtml(entry.domain)}">取消该域名免打扰</button>
          </div>`
        : '';

      return `
        <div class="history-card" data-id="${escapeHtml(entry.id)}">
          <div class="card-header">
            <span class="domain-tag">${escapeHtml(entry.domain)}</span>
            <span class="card-time">${dateStr} ${timeStr}</span>
          </div>
          <div class="card-reason">${escapeHtml(entry.reason)}</div>
          ${urlHtml}
          ${snoozeStr ? `<div class="card-snooze">${escapeHtml(snoozeStr)}</div>` : ''}
          ${cancelBtnHtml}
          <button class="delete-btn" data-id="${escapeHtml(entry.id)}" title="删除">×</button>
        </div>
      `;
    }).join('');

    // Bind delete buttons
    historyList.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        deleteEntry(id);
      });
    });

    // Bind cancel-snooze buttons
    historyList.querySelectorAll('.cancel-snooze').forEach(btn => {
      btn.addEventListener('click', () => {
        cancelSnooze(btn.dataset.domain);
      });
    });
  }

  function deleteEntry(id) {
    chrome.runtime.sendMessage({ type: 'DELETE_ENTRY', id }, () => {
      allEntries = allEntries.filter(e => e.id !== id);
      populateDomainFilter();
      renderHistory();
    });
  }

  function truncateUrl(url, maxLen) {
    if (url.length <= maxLen) return url;
    // Keep scheme + host + first part of path
    try {
      const u = new URL(url);
      const base = u.origin + u.pathname;
      if (base.length <= maxLen) return base;
      return base.slice(0, maxLen - 3) + '...';
    } catch (e) {
      return url.slice(0, maxLen - 3) + '...';
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});
