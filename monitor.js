/* globals manager, prefs */
'use strict';

const monitor = {
  id: 'desktop.clipboard.manager',
  port: null
};

monitor.observe = () => {
  monitor.port = chrome.runtime.connectNative(monitor.id);
  monitor.port.onDisconnect.addListener(async () => {
    console.error('native client exited unexpectedly or it is not installed');
    const win = await chrome.windows.getCurrent();
    chrome.windows.create({
      url: 'data/installer/index.html',
      width: 800,
      height: 600,
      left: win.left + Math.round((win.width - 800) / 2),
      top: win.top + Math.round((win.height - 600) / 2),
      type: 'popup'
    });
  });
  monitor.port.onMessage.addListener(r => {
    if (r) {
      if (r.result) {
        manager.add({
          body: r.result
        });
      }
      else if (r.error) {
        console.error(r.error);
      }
      monitor.port.disconnect();
      monitor.observe();
    }
  });
  const request = {
    method: 'read-next'
  };
  if (prefs['max-buffer-size']) {
    request.max = prefs['max-buffer-size'];
  }
  monitor.port.postMessage(request);
};
monitor.install = async () => {
  const prefs = await chrome.storage.local.get({
    monitor: 'native'
  });
  if (chrome.scripting) {
    await chrome.scripting.unregisterContentScripts();
  }
  if (prefs.monitor === 'native') {
    monitor.observe();
  }
  else {
    if (monitor.port) {
      monitor.port.disconnect();
    }

    await chrome.scripting.registerContentScripts([{
      'id': 'main',
      'js': ['/data/inject.js'],
      'matches': ['*://*/*'],
      'allFrames': true,
      'matchOriginAsFallback': true,
      'runAt': 'document_start'
    }]);
  }
};
monitor.remove = () => {
  if (monitor.port) {
    monitor.port.disconnect();
  }
  if (chrome.scripting) {
    chrome.scripting.unregisterContentScripts();
  }
};

chrome.storage.onChanged.addListener(ps => {
  if (ps.monitor) {
    monitor.install();
  }
});
