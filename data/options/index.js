/* global getDatabaseSize */
'use strict';

const toast = document.getElementById('toast');
toast.display = (msg, period = 2000) => {
  toast.textContent = msg;
  clearTimeout(toast.display.id);
  toast.display.id = setTimeout(() => {
    toast.textContent = '';
  }, period);
};

// the event-based "Browser + System Events" mode is only supported on ChromeOS;
// the mode is offered only when both the platform and the API are available
const optionSystemEvents = document.querySelector('#monitor option[value=system-events]');
const isChromeOS = () => navigator.userAgent.indexOf('CrOS') !== -1;
const eventsSupported = () => isChromeOS() &&
  typeof chrome.clipboard?.onClipboardDataChanged !== 'undefined';

// inline native client test button; displayed next to the monitor select
const buttonTestNative = document.getElementById('test-native');
buttonTestNative.addEventListener('click', () => {
  toast.display('Checking the native component ...', 10000);
  try {
    chrome.runtime.sendNativeMessage('desktop.clipboard.manager', {
      method: 'read'
    }, r => {
      chrome.runtime.lastError;
      if (r) {
        toast.display('Native component is installed and working!');
      }
      else {
        toast.display('Native component is not detected yet! Please follow the installation steps on this page while the "Browser + System" mode is selected.', 10000);
      }
    });
  }
  catch (e) {
    console.warn(e);
    toast.display('Native component is not detected yet! Please follow the installation steps on this page while the "Browser + System" mode is selected.', 10000);
  }
});

const init = () => chrome.storage.local.get({
  'mode': 'popup',
  'manager/search': 20,
  'manager/hide-on-blur': false,
  'max-buffer-size': 100 * 1024,
  'focus': true,
  'maximum-records': 1000,
  'faqs': true,
  'monitor': 'native',
  'monitor-interval': 5
}, prefs => {
  document.getElementById('window-mode').checked = prefs.mode === 'window';
  document.getElementById('manager/search').value = prefs['manager/search'];
  document.getElementById('manager/hide-on-blur').checked = prefs['manager/hide-on-blur'];
  document.getElementById('max-buffer-size').value = prefs['max-buffer-size'] / 1024;
  document.getElementById('focus').checked = prefs.focus;
  document.getElementById('maximum-records').value = prefs['maximum-records'];
  document.getElementById('faqs').checked = prefs.faqs;
  document.getElementById('monitor-interval').value = prefs['monitor-interval'];
  // the event-based mode is disabled on platforms without the ChromeOS API;
  // a stored 'system-events' preference silently falls back to polling mode
  if (optionSystemEvents && !eventsSupported()) {
    optionSystemEvents.disabled = true;
    if (prefs.monitor === 'system-events') {
      prefs.monitor = 'system';
    }
  }
  document.getElementById('monitor').value = prefs.monitor;
  document.getElementById('monitor').dataset.value = prefs.monitor;
  buttonTestNative.style.display = prefs.monitor === 'native' ? '' : 'none';
});
document.addEventListener('DOMContentLoaded', init);

// save
document.getElementById('save').addEventListener('click', () => {
  let size = document.getElementById('max-buffer-size').value;
  if (size) {
    size = Math.min(Math.max(1, size), 1000);
  }
  let interval = document.getElementById('monitor-interval').value;
  if (interval) {
    interval = Math.min(Math.max(1, interval), 60);
  }
  let monitor = document.getElementById('monitor').value;
  if (monitor === 'system-events' && !eventsSupported()) {
    // never persist the event-based mode on platforms without the API
    monitor = 'system';
  }
  chrome.storage.local.set({
    'mode': document.getElementById('window-mode').checked ? 'window' : 'popup',
    'manager/search': Math.min(50, Math.max(2, document.getElementById('manager/search').value)),
    'manager/hide-on-blur': document.getElementById('manager/hide-on-blur').checked,
    'max-buffer-size': size ? (size * 1024) : null,
    'focus': document.getElementById('focus').checked,
    'maximum-records': Math.max(10, Math.min(5000, document.getElementById('maximum-records').value)),
    'faqs': document.getElementById('faqs').checked,
    'monitor-interval': interval || 5,
    'monitor': monitor
  }, () => {
    toast.display('Options saved!');
    init();
  });
});

