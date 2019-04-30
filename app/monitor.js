/* globals manager */
'use strict';

var monitor = {};

monitor.observe = async () => {
  const body = navigator.clipboard.readText();
  if (body) {
    manager.add({
      body
    });
  }
};
monitor.install = () => {
  if (chrome.clipboard && 'onClipboardDataChanged' in chrome.clipboard) {
    monitor.remove();
    chrome.clipboard.onClipboardDataChanged.addListener(monitor.observe);
  }
  else {
    chrome.notifications.create({
      type: 'basic',
      title: chrome.runtime.getManifest().name,
      iconUrl: 'data/icons/48.png',
      message: `This application is meant for Chrome OS. You browser does not support the clipboard observer module. Please install the extension version with the native integration instead`
    });
  }
};
monitor.remove = () => {
  chrome.clipboard.onClipboardDataChanged.removeListener(monitor.observe);
};
