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
const DEFAULT_MIN_CHARS = 10;

// chrome.alarms has a 30s minimum delay in packaged builds; short timers
// (demo mode, <30s) must use setTimeout instead of alarms.
const ALARM_FLOOR_SECONDS = 30;

// In-memory tracking: tabId -> domain (lightweight, rebuilt on restart)
const tabDomains = new Map();
// windowId -> active tabId (per-window tracking; fixes multi-window cross-talk)
const windowActiveTabs = new Map();
// tabId -> setTimeout id for short (<30s, e.g. demo mode) timers
const tabTimeouts = new Map();
// Tabs that currently have the overlay showing — don't reschedule timers
const overlayShowing = new Set();

// ====== Initialization ======
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(['domains', 'timerSeconds', 'minChars', 'minCharsUserSet'], (result) => {
    if (!result.domains) {
      chrome.storage.sync.set({ domains: DEFAULT_DOMAINS });
    }
    if (!result.timerSeconds) {
      chrome.storage.sync.set({ timerSeconds: DEFAULT_TIMER_SECONDS });
    }
    if (!result.minChars) {
      chrome.storage.sync.set({ minChars: DEFAULT_MIN_CHARS });
    } else if (result.minChars === 50 && result.minCharsUserSet !== true) {
      // One-time migration for the P0 redesign: default 50-char essay -> 10-char intent
      // (only if the user never explicitly customized the threshold)
      chrome.storage.sync.set({ minChars: DEFAULT_MIN_CHARS, minCharsUserSet: true });
    }
  });
});

// Rebuild state on worker startup
initializeActiveTab();

async function initializeActiveTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      windowActiveTabs.set(tabs[0].windowId, tabs[0].id);
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

// ====== Skip cooldown (demo-friendly: after a long-press skip, ask again in 30s) ======
async function getSkipCooldown(domain) {
  const { skipCooldown = {} } = await chrome.storage.local.get('skipCooldown');
  return skipCooldown[domain] || null;
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

// ====== Day counters (for "第 N 次" context badge & progressive escalation) ======
async function incrementDayCount(domain) {
  const today = new Date().toISOString().slice(0, 10);
  const { dayCounts = {} } = await chrome.storage.local.get('dayCounts');
  const day = dayCounts[today] || {};
  day[domain] = (day[domain] || 0) + 1;
  dayCounts[today] = day;
  // Keep only the last 14 days
  const keys = Object.keys(dayCounts).sort();
  while (keys.length > 14) {
    delete dayCounts[keys.shift()];
  }
  await chrome.storage.local.set({ dayCounts });
  return day[domain];
}

// ====== Per-tab timer scheduling ======
function alarmName(tabId) {
  return `timer_${tabId}`;
}

async function scheduleTabTimer(tabId, url) {
  if (!url || overlayShowing.has(tabId)) return; // Overlay already up, don't reset timer

  try {
    // Only the active tab of its window is tracked (prevents background tabs from timing)
    const tabInfo = await chrome.tabs.get(tabId);
    if (!tabInfo.active) return;

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

    const skipUntil = await getSkipCooldown(rootDomain);
    if (skipUntil && Date.now() < skipUntil) {
      // User just skipped this domain — hold off until the cooldown expires
      clearTabTimer(tabId);
      tabDomains.delete(tabId);
      return;
    }

    const existingDomain = tabDomains.get(tabId);
    if (existingDomain === rootDomain) {
      // Same domain, timer already scheduled — don't reset
      return;
    }

    // New domain or first entry — schedule a fresh timer
    tabDomains.set(tabId, rootDomain);
    const { timerSeconds = DEFAULT_TIMER_SECONDS } = await chrome.storage.sync.get('timerSeconds');
    clearTabTimer(tabId);
    scheduleTimer(tabId, timerSeconds);
  } catch (e) {
    clearTabTimer(tabId);
    tabDomains.delete(tabId);
  }
}

// Short timers (<30s, e.g. demo mode's 5s) use setTimeout because
// chrome.alarms clamps delays to 30s in packaged builds.
function scheduleTimer(tabId, timerSeconds) {
  const delaySeconds = Math.max(Number(timerSeconds) || DEFAULT_TIMER_SECONDS, 1);
  if (delaySeconds < ALARM_FLOOR_SECONDS) {
    const timeoutId = setTimeout(() => fireTimer(tabId), delaySeconds * 1000);
    tabTimeouts.set(tabId, timeoutId);
  } else {
    chrome.alarms.create(alarmName(tabId), { delayInMinutes: delaySeconds / 60 });
  }
}

function clearTabTimer(tabId) {
  const timeoutId = tabTimeouts.get(tabId);
  if (timeoutId !== undefined) {
    clearTimeout(timeoutId);
    tabTimeouts.delete(tabId);
  }
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
    // A full document load happened: any old overlay instance is gone,
    // so clear the guard and allow scheduling again.
    overlayShowing.delete(tabId);
    // scheduleTabTimer internally checks whether this tab is its window's active tab
    await scheduleTabTimer(tabId, tab.url);
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    const windowId = tab.windowId;

    // Cancel timer for the previous active tab in this window only
    const prevTabId = windowActiveTabs.get(windowId);
    if (prevTabId !== undefined && prevTabId !== tabId) {
      clearTabTimer(prevTabId);
      tabDomains.delete(prevTabId);
      overlayShowing.delete(prevTabId);
    }
    windowActiveTabs.set(windowId, tabId);

    if (tab.url) {
      await scheduleTabTimer(tabId, tab.url);
    }
  } catch (e) { /* tab doesn't exist */ }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  clearTabTimer(tabId);
  tabDomains.delete(tabId);
  overlayShowing.delete(tabId);
  for (const [windowId, id] of windowActiveTabs) {
    if (id === tabId) {
      windowActiveTabs.delete(windowId);
    }
  }
});

