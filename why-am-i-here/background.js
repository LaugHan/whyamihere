// ====== Why Am I Here? - Background Service Worker ======

const DEFAULT_DOMAINS = [
  'zhihu.com',
  'xiaohongshu.com',
  'weibo.com',
  'bilibili.com',
  'douban.com',
  'tieba.baidu.com',
  'douyin.com',
];

const DEFAULT_TIMER_SECONDS = 60;
const DEFAULT_MIN_CHARS = 50;

// In-memory tracking: tabId -> domain (lightweight, rebuilt on restart)
const tabDomains = new Map();
let activeTabId = null;
// Tabs that currently have the overlay showing — don't reschedule timers
const overlayShowing = new Set();

// ====== Initialization ======
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(['domains', 'timerSeconds', 'minChars'], (result) => {
    if (!result.domains) {
      chrome.storage.sync.set({ domains: DEFAULT_DOMAINS });
    }
    if (!result.timerSeconds) {
      chrome.storage.sync.set({ timerSeconds: DEFAULT_TIMER_SECONDS });
    }
    if (!result.minChars) {
      chrome.storage.sync.set({ minChars: DEFAULT_MIN_CHARS });
    }
  });
});

// Rebuild state on worker startup
initializeActiveTab();

async function initializeActiveTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      activeTabId = tabs[0].id;
      await scheduleTabTimer(tabs[0].id, tabs[0].url);
    }
  } catch (e) { /* ignore */ }
}

// ====== Domain helpers ======
async function getMonitoredDomains() {
  const { domains = DEFAULT_DOMAINS } = await chrome.storage.sync.get('domains');
  return domains.map(d => d.trim().toLowerCase()).filter(Boolean);
}

async function getRootDomain(hostname) {
  if (!hostname) return null;
  const domains = await getMonitoredDomains();
  const h = hostname.toLowerCase().replace(/\.+$/, '');
  for (const d of domains) {
    if (h === d || h.endsWith('.' + d)) {
      return d;
    }
  }
  return null;
}

// ====== Snooze helpers ======
async function isSnoozed(domain) {
  const { snoozeMap = {} } = await chrome.storage.local.get('snoozeMap');
  const snoozeUntil = snoozeMap[domain];
  return snoozeUntil && Date.now() < snoozeUntil;
}

async function setSnooze(domain, untilTimestamp) {
  const { snoozeMap = {} } = await chrome.storage.local.get('snoozeMap');
  snoozeMap[domain] = untilTimestamp;
  await chrome.storage.local.set({ snoozeMap });
}

// ====== Per-tab alarm scheduling ======
function alarmName(tabId) {
  return `timer_${tabId}`;
}

async function scheduleTabTimer(tabId, url) {
  if (!url || tabId !== activeTabId) return;
  if (overlayShowing.has(tabId)) return; // Overlay already up, don't reset timer

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace(/^www\./, '');
    const rootDomain = await getRootDomain(hostname);

    if (!rootDomain) {
      clearTabTimer(tabId);
      tabDomains.delete(tabId);
      return;
    }

    const snoozed = await isSnoozed(rootDomain);
    if (snoozed) {
      clearTabTimer(tabId);
      tabDomains.delete(tabId);
      return;
    }

    const existingDomain = tabDomains.get(tabId);
    if (existingDomain === rootDomain) {
      // Same domain, alarm already scheduled — don't reset
      return;
    }

    // New domain or first entry — schedule a fresh alarm
    tabDomains.set(tabId, rootDomain);
    const { timerSeconds = DEFAULT_TIMER_SECONDS } = await chrome.storage.sync.get('timerSeconds');

    // Clear any existing alarm for this tab, then create new one
    await chrome.alarms.clear(alarmName(tabId));
    chrome.alarms.create(alarmName(tabId), {
      delayInMinutes: Math.max(timerSeconds / 60, 0.05), // min ~3s for unpacked
    });
  } catch (e) {
    clearTabTimer(tabId);
    tabDomains.delete(tabId);
  }
}

