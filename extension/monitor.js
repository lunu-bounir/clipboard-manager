/* globals manager, prefs */
'use strict';

var monitor = {
  id: 'desktop.clipboard.manager',
  port: null
};

monitor.observe = () => {
  monitor.port = chrome.runtime.connectNative(monitor.id);
  monitor.port.onDisconnect.addListener(() => {
    console.error('native client exited unexpectedly or it is not installed');
    chrome.windows.create({
      url: chrome.extension.getURL('data/installer/index.html'),
      width: 600,
      height: 450,
      left: screen.availLeft + Math.round((screen.availWidth - 600) / 2),
      top: screen.availTop + Math.round((screen.availHeight - 450) / 2),
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
monitor.install = () => {
  monitor.observe();
};
monitor.remove = () => {
  if (monitor.port) {
    monitor.port.disconnect();
  }
};

window.addEventListener('beforeunload', () => monitor.port && monitor.port.disconnect());
