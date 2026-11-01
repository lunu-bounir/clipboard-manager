let os = 'windows';
if (navigator.userAgent.indexOf('Mac') !== -1) {
  os = 'mac';
}
document.body.dataset.os = os;

// per-selection notes; the native one is the helper installation panel
const nativePanel = document.getElementById('native');
const select = document.getElementById('monitor');
const toggleNotes = () => {
  const monitor = select.value;
  // the native installation instructions are only shown in the native mode
  nativePanel.style.display = monitor === 'native' ? 'flex' : 'none';
  document.getElementById('note-system').style.display = monitor === 'system' ? '' : 'none';
  document.getElementById('note-system-events').style.display = monitor === 'system-events' ? '' : 'none';
  document.getElementById('note-browser').style.display = monitor === 'browser' ? '' : 'none';
};
toggleNotes();

// the event-based mode is only supported on ChromeOS; hide the option on
// other platforms instead of simply disabling it to avoid confusion
const eventsOption = select.querySelector('option[value=system-events]');
const isChromeOS = navigator.userAgent.indexOf('CrOS') !== -1;
const eventsSupported = () => isChromeOS &&
  typeof chrome.clipboard?.onClipboardDataChanged !== 'undefined';
if (eventsOption && !eventsSupported()) {
  eventsOption.disabled = true;
  document.getElementById('note-system-events').style.display = 'none';
}

const config = {
  link: {
    windows: 'https://github.com/lunu-bounir/clipboard-helper/releases/download/0.1.4/windows.zip',
    mac: 'https://github.com/lunu-bounir/clipboard-helper/releases/download/0.1.4/mac.zip'
  }
};

if (os === 'mac' || os === 'windows') {
  document.getElementById('package').href = config.link[os];
  document.getElementById('package').download = os + '.zip';
  document.getElementById('uninstall').textContent = 'uninstall.' + (os === 'windows' ? 'bat' : 'sh');

  fetch('https://api.github.com/repos/lunu-bounir/clipboard-helper/releases/latest').then(r => r.json()).then(obj => {
    const link = obj.assets.filter(a => a.name === os + '.zip')[0].browser_download_url;
    document.getElementById('package').href = link;
  }).catch(e => alert(e.message));
}

// the sender checks us with this message to ensure that only one
// installation window is open at any time; a response proves we are alive
chrome.runtime.onMessage.addListener((request, sender, response) => {
  if (request.method === 'installer/exists') {
    response(true);
    chrome.windows.getCurrent(w => chrome.windows.update(w.id, {focused: true}));
  }
});

// transient message box; used by the client test and save feedback
const installedBox = document.getElementById('installed');
let installedBoxId = 0;
const showMessage = message => {
  installedBox.style.display = 'flex';
  installedBox.textContent = message;
  clearTimeout(installedBoxId);
  installedBoxId = setTimeout(() => {
    installedBox.style.display = 'none';
  }, 10000);
};

// checks the native client integration; resolves with true when it responds
const isNative = () => new Promise(resolve => {
  chrome.runtime.sendNativeMessage('desktop.clipboard.manager', {
    method: 'read'
  }, r => {
    chrome.runtime.lastError;
    resolve(Boolean(r));
  });
});

isNative().then(r => {
  if (r) {
    showMessage('Native component is installed, but exited unexpectedly. Press Test once it is fixed.');
  }
});

// recheck the native client connection without restarting the extension
document.getElementById('test').addEventListener('click', () => {
  isNative().then(r => {
    if (r) {
      showMessage('Native component is installed and working!');
    }
    else {
      showMessage('Native component is not detected yet! Complete the installation steps above, then press Test again.');
    }
  });
});

Promise.all([
  new Promise(resolve => chrome.storage.local.get({monitor: null}, resolve)),
  new Promise(resolve => chrome.storage.session.get({'first-run': false}, resolve))
]).then(([stored, session]) => {
  const firstRun = Boolean(session['first-run']) && stored.monitor === null;
  if (firstRun) {
    document.querySelector('h1').textContent = 'Welcome! Select how to collect clipboards';
  }
  // polling (Browser + System) is the default offer if the user has no stored preference
  let monitor = stored.monitor !== null ? stored.monitor : 'system';
  if (monitor === 'system-events' && !eventsSupported()) {
    monitor = 'system';
  }
  select.value = monitor;
  select.dataset.value = monitor;
  toggleNotes();
  if (monitor === 'native' && os !== 'mac' && os !== 'windows') {
    alert('The native component is not available for your operating system; please use the "Browser + System" or "Content Script" mode instead');
  }
});

// selection only switches the related note; nothing is applied until Save is pressed
select.onchange = toggleNotes;

document.getElementById('save').addEventListener('click', () => {
  let monitor = select.value;
  if (monitor === 'system-events' && !eventsSupported()) {
    // never persist the event-based mode on platforms without the API
    monitor = 'system';
    select.value = monitor;
  }
  const request = monitor === 'browser' ? {
    permissions: ['scripting', 'clipboardRead'],
    origins: ['*://*/*']
  } : monitor === 'system' ? {
    permissions: ['clipboardRead']
  } : monitor === 'system-events' ? {
    permissions: ['clipboard', 'clipboardRead']
  } : null;
  const persist = granted => {
    if (granted) {
      select.dataset.value = monitor;
      chrome.storage.local.set({
        monitor
      }).then(() => {
        if (monitor !== 'native') {
          // browser and system modes work right away; close the window
          window.close();
        }
        else {
          // native mode only works when the helper is installed; close when it is
          isNative().then(r => {
            if (r) {
              window.close();
            }
            else {
              alert('Saved! Follow the installation steps above, then press Test to recheck the native component.');
            }
          });
        }
      });
    }
    else {
      alert('Nothing was saved since the permission was denied');
      select.value = select.dataset.value || 'system';
      toggleNotes();
    }
  };
  if (request) {
    chrome.permissions.request(request, persist);
  }
  else {
    persist(true);
  }
});