function clearTabTimer(tabId) {
  chrome.alarms.clear(alarmName(tabId)).catch(() => {});
}

async function clearTimersForDomain(domain) {
  for (const [tabId, d] of tabDomains) {
    if (d === domain) {
      tabDomains.delete(tabId);
      await chrome.alarms.clear(alarmName(tabId)).catch(() => {});
    }
  }
}

// ====== Tab event listeners ======
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    if (tabId === activeTabId) {
      // Only schedule if overlay isn't showing
      await scheduleTabTimer(tabId, tab.url);
    }
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  // Cancel timer for previous active tab
  if (activeTabId !== null && activeTabId !== tabId) {
    clearTabTimer(activeTabId);
    tabDomains.delete(activeTabId);
    overlayShowing.delete(activeTabId);
  }
  activeTabId = tabId;

  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url) {
      await scheduleTabTimer(tabId, tab.url);
    }
  } catch (e) { /* tab doesn't exist */ }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  clearTabTimer(tabId);
  tabDomains.delete(tabId);
  overlayShowing.delete(tabId);
  if (activeTabId === tabId) {
    activeTabId = null;
  }
});

// ====== Alarm handler ======
chrome.alarms.onAlarm.addListener(async (alarm) => {
  // Handle snooze-expiry alarms (pattern: snooze_<domain>)
  if (alarm.name.startsWith('snooze_')) {
    const domain = alarm.name.replace('snooze_', '');
    // Check if user is currently on this domain — if so, start a fresh timer
    if (activeTabId === null || overlayShowing.has(activeTabId)) return;
    try {
      const tab = await chrome.tabs.get(activeTabId);
      if (tab.url) {
        const urlObj = new URL(tab.url);
        const hostname = urlObj.hostname.replace(/^www\./, '');
        const rootDomain = await getRootDomain(hostname);
        if (rootDomain === domain) {
          // Still here! Start a fresh 1-minute countdown
          await scheduleTabTimer(activeTabId, tab.url);
        }
      }
    } catch (e) { /* tab gone */ }
    return;
  }

  // Handle per-tab timer alarms (pattern: timer_<tabId>)
  if (!alarm.name.startsWith('timer_')) return;

  const tabId = parseInt(alarm.name.replace('timer_', ''), 10);
  if (isNaN(tabId)) return;

  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || !tab.active) return;

    const urlObj = new URL(tab.url);
    const hostname = urlObj.hostname.replace(/^www\./, '');
    const rootDomain = await getRootDomain(hostname);

    if (!rootDomain) return;

    const snoozed = await isSnoozed(rootDomain);
    if (snoozed) {
      tabDomains.delete(tabId);
      return;
    }

    // Fire! Mark overlay as showing to prevent re-scheduling
    overlayShowing.add(tabId);

    chrome.tabs.sendMessage(tabId, {
      type: 'SHOW_OVERLAY',
      domain: rootDomain,
      url: tab.url,
    }).catch(async () => {
      // Content script not ready — retry after a short delay
      overlayShowing.delete(tabId);
      const timerSeconds = (await chrome.storage.sync.get('timerSeconds')).timerSeconds || DEFAULT_TIMER_SECONDS;
      chrome.alarms.create(alarmName(tabId), {
        delayInMinutes: Math.max(timerSeconds / 60, 0.05),
      });
    });

    // Keep tabDomains entry so we don't re-schedule on same-domain navigation
    // (it'll be cleared when user submits overlay or navigates away)
  } catch (e) {
    // Tab gone, clean up
    tabDomains.delete(tabId);
  }
});