// reset
document.getElementById('reset').addEventListener('click', e => {
  if (e.detail === 1) {
    toast.display('Double-click to reset!');
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
document.getElementById('clean').addEventListener('click', async () => {
  const o = await chrome.runtime.sendMessage({
    method: 'manager.cleanUp',
    number: document.getElementById('maximum-records').value || 1000
  });
  if (o && o.error) {
    toast.display(o.error);
  }
  else {
    toast.display('Total number of items removed: ' + o);
  }
});

// count
document.getElementById('count').addEventListener('click', () => {
  chrome.runtime.sendMessage({
    method: 'manager.count'
  }).then(o => {
    if (o && o.error) {
      toast.display(o.error);
    }
    else {
      toast.display('Total number of items stored: ' + o);
    }
  });
});

// export
document.getElementById('export').addEventListener('click', async () => {
  const o = await chrome.runtime.sendMessage({
    method: 'export'
  });
  if (o && o.error) {
    return toast.display(o.error);
  }

  const blob = new Blob([JSON.stringify(o)], {
    type: 'octet/stream'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'clipboard-items.json';
  a.click();
  URL.revokeObjectURL(url);
});

// import
document.getElementById('import').addEventListener('click', () => {
  const file = document.createElement('input');
  file.style.display = 'none';
  file.type = 'file';
  file.accept = '.json';
  file.acceptCharset = 'utf-8';

  document.body.appendChild(file);
  file.onchange = () => {
    if (file.value !== file.initialValue) {
      const entry = file.files[0];
      if (entry.size > 100e6) {
        console.warn('100MB backup? I don\'t believe you.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = e => {
        const objects = JSON.parse(e.target.result);
        chrome.runtime.sendMessage({
          method: 'import',
          objects
        }).then(() => toast.display(''));
      };
      reader.readAsText(entry, 'utf-8');
    }
  };
  file.click();
});

// compact
document.getElementById('compact').addEventListener('click', e => {
  if (e.detail === 1) {
    toast.display('Export the database and double-click to proceed');
  }
  else {
    toast.display('Please wait ...', 10000);
    chrome.runtime.sendMessage({
      method: 'manager.compact'
    }).then(r => {
      if (r && r.error) {
        toast(r.error);
      }
      toast.display('Done!');
    });
  }
});

// size
document.getElementById('size').addEventListener('click', () => {
  toast.display('Please wait ...', 10000);
  Promise.all([
    getDatabaseSize('/database'),
    getDatabaseSize('storage')
  ]).then(([a, b]) => {
    toast.display('Index Size: ' + a + ', Storage Size: ' + b);
  }).catch(e => {
    toast.display('Error: ' + e.message);
    console.warn(e);
  });
});

chrome.runtime.onMessage.addListener(request => {
  if (request.method === 'toast') {
    toast.display(request.message, request.timeout);
  }
});


document.getElementById('monitor').onchange = e => {
  // the test button is only offered while the native mode is selected
  buttonTestNative.style.display = e.target.value === 'native' ? '' : 'none';
  const monitor = e.target.value;
  const previous = e.target.dataset.value || 'native';
  const request = monitor === 'browser' ? {
    permissions: ['scripting', 'clipboardRead'],
    origins: ['*://*/*']
  } : monitor === 'system' ? {
    permissions: ['clipboardRead']
  } : monitor === 'system-events' ? {
    permissions: ['clipboard', 'clipboardRead']
  } : null;
  const sync = granted => {
    if (granted) {
      e.target.dataset.value = monitor;
    }
    else {
      e.target.value = previous;
    }
  };
  if (request) {
    chrome.permissions.request(request, sync);
  }
  else {
    sync(true); // native mode needs no optional permission
  }
};