// ====== Timer firing ======
// Shared by chrome.alarms (long timers) and setTimeout (short/demo timers)
async function fireTimer(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || !tab.active) {
      // Timer fired while this tab is not the active one (user switched away):
      // drop the domain marker so switching back schedules a fresh timer.
      // Otherwise the tab would never be asked again.
      tabDomains.delete(tabId);
      return;
    }

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

    // "今天第 N 次" context: increment per-day per-domain counter, pass it down
    const dayCount = await incrementDayCount(rootDomain);

    chrome.tabs.sendMessage(tabId, {
      type: 'SHOW_OVERLAY',
      domain: rootDomain,
      url: tab.url,
      dayCount,
    }).catch(async () => {
      // Content script not ready — retry after a short delay
      overlayShowing.delete(tabId);
      const { timerSeconds = DEFAULT_TIMER_SECONDS } = await chrome.storage.sync.get('timerSeconds');
      scheduleTimer(tabId, timerSeconds);
    });

    // Keep tabDomains entry so we don't re-schedule on same-domain navigation
    // (it'll be cleared when user submits overlay or navigates away)
  } catch (e) {
    // Tab gone, clean up
    tabDomains.delete(tabId);
    overlayShowing.delete(tabId);
  }
}

// ====== Alarm handler ======
chrome.alarms.onAlarm.addListener(async (alarm) => {
  // Handle skip-cooldown expiry alarms (pattern: skipcd_<domain>)
  if (alarm.name.startsWith('skipcd_')) {
    const domain = alarm.name.replace('skipcd_', '');
    const { skipCooldown = {} } = await chrome.storage.local.get('skipCooldown');
    delete skipCooldown[domain];
    await chrome.storage.local.set({ skipCooldown });
    // If the user is still on this domain, ask again
    try {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const tab = tabs && tabs[0];
      if (tab && tab.url) {
        const urlObj = new URL(tab.url);
        const hostname = urlObj.hostname.replace(/^www\./, '');
        const rootDomain = await getRootDomain(hostname);
        if (rootDomain === domain) {
          await scheduleTabTimer(tab.id, tab.url);
        }
      }
    } catch (e) { /* tab gone */ }
    return;
  }

  // Handle snooze-expiry alarms (pattern: snooze_<domain>)
  if (alarm.name.startsWith('snooze_')) {
    const domain = alarm.name.replace('snooze_', '');
    // Check if user is currently on this domain — if so, start a fresh timer
    try {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const tab = tabs && tabs[0];
      if (!tab || overlayShowing.has(tab.id)) return;
      if (tab.url) {
        const urlObj = new URL(tab.url);
        const hostname = urlObj.hostname.replace(/^www\./, '');
        const rootDomain = await getRootDomain(hostname);
        if (rootDomain === domain) {
          // Still here! Start a fresh countdown
          await scheduleTabTimer(tab.id, tab.url);
        }
      }
    } catch (e) { /* tab gone */ }
    return;
  }

  // Handle per-tab timer alarms (pattern: timer_<tabId>)
  if (!alarm.name.startsWith('timer_')) return;

  const tabId = parseInt(alarm.name.replace('timer_', ''), 10);
  if (isNaN(tabId)) return;

  await fireTimer(tabId);
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

  if (message.type === 'CLOSE_TAB') {
    // "我没目的，关掉它" — close the current monitored tab
    if (sender.tab && sender.tab.id) {
      overlayShowing.delete(sender.tab.id);
      clearTabTimer(sender.tab.id);
      tabDomains.delete(sender.tab.id);
      chrome.tabs.remove(sender.tab.id).catch(() => {});
    }
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'SKIP_EVENT') {
    // Long-press skip: NOT written to history, only bumps a local counter.
    // Also sets a 30s cooldown, after which the domain is asked again
    // (demo-friendly: skipping doesn't permanently silence the prompt).
    const domain = message.domain;
    const today = new Date().toISOString().slice(0, 10);
    chrome.storage.local.get('dayCounts', (result) => {
      const dayCounts = result.dayCounts || {};
      const day = dayCounts[today] || {};
      day[`${domain}:skip`] = (day[`${domain}:skip`] || 0) + 1;
      dayCounts[today] = day;
      chrome.storage.local.set({ dayCounts }, () => {
        chrome.storage.local.get('skipCooldown', (r) => {
          const skipCooldown = r.skipCooldown || {};
          skipCooldown[domain] = Date.now() + 30000; // 30s = chrome.alarms floor
          chrome.storage.local.set({ skipCooldown }, () => {
            chrome.alarms.create(`skipcd_${domain}`, { delayInMinutes: 0.5 });
            sendResponse({ success: true });
          });
        });
      });
    });
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
          delayInMinutes: Math.max(totalMinutes, 0.5),
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

  if (message.type === 'CLEAR_ALL_SNOOZE') {
    // Used by demo mode: clear every snooze + skip cooldown so prompts fire immediately
    chrome.storage.local.set({ snoozeMap: {}, skipCooldown: {} }, () => {
      chrome.alarms.getAll((items) => {
        (items || []).forEach((a) => {
          if (a.name.startsWith('snooze_') || a.name.startsWith('skipcd_')) {
            chrome.alarms.clear(a.name);
          }
        });
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

  if (message.type === 'GET_DAY_COUNTS') {
    // Stats for the history page & popup summary: today / week / skip counters
    chrome.storage.local.get('dayCounts', (result) => {
      const dayCounts = result.dayCounts || {};
      const now = new Date();
      const todayKey = now.toISOString().slice(0, 10);
      const weekKeys = new Set();
      for (let i = 0; i < 7; i++) {
        const d = new Date(now.getTime() - i * 86400000);
        weekKeys.add(d.toISOString().slice(0, 10));
      }
      let todayTotal = 0, todaySkip = 0, weekTotal = 0, weekSkip = 0;
      for (const [date, day] of Object.entries(dayCounts)) {
        if (!day) continue;
        for (const [key, count] of Object.entries(day)) {
          if (typeof count !== 'number') continue;
          const isSkip = key.endsWith(':skip');
          if (isSkip) {
            if (date === todayKey) todaySkip += count;
            if (weekKeys.has(date)) weekSkip += count;
          } else {
            if (date === todayKey) todayTotal += count;
            if (weekKeys.has(date)) weekTotal += count;
          }
        }
      }
      sendResponse({
        today: { total: todayTotal, skip: todaySkip },
        week: { total: weekTotal, skip: weekSkip },
      });
    });
    return true;
  }

  if (message.type === 'CLEAR_HISTORY') {
    // Clear all written history AND day counters (stats reset together)
    chrome.storage.local.set({ history: [], dayCounts: {}, skipCooldown: {} }, () => {
      sendResponse({ success: true });
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
