/**
 * Mock Chrome APIs for unit testing browser extension.
 * Simulates storage, tabs, runtime messaging, and alarms in memory.
 */
'use strict';

class EventMock {
  constructor() {
    this._listeners = [];
  }
  addListener(fn) {
    this._listeners.push(fn);
  }
  removeListener(fn) {
    this._listeners = this._listeners.filter(l => l !== fn);
  }
  hasListeners() {
    return this._listeners.length > 0;
  }
  _fire(...args) {
    this._listeners.forEach(fn => {
      try { fn(...args); } catch (e) { /* ignore */ }
    });
  }
  _reset() {
    this._listeners = [];
  }
}

class StorageMock {
  constructor() {
    this._store = {};
  }
  get(keys, callback) {
    if (typeof keys === 'string' || Array.isArray(keys)) {
      const keysArr = typeof keys === 'string' ? [keys] : keys;
      const result = {};
      for (const k of keysArr) {
        if (k in this._store) {
          result[k] = JSON.parse(JSON.stringify(this._store[k]));
        }
      }
      callback(result);
    } else {
      // keys is null/undefined - get everything
      callback(JSON.parse(JSON.stringify(this._store)));
    }
  }
  set(items, callback) {
    Object.assign(this._store, JSON.parse(JSON.stringify(items)));
    if (callback) callback();
  }
  _reset() {
    this._store = {};
  }
}

class TabsMock {
  constructor() {
    this._tabs = [];
    this._nextId = 1;
    this.onUpdated = new EventMock();
    this.onActivated = new EventMock();
    this.onRemoved = new EventMock();
  }
  query(queryInfo, callback) {
    let results = [...this._tabs];
    if (queryInfo.active) {
      results = results.filter(t => t.active);
    }
    if (queryInfo.currentWindow !== undefined) {
      results = results.filter(t => t.currentWindow === queryInfo.currentWindow);
    }
    callback(results);
  }
  get(tabId, callback) {
    const tab = this._tabs.find(t => t.id === tabId);
    if (tab) {
      callback(Object.assign({}, tab));
    } else {
      throw new Error(`Tab ${tabId} not found`);
    }
  }
  sendMessage(tabId, message, callback) {
    // Will be intercepted by mock runtime
    if (callback) callback();
  }
  createTab(url) {
    const tab = {
      id: this._nextId++,
      url: url,
      active: false,
      currentWindow: true,
      status: 'complete'
    };
    this._tabs.push(tab);
    return tab;
  }
  activateTab(tabId) {
    // Deactivate all others
    this._tabs.forEach(t => t.active = false);
    const tab = this._tabs.find(t => t.id === tabId);
    if (tab) tab.active = true;
  }
  _reset() {
    this._tabs = [];
    this._nextId = 1;
  }
}

class AlarmsMock {
  constructor() {
    this._alarms = new Map();
    this.onAlarm = new EventMock();
  }
  create(name, alarmInfo) {
    this._alarms.set(name, alarmInfo);
  }
  clear(name) {
    this._alarms.delete(name);
  }
  fire(name) {
    this.onAlarm._fire({ name });
  }
  _reset() {
    this._alarms.clear();
  }
}

class RuntimeMock {
  constructor() {
    this.onInstalled = new EventMock();
    this.onMessage = new EventMock();
    this._messageHandlers = [];
  }
  sendMessage(message, callback) {
    // Deliver to onMessage listeners
    let handled = false;
    for (const handler of this._messageHandlers) {
      handler(message, { tab: { id: 1 } }, (response) => {
        handled = true;
        if (callback) callback(response);
      });
      if (handled) break;
    }
    if (!handled && callback) {
      callback(undefined);
    }
  }
  _registerHandler(handler) {
    this._messageHandlers.push(handler);
  }
  _reset() {
    this._messageHandlers = [];
  }
}

// Build the global chrome mock
function createChromeMock() {
  const storageSync = new StorageMock();
  const storageLocal = new StorageMock();
  const tabs = new TabsMock();
  const alarms = new AlarmsMock();
  const runtime = new RuntimeMock();

  // Wire up runtime.onMessage
  // When addListener is called, register the handler
  const origOnMessageAddListener = runtime.onMessage.addListener.bind(runtime.onMessage);
  runtime.onMessage.addListener = (fn) => {
    runtime._registerHandler(fn);
    origOnMessageAddListener(fn);
  };

  return {
    storage: {
      sync: storageSync,
      local: storageLocal,
    },
    tabs,
    alarms,
    runtime,
    _resetAll() {
      storageSync._reset();
      storageLocal._reset();
      tabs._reset();
      alarms._reset();
      runtime._reset();
      runtime.onMessage._reset();
      runtime.onInstalled._reset();
      tabs.onUpdated._reset();
      tabs.onActivated._reset();
      tabs.onRemoved._reset();
      alarms.onAlarm._reset();
    },
  };
}

module.exports = { createChromeMock, EventMock, StorageMock, TabsMock, AlarmsMock, RuntimeMock };
