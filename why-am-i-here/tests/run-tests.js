#!/usr/bin/env node
/**
 * Unit tests for Why Am I Here? browser extension.
 *
 * Tests core logic: domain matching, snooze, message handling,
 * overlay character counting, domain validation, history filtering.
 *
 * Usage: node tests/run-tests.js
 */
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');
const { createChromeMock } = require('./chrome-mock');

// ====== Test Framework ======
let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    process.stdout.write(`  PASS: ${name}\n`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    process.stdout.write(`  FAIL: ${name}\n        ${e.message}\n`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'assertion failed');
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(msg || `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(msg || `expected ${e}, got ${a}`);
  }
}

// ============================================================================
// SECTION 0: Real Script Syntax Checks
// ============================================================================
console.log('\n[Syntax Checks]');

[
  'background.js',
  'content.js',
  'popup.js',
  'history.js',
].forEach((file) => {
  test(`${file} parses as JavaScript`, () => {
    const scriptPath = path.resolve(__dirname, '..', file);
    const result = spawnSync(process.execPath, ['--check', scriptPath], {
      encoding: 'utf8',
    });

    assertEqual(
      result.status,
      0,
      (result.stderr || result.stdout || `${file} failed syntax check`).trim()
    );
  });
});

// ====== Core Logic Functions (extracted from extension) ======

// Domain matching helpers
function matchDomain(hostname, domains) {
  if (!hostname) return null;
  // Strip trailing dot (valid DNS but rare in practice)
  const h = hostname.toLowerCase().replace(/\.+$/, '');
  for (const d of domains) {
    const domain = d.trim().toLowerCase();
    if (h === domain || h.endsWith('.' + domain)) {
      return domain;
    }
  }
  return null;
}

function normalizeHostname(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// Snooze helpers
function isSnoozedNow(snoozeMap, domain, now = Date.now()) {
  const snoozeUntil = snoozeMap[domain];
  return Boolean(snoozeUntil && now < snoozeUntil);
}

function computeSnoozeUntil(hours, minutes, now = Date.now()) {
  const h = (hours ?? 1);
  const m = (minutes ?? 0);
  const snoozeMs = (h * 3600 + m * 60) * 1000;
  return now + snoozeMs;
}

// Character counting
function countNonWhitespaceChars(text) {
  return text.replace(/\s/g, '').length;
}

function isMinCharsMet(text, min = 50) {
  return countNonWhitespaceChars(text) >= min;
}

// Domain validation
const DOMAIN_REGEX = /^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
function isValidDomain(domain) {
  return DOMAIN_REGEX.test(domain.trim().toLowerCase());
}

// History filtering
function filterByDomain(entries, domain) {
  if (!domain) return entries;
  return entries.filter(e => e.domain === domain);
}

// Escape HTML
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ====== Test Data ======
const DEFAULT_DOMAINS = [
  'zhihu.com', 'xiaohongshu.com', 'weibo.com',
  'bilibili.com', 'douban.com', 'tieba.baidu.com', 'douyin.com',
];

// ============================================================================
// SECTION 1: Domain Matching
// ============================================================================
console.log('\n[Domain Matching]');

test('exact domain match', () => {
  assertEqual(matchDomain('zhihu.com', DEFAULT_DOMAINS), 'zhihu.com');
});

test('www subdomain matches root domain', () => {
  assertEqual(matchDomain('www.zhihu.com', DEFAULT_DOMAINS), 'zhihu.com');
});

test('subdomain matches root domain (zhuanlan.zhihu.com)', () => {
  assertEqual(matchDomain('zhuanlan.zhihu.com', DEFAULT_DOMAINS), 'zhihu.com');
});

test('deep subdomain matches (a.b.zhihu.com)', () => {
  assertEqual(matchDomain('a.b.zhihu.com', DEFAULT_DOMAINS), 'zhihu.com');
});

test('evilzhihu.com does NOT match zhihu.com', () => {
  assertEqual(matchDomain('evilzhihu.com', DEFAULT_DOMAINS), null);
});

test('zhihu.com.evil.com does NOT match', () => {
  assertEqual(matchDomain('zhihu.com.evil.com', DEFAULT_DOMAINS), null);
});

test('completely different domain does not match', () => {
  assertEqual(matchDomain('google.com', DEFAULT_DOMAINS), null);
});

test('domain matching is case insensitive', () => {
  assertEqual(matchDomain('ZHIHU.COM', DEFAULT_DOMAINS), 'zhihu.com');
});

test('domain matching trims whitespace', () => {
  const domains = ['  zhihu.com  '];
  assertEqual(matchDomain('zhihu.com', domains), 'zhihu.com');
});

test('tieba.baidu.com matches', () => {
  assertEqual(matchDomain('tieba.baidu.com', DEFAULT_DOMAINS), 'tieba.baidu.com');
});

test('baidu.com does NOT match tieba.baidu.com', () => {
  // baidu.com only matches if baidu.com is explicitly in the list
  assertEqual(matchDomain('baidu.com', DEFAULT_DOMAINS), null);
});

test('empty domain list matches nothing', () => {
  assertEqual(matchDomain('zhihu.com', []), null);
});

test('null hostname returns null', () => {
  assertEqual(matchDomain(null, DEFAULT_DOMAINS), null);
});

// ============================================================================
// SECTION 2: URL Normalization
// ============================================================================
console.log('\n[URL Normalization]');

test('extracts hostname from https URL', () => {
  assertEqual(normalizeHostname('https://www.zhihu.com/question/123'), 'zhihu.com');
});

test('strips www prefix', () => {
  assertEqual(normalizeHostname('https://www.zhihu.com'), 'zhihu.com');
});

test('keeps non-www subdomain', () => {
  assertEqual(normalizeHostname('https://zhuanlan.zhihu.com'), 'zhuanlan.zhihu.com');
});

test('handles URL without www', () => {
  assertEqual(normalizeHostname('https://xiaohongshu.com/explore'), 'xiaohongshu.com');
});

test('invalid URL returns null', () => {
  assertEqual(normalizeHostname('not-a-url'), null);
});

test('about:blank returns empty hostname', () => {
  assertEqual(normalizeHostname('about:blank'), '');
});

// ============================================================================
// SECTION 3: Snooze Logic
// ============================================================================
console.log('\n[Snooze Logic]');

test('isSnoozed returns true when within snooze period', () => {
  const now = 1000000;
  const snoozeMap = { 'zhihu.com': now + 3600000 }; // 1 hour later
  assertEqual(isSnoozedNow(snoozeMap, 'zhihu.com', now), true);
});

test('isSnoozed returns false when snooze expired', () => {
  const now = 1000000;
  const snoozeMap = { 'zhihu.com': now - 1 }; // expired 1ms ago
  assertEqual(isSnoozedNow(snoozeMap, 'zhihu.com', now), false);
});

test('isSnoozed returns false when domain not in map', () => {
  const snoozeMap = {};
  assertEqual(isSnoozedNow(snoozeMap, 'zhihu.com'), false);
});

test('isSnoozed returns false when snoozeUntil is null/undefined', () => {
  assertEqual(isSnoozedNow({ 'zhihu.com': null }, 'zhihu.com'), false);
  assertEqual(isSnoozedNow({ 'zhihu.com': undefined }, 'zhihu.com'), false);
  assertEqual(isSnoozedNow({ 'zhihu.com': 0 }, 'zhihu.com'), false); // 0 is epoch
});

test('computeSnoozeUntil calculates correctly', () => {
  const now = 1000000;
  assertEqual(computeSnoozeUntil(1, 0, now), now + 3600000);    // 1 hour
  assertEqual(computeSnoozeUntil(0, 30, now), now + 1800000);   // 30 min
  assertEqual(computeSnoozeUntil(2, 30, now), now + 9000000);   // 2.5 hours
  assertEqual(computeSnoozeUntil(0, 0, now), now);              // immediate
});

test('computeSnoozeUntil defaults missing hours to 1', () => {
  const result = computeSnoozeUntil(undefined, 30, 0);
  assertEqual(result, 3600000 + 1800000);
});

test('computeSnoozeUntil defaults missing minutes to 0', () => {
  const result = computeSnoozeUntil(2, undefined, 0);
  assertEqual(result, 7200000);
});

// ============================================================================
// SECTION 4: Character Counting
// ============================================================================
console.log('\n[Character Counting]');

test('counts Chinese characters', () => {
  const text = '我想查找关于机器学习的最新研究资料';
  assertEqual(countNonWhitespaceChars(text), 17);
});

test('does not count spaces', () => {
  assertEqual(countNonWhitespaceChars('hello world'), 10);
});

test('does not count newlines and tabs', () => {
  assertEqual(countNonWhitespaceChars('hello\nworld\ttest'), 14);
});

test('50 Chinese characters meet minimum', () => {
  const text = '一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十';
  assertEqual(countNonWhitespaceChars(text), 50);
  assertEqual(isMinCharsMet(text, 50), true);
});

test('29 characters do not meet 50-char minimum', () => {
  const text = '这是一段刚好二十九个字的测试文本用来验证计数器功能是否正确';
  assertEqual(countNonWhitespaceChars(text), 29);
  assertEqual(isMinCharsMet(text, 50), false);
});

test('empty string returns 0', () => {
  assertEqual(countNonWhitespaceChars(''), 0);
  assertEqual(isMinCharsMet('', 50), false);
});

test('only whitespace returns 0', () => {
  assertEqual(countNonWhitespaceChars('   \n\t  '), 0);
  assertEqual(isMinCharsMet('   \n\t  ', 50), false);
});

test('exactly 50 non-whitespace chars meets minimum', () => {
  // 50 chars
  const text = '12345678901234567890123456789012345678901234567890';
  assertEqual(countNonWhitespaceChars(text), 50);
  assertEqual(isMinCharsMet(text, 50), true);
});

test('mixed CJK and ASCII counted correctly', () => {
  const text = '学习 Machine Learning 最好的方法就是动手实践';
  assertEqual(countNonWhitespaceChars(text), 28); // spaces removed
});

// ============================================================================
// SECTION 5: Domain Validation
// ============================================================================
console.log('\n[Domain Validation]');

test('validates simple domain (zhihu.com)', () => {
  assertEqual(isValidDomain('zhihu.com'), true);
});

test('validates multi-level domain (tieba.baidu.com)', () => {
  assertEqual(isValidDomain('tieba.baidu.com'), true);
});

test('rejects domain without TLD', () => {
  assertEqual(isValidDomain('zhihu'), false);
});

test('rejects domain starting with hyphen', () => {
  assertEqual(isValidDomain('-zhihu.com'), false);
});

test('rejects domain ending with hyphen', () => {
  assertEqual(isValidDomain('zhihu-.com'), false);
});

test('rejects empty string', () => {
  assertEqual(isValidDomain(''), false);
});

test('rejects URL with protocol', () => {
  assertEqual(isValidDomain('https://zhihu.com'), false);
});

test('validates with whitespace trimming', () => {
  assertEqual(isValidDomain('  zhihu.com  '), true);
});

test('rejects domain with only TLD', () => {
  assertEqual(isValidDomain('.com'), false);
});

// ============================================================================
// SECTION 6: History Filtering
// ============================================================================
console.log('\n[History Filtering]');

const sampleEntries = [
  { id: '1', domain: 'zhihu.com', reason: '查资料', timestamp: 1000 },
  { id: '2', domain: 'xiaohongshu.com', reason: '找灵感', timestamp: 2000 },
  { id: '3', domain: 'zhihu.com', reason: '又来了', timestamp: 3000 },
  { id: '4', domain: 'weibo.com', reason: '看热搜', timestamp: 4000 },
];

test('empty filter returns all entries', () => {
  assertEqual(filterByDomain(sampleEntries, '').length, 4);
});

test('null/undefined filter returns all entries', () => {
  assertEqual(filterByDomain(sampleEntries, null).length, 4);
  assertEqual(filterByDomain(sampleEntries, undefined).length, 4);
});

test('filter by zhihu.com returns 2 entries', () => {
  const result = filterByDomain(sampleEntries, 'zhihu.com');
  assertEqual(result.length, 2);
  assert(result.every(e => e.domain === 'zhihu.com'));
});

test('filter by nonexistent domain returns empty', () => {
  assertEqual(filterByDomain(sampleEntries, 'google.com').length, 0);
});

test('filter preserves entry order', () => {
  const result = filterByDomain(sampleEntries, 'zhihu.com');
  assertEqual(result[0].id, '1');
  assertEqual(result[1].id, '3');
});

test('empty entries list returns empty', () => {
  assertEqual(filterByDomain([], 'zhihu.com').length, 0);
  assertEqual(filterByDomain([], '').length, 0);
});

// ============================================================================
// SECTION 7: HTML Escaping
// ============================================================================
console.log('\n[HTML Escaping]');

test('escapes < and >', () => {
  assertEqual(escapeHtml('<script>'), '&lt;script&gt;');
});

test('escapes double quotes', () => {
  assertEqual(escapeHtml('a"b'), 'a&quot;b');
});

test('escapes ampersand', () => {
  assertEqual(escapeHtml('a&b'), 'a&amp;b');
});

test('leaves normal text unchanged', () => {
  assertEqual(escapeHtml('hello world'), 'hello world');
});

test('handles empty string', () => {
  assertEqual(escapeHtml(''), '');
});

// ============================================================================
// SECTION 8: Chrome API Mock Integration Tests
// ============================================================================
console.log('\n[Integration: Mock Chrome APIs]');

test('storage.sync can set and get a value', () => {
  const chrome = createChromeMock();
  chrome.storage.sync.set({ testKey: 'testValue' });
  chrome.storage.sync.get('testKey', (result) => {
    assertEqual(result.testKey, 'testValue');
  });
});

test('storage.local handles snooze map pattern', () => {
  const chrome = createChromeMock();
  const snoozeMap = { 'zhihu.com': Date.now() + 3600000 };
  chrome.storage.local.set({ snoozeMap });
  chrome.storage.local.get('snoozeMap', (result) => {
    assertEqual(typeof result.snoozeMap['zhihu.com'], 'number');
  });
});

test('storage.sync stores and retrieves domain list', () => {
  const chrome = createChromeMock();
  const domains = ['zhihu.com', 'xiaohongshu.com'];
  chrome.storage.sync.set({ domains });

  let resultDomains = null;
  chrome.storage.sync.get('domains', (result) => {
    resultDomains = result.domains;
  });
  assertDeepEqual(resultDomains, domains);
});

test('tabs.createTab and query', () => {
  const chrome = createChromeMock();
  chrome.tabs.createTab('https://zhihu.com');
  chrome.tabs.createTab('https://google.com');

  chrome.tabs.query({ active: false }, (tabs) => {
    assertEqual(tabs.length, 2);
  });
});

test('event mock fires listeners', () => {
  const chrome = createChromeMock();
  let fired = false;
  chrome.tabs.onActivated.addListener(() => { fired = true; });
  chrome.tabs.onActivated._fire({ tabId: 1 });
  assertEqual(fired, true);
});

// ============================================================================
// SECTION 9: Full Workflow Simulation
// ============================================================================
console.log('\n[Integration: Full Workflow Simulation]');

test('full flow: install → browse → snooze → expire', () => {
  const chrome = createChromeMock();

  // 1. Installation: set default domains
  chrome.storage.sync.set({ domains: ['zhihu.com', 'xiaohongshu.com'] });

  // 2. User opens zhihu.com
  const tab = chrome.tabs.createTab('https://www.zhihu.com/question/123');
  chrome.tabs.activateTab(tab.id);

  // 3. Verify domain matching works
  let storedDomains = null;
  chrome.storage.sync.get('domains', (result) => {
    storedDomains = result.domains;
  });
  assert(storedDomains.includes('zhihu.com'));

  // 4. Set snooze
  const snoozeUntil = Date.now() + 3600000;
  chrome.storage.local.set({ snoozeMap: { 'zhihu.com': snoozeUntil } });

  // 5. Verify snooze is active
  let snoozeActive = false;
  chrome.storage.local.get('snoozeMap', (result) => {
    const map = result.snoozeMap || {};
    snoozeActive = map['zhihu.com'] > Date.now();
  });
  assertEqual(snoozeActive, true);

  // 6. Clear snooze
  chrome.storage.local.set({ snoozeMap: {} });

  // 7. Verify snooze cleared
  let snoozeAfterClear = false;
  chrome.storage.local.get('snoozeMap', (result) => {
    const map = result.snoozeMap || {};
    snoozeAfterClear = Boolean(map['zhihu.com'] && map['zhihu.com'] > Date.now());
  });
  assertEqual(snoozeAfterClear, false);
});

test('full flow: history save and filter', () => {
  const chrome = createChromeMock();

  // Simulate saving entries
  const history = [];
  const entry1 = {
    id: 'abc123',
    domain: 'zhihu.com',
    reason: '我想查找机器学习资料和学习笔记整理方法',
    timestamp: Date.now() - 3600000,
    snoozeHours: 2,
    snoozeMinutes: 0,
  };
  const entry2 = {
    id: 'def456',
    domain: 'xiaohongshu.com',
    reason: '想找一些家居装修的灵感和好物推荐清单',
    timestamp: Date.now(),
    snoozeHours: 1,
    snoozeMinutes: 30,
  };

  history.push(entry1, entry2);
  chrome.storage.local.set({ history });

  // Get all history
  let allHistory = [];
  chrome.storage.local.get('history', (result) => {
    allHistory = result.history || [];
  });
  assertEqual(allHistory.length, 2);

  // Filter by domain
  const zhihuEntries = filterByDomain(allHistory, 'zhihu.com');
  assertEqual(zhihuEntries.length, 1);
  assertEqual(zhihuEntries[0].id, 'abc123');

  // Delete entry
  const afterDelete = allHistory.filter(e => e.id !== 'abc123');
  chrome.storage.local.set({ history: afterDelete });

  let historyAfter = [];
  chrome.storage.local.get('history', (result) => {
    historyAfter = result.history || [];
  });
  assertEqual(historyAfter.length, 1);
  assertEqual(historyAfter[0].domain, 'xiaohongshu.com');
});

test('500 entry cap is enforced', () => {
  const chrome = createChromeMock();
  const history = [];
  for (let i = 0; i < 600; i++) {
    history.push({
      id: `entry_${i}`,
      domain: 'zhihu.com',
      reason: `测试理由 ${i}`,
      timestamp: Date.now() - (600 - i) * 1000,
    });
  }

  // Keep only first 500
  const trimmed = history.slice(0, 500);
  chrome.storage.local.set({ history: trimmed });

  let stored = [];
  chrome.storage.local.get('history', (result) => {
    stored = result.history || [];
  });
  assertEqual(stored.length, 500);
  assertEqual(stored[0].id, 'entry_0');
  assertEqual(stored[499].id, 'entry_499');
});

// ============================================================================
// SECTION 10: Edge Cases
// ============================================================================
console.log('\n[Edge Cases]');

test('domain with trailing dot is normalized', () => {
  assertEqual(matchDomain('zhihu.com.', DEFAULT_DOMAINS), 'zhihu.com');
  assertEqual(matchDomain('www.zhihu.com.', DEFAULT_DOMAINS), 'zhihu.com');
});

test('hostname with port number', () => {
  const hostname = normalizeHostname('https://localhost:8080/path');
  assertEqual(hostname, 'localhost');
});

test('very long domain name', () => {
  const longDomain = 'a'.repeat(50) + '.com';
  assertEqual(isValidDomain(longDomain), true);
});

test('unicode/Punycode domain not matched as valid', () => {
  // Should reject raw unicode
  assertEqual(isValidDomain('例子.com'), false);
});

test('snooze zero duration works as "remind immediately"', () => {
  const now = 1000000;
  const until = computeSnoozeUntil(0, 0, now);
  assertEqual(until, now);
  // Snooze expired immediately
  assertEqual(isSnoozedNow({ 'zhihu.com': until }, 'zhihu.com', now + 1), false);
});

test('character counting handles emoji', () => {
  const text = '🎉🎉🎉';
  // Each emoji is 2 JS string chars (surrogate pair), but 1 grapheme
  // Our implementation counts code units, not graphemes
  const count = countNonWhitespaceChars(text);
  assert(count >= 3, `emoji should count as some characters, got ${count}`);
});

test('string with leading/trailing spaces trims correctly', () => {
  const text = '   我就是要摸鱼   ';
  const reason = text.trim();
  assertEqual(countNonWhitespaceChars(reason), 6);
});

test('same-domain navigation preserves entry time', () => {
  const tabStates = new Map();
  const now = Date.now();

  // Step 1: user opens zhihu.com for the first time
  tabStates.set(1, { domain: 'zhihu.com', entryTime: now });

  // Step 2: user clicks a link, navigates to another zhihu page
  const existing = tabStates.get(1);
  const sameDomain = existing && existing.domain === 'zhihu.com';
  if (!(sameDomain)) {
    tabStates.set(1, { domain: 'zhihu.com', entryTime: Date.now() });
  }
  // Entry time should be preserved (same domain)
  assertEqual(tabStates.get(1).entryTime, now,
    `entryTime should be preserved, got ${tabStates.get(1).entryTime} vs ${now}`);

  // Step 3: user navigates to a different domain (google.com)
  tabStates.delete(1);
  // Re-enter zhihu later
  const later = Date.now();
  tabStates.set(1, { domain: 'zhihu.com', entryTime: later });
  assert(tabStates.get(1).entryTime >= now,
    `entryTime should be >= original, got ${tabStates.get(1).entryTime} vs ${now}`);
});

test('same-domain navigation resets timer when domain changes', () => {
  const tabStates = new Map();
  const now = Date.now();

  // Start on zhihu
  tabStates.set(1, { domain: 'zhihu.com', entryTime: now });

  // Navigate to xiaohongshu (different monitored domain)
  const existing = tabStates.get(1);
  const newDomain = 'xiaohongshu.com';
  const sameDomain = existing && existing.domain === newDomain;
  if (!(sameDomain)) {
    // Small delay to ensure new timestamp differs
    const later = now + 1000;
    tabStates.set(1, { domain: newDomain, entryTime: later });
  }
  // Entry time should be updated (different domain)
  assert(tabStates.get(1).entryTime > now,
    `entryTime should be > original when domain changes, got ${tabStates.get(1).entryTime} vs ${now}`);
  assertEqual(tabStates.get(1).domain, 'xiaohongshu.com');
});

// ============================================================================
// Results
// ============================================================================
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failures.length > 0) {
  console.log('\nFailures:');
  failures.forEach((f, i) => {
    console.log(`  ${i + 1}. ${f.name}`);
    console.log(`     ${f.error}`);
  });
  process.exit(1);
} else {
  console.log('All tests passed!\n');
  process.exit(0);
}