// ====== Message handling ======
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_DOMAINS') {
    getMonitoredDomains().then(domains => sendResponse({ domains }));
    return true;
  }

  if (message.type === 'ADD_DOMAIN') {
    chrome.storage.sync.get('domains', (result) => {
      const domains = result.domains || DEFAULT_DOMAINS;
      const newDomain = message.domain.trim().toLowerCase();
      if (newDomain && !domains.includes(newDomain)) {
        domains.push(newDomain);
        chrome.storage.sync.set({ domains }, () => {
          sendResponse({ success: true, domains });
        });
      } else {
        sendResponse({ success: false, error: '域名已存在或为空' });
      }
    });
    return true;
  }

  if (message.type === 'REMOVE_DOMAIN') {
    chrome.storage.sync.get('domains', (result) => {
      const domains = (result.domains || DEFAULT_DOMAINS).filter(
        d => d !== message.domain.trim().toLowerCase()
      );
      chrome.storage.sync.set({ domains }, () => {
        chrome.storage.local.get('snoozeMap', (r) => {
          const snoozeMap = r.snoozeMap || {};
          delete snoozeMap[message.domain];
          chrome.storage.local.set({ snoozeMap });
        });
        sendResponse({ success: true, domains });
      });
    });
    return true;
  }

  if (message.type === 'DISMISS_OVERLAY') {
    // Content script tells us the overlay has been dismissed (user submitted)
    if (sender.tab && sender.tab.id) {
      overlayShowing.delete(sender.tab.id);
      clearTabTimer(sender.tab.id);
      tabDomains.delete(sender.tab.id);
    }
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'SET_SNOOZE') {
    const domain = message.domain;
    const hours = message.hours ?? 1;
    const minutes = message.minutes ?? 0;
    const snoozeMs = (hours * 3600 + minutes * 60) * 1000;
    const snoozeUntil = Date.now() + snoozeMs;

    setSnooze(domain, snoozeUntil).then(async () => {
      await clearTimersForDomain(domain);

      // Schedule a snooze-expiry alarm so the timer auto-restarts
      // when snooze ends, even if the user hasn't navigated
      const totalMinutes = hours * 60 + minutes;
      if (totalMinutes > 0) {
        chrome.alarms.create(`snooze_${domain}`, {
          delayInMinutes: Math.max(totalMinutes, 0.05),
        });
      }

      sendResponse({ success: true, snoozeUntil });
    });
    return true;
  }

  if (message.type === 'SAVE_ENTRY') {
    chrome.storage.local.get('history', (result) => {
      const history = result.history || [];
      history.unshift({
        ...message.data,
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        timestamp: Date.now(),
      });
      const trimmed = history.slice(0, 500);
      chrome.storage.local.set({ history: trimmed }, () => {
        sendResponse({ success: true });
      });
    });
    return true;
  }

  if (message.type === 'GET_SNOOZE_STATUS') {
    chrome.storage.local.get('snoozeMap', (result) => {
      const snoozeMap = result.snoozeMap || {};
      const now = Date.now();
      const status = {};
      for (const [domain, until] of Object.entries(snoozeMap)) {
        if (until > now) {
          status[domain] = until;
        }
      }
      sendResponse({ status });
    });
    return true;
  }

  if (message.type === 'CLEAR_SNOOZE') {
    chrome.storage.local.get('snoozeMap', (result) => {
      const snoozeMap = result.snoozeMap || {};
      delete snoozeMap[message.domain];
      chrome.storage.local.set({ snoozeMap }, () => {
        // Also cancel the snooze-expiry alarm
        chrome.alarms.clear(`snooze_${message.domain}`).catch(() => {});
        sendResponse({ success: true });
      });
    });
    return true;
  }

  if (message.type === 'GET_HISTORY') {
    chrome.storage.local.get('history', (result) => {
      sendResponse({ history: result.history || [] });
    });
    return true;
  }

  if (message.type === 'DELETE_ENTRY') {
    chrome.storage.local.get('history', (result) => {
      const history = (result.history || []).filter(e => e.id !== message.id);
      chrome.storage.local.set({ history }, () => {
        sendResponse({ success: true });
      });
    });
    return true;
  }
});
