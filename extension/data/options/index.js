'use strict';

var info = document.getElementById('info');

var init = () => chrome.storage.local.get({
  'mode': 'popup',
  'manager/search': 20,
  'manager/hide-on-blur': false,
  'max-buffer-size': null,
  'focus': true,
  'maximum-records': 1000,
  'faqs': true
}, prefs => {
  document.getElementById('window-mode').checked = prefs.mode === 'window';
  document.getElementById('manager/search').value = prefs['manager/search'];
  document.getElementById('manager/hide-on-blur').checked = prefs['manager/hide-on-blur'];
  document.getElementById('max-buffer-size').value = prefs['max-buffer-size'];
  document.getElementById('focus').checked = prefs.focus;
  document.getElementById('maximum-records').value = prefs['maximum-records'];
  document.getElementById('faqs').checked = prefs.faqs;
});
document.addEventListener('DOMContentLoaded', init);

// save
document.getElementById('save').addEventListener('click', () => {
  let size = document.getElementById('max-buffer-size').value;
  if (size) {
    size = Math.min(Math.max(10, size), 1024 * 1024 - 5000);
  }
  chrome.storage.local.set({
    'mode': document.getElementById('window-mode').checked ? 'window' : 'popup',
    'manager/search': Math.min(50, Math.max(2, document.getElementById('manager/search').value)),
    'manager/hide-on-blur': document.getElementById('manager/hide-on-blur').checked,
    'max-buffer-size': size || null,
    'focus': document.getElementById('focus').checked,
    'maximum-records': Math.max(10, Math.min(5000, document.getElementById('maximum-records').value)),
    'faqs': document.getElementById('faqs').checked
  }, () => {
    info.textContent = 'Options saved!';
    init();
    window.setTimeout(() => info.textContent = '', 750);
  });
});

// reset
document.getElementById('reset').addEventListener('click', e => {
  if (e.detail === 1) {
    info.textContent = 'Double-click to reset!';
    window.setTimeout(() => info.textContent = '', 750);
  }
  else {
    localStorage.clear();
    chrome.storage.local.clear(() => {
      chrome.runtime.reload();
      window.close();
    });
  }
});

// support
document.getElementById('support').addEventListener('click', () => chrome.tabs.create({
  url: chrome.runtime.getManifest().homepage_url + '?rd=donate'
}));

// clean
document.getElementById('clean').addEventListener('click', () => {
  const num = document.getElementById('maximum-records').value || 1000;
  info.textContent = 'Please wait...';
  chrome.runtime.getBackgroundPage(bg => bg.manager.cleanUp(num).then(num => {
    info.textContent = 'Total number of items removed: ' + num;
    window.setTimeout(() => info.textContent = '', 750);
  }));
});

// count
document.getElementById('count').addEventListener('click', () => {
  chrome.runtime.getBackgroundPage(bg => bg.xapian.count().then(num => {
    info.textContent = 'Total number of items stored: ' + num;
    window.setTimeout(() => info.textContent = '', 750);
  }));
});
