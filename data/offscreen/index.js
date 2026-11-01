'use strict';

/* Offscreen clipboard watcher
 *
 * This document reports text changes of the system clipboard to the service
 * worker with the "write" message that the content script already uses. It
 * allows the "system" monitor modes to capture clipboard changes from any
 * application, without a native client:
 *
 *  - 'system' mode: the system clipboard is polled; the interval (in seconds)
 *    comes from the "monitor-interval" preference that the service worker
 *    reports with the "monitor/config" message (offscreen documents cannot
 *    access chrome.storage).
 *  - 'system-events' mode: the ChromeOS clipboard change event
 *    (chrome.clipboard) is watched; nothing is polled as long as the event
 *    works. If the API turns out to be unavailable, the mode is disabled
 *    and the polling watchdog takes over so that capture is never lost.
 */

// Reads the current clipboard content using the classic paste command
const read = () => {
  const textarea = document.querySelector('textarea');
  textarea.value = '';
  textarea.focus();
  try {
    if (document.execCommand('paste')) {
      return textarea.value;
    }
  }
  catch (e) {
    console.warn('[Clipboard History Manager]', e);
  }
  return null;
};

// last captured value (null means not-yet-seeded)
let last = null;

const tick = () => {
  const body = read();
  if (body === null) {
    // clipboard is not accessible yet (e.g. permission is not granted)
    return;
  }
  if (last === null) {
    // the very first read only seeds the watcher
    last = body;
    return;
  }
  if (body !== last) {
    last = body;
    if (body.trim().length) {
      chrome.runtime.sendMessage({
        method: 'write',
        body
      }).catch(e => console.warn('[Clipboard History Manager]', e.message));
    }
  }
};

/* ------------------------------ config -------------------------------- */
// defines what to listen to; delivered by the service worker over messaging
let monitor = 'native';
let interval = 5;

/* ------------------- ChromeOS clipboard change event ------------------ */
let events = false;

const startEvents = () => {
  if (!events && typeof chrome.clipboard?.onClipboardDataChanged === 'object') {
    chrome.clipboard.onClipboardDataChanged.addListener(tick);
    events = true;
    // capture whatever was already copied before this document got started
    tick();
  }
};

const stopEvents = () => {
  if (events) {
    chrome.clipboard.onClipboardDataChanged.removeListener(tick);
    events = false;
  }
};

/* --------------------------- polling watchdog -------------------------- */
let id = null;

const startPolling = seconds => {
  clearInterval(id);
  if (seconds) {
    id = setInterval(tick, seconds * 1000);
  }
};

const stopPolling = () => {
  clearInterval(id);
};

// (re)configure the listeners based on the last reported configuration
const apply = () => {
  stopEvents();
  stopPolling();
  if (monitor === 'system') {
    if (interval) {
      startPolling(interval);
    }
  }
  else if (monitor === 'system-events') {
    if (typeof chrome.clipboard?.onClipboardDataChanged === 'object') {
      // the event replaces polling entirely
      startEvents();
    }
    else {
      // the ChromeOS API is missing; poll as a fallback so that monitoring
      // does not silently stop
      if (interval) {
        startPolling(interval);
      }
    }
  }
};

// request the configuration from the service worker (also wakes it up)
chrome.runtime.sendMessage({
  method: 'monitor/config'
}).then(ps => {
  if (ps) {
    monitor = ps.monitor || monitor;
    interval = ps.interval || interval;
    apply();
  }
}).catch(e => console.warn('[Clipboard History Manager]', e.message));

// react to configuration changes pushed by the service worker
chrome.runtime.onMessage.addListener(request => {
  if (request.method === 'monitor/config') {
    monitor = request.monitor || monitor;
    interval = request.interval || interval;
    apply();
  }
});
