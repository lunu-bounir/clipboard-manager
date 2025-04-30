let os = 'windows';
if (navigator.userAgent.indexOf('Mac') !== -1) {
  os = 'mac';
}
document.body.dataset.os = os;

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
}
else {
  alert('Your operating system is not yet supported');
}

fetch('https://api.github.com/repos/lunu-bounir/clipboard-helper/releases/latest').then(r => r.json()).then(obj => {
  const link = obj.assets.filter(a => a.name === os + '.zip')[0].browser_download_url;
  document.getElementById('package').href = link;
}).catch(e => alert(e.message));

chrome.runtime.sendNativeMessage('desktop.clipboard.manager', {
  method: 'read'
}, r => {
  chrome.runtime.lastError;
  if (r) {
    document.getElementById('installed').style.display = 'flex';
  }
});
document.getElementById('restart').addEventListener('click', () => {
  chrome.runtime.reload();
});

chrome.storage.local.get({
  monitor: 'native'
}, prefs => {
  document.getElementById('monitor').value = prefs.monitor;
});

document.getElementById('monitor').onchange = e => {
  const monitor = e.target.value;
  if (monitor === 'browser') {
    chrome.permissions.request({
      permissions: ['scripting', 'clipboardRead'],
      origins: ['*://*/*']
    }, granted => {
      if (granted) {
        chrome.storage.local.set({
          monitor
        }).then(() => window.close());
      }
      else {
        e.target.value = 'native';
      }
    });
  }
};
