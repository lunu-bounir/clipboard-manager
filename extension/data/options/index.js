/* globals getDatabaseSize */
'use strict';

const toast = document.getElementById('toast');
toast.display = (msg, period = 2000) => {
  toast.textContent = msg;
  clearTimeout(toast.display.id);
  toast.display.id = setTimeout(() => {
    toast.textContent = '';
  }, period);
};


const init = () => chrome.storage.local.get({
  'mode': 'popup',
  'manager/search': 20,
  'manager/hide-on-blur': false,
  'max-buffer-size': 100 * 1024,
  'focus': true,
  'maximum-records': 1000,
  'faqs': true
}, prefs => {
  document.getElementById('window-mode').checked = prefs.mode === 'window';
  document.getElementById('manager/search').value = prefs['manager/search'];
  document.getElementById('manager/hide-on-blur').checked = prefs['manager/hide-on-blur'];
  document.getElementById('max-buffer-size').value = prefs['max-buffer-size'] / 1024;
  document.getElementById('focus').checked = prefs.focus;
  document.getElementById('maximum-records').value = prefs['maximum-records'];
  document.getElementById('faqs').checked = prefs.faqs;
});
document.addEventListener('DOMContentLoaded', init);

// save
document.getElementById('save').addEventListener('click', () => {
  let size = document.getElementById('max-buffer-size').value;
  if (size) {
    size = Math.min(Math.max(1, size), 1000);
  }
  chrome.storage.local.set({
    'mode': document.getElementById('window-mode').checked ? 'window' : 'popup',
    'manager/search': Math.min(50, Math.max(2, document.getElementById('manager/search').value)),
    'manager/hide-on-blur': document.getElementById('manager/hide-on-blur').checked,
    'max-buffer-size': size ? (size * 1024) : null,
    'focus': document.getElementById('focus').checked,
    'maximum-records': Math.max(10, Math.min(5000, document.getElementById('maximum-records').value)),
    'faqs': document.getElementById('faqs').checked
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
document.getElementById('clean').addEventListener('click', () => {
  const num = document.getElementById('maximum-records').value || 1000;
  chrome.runtime.getBackgroundPage(bg => bg.manager.cleanUp(num, p => {
    toast.display(p.toFixed(1) + '%', 10000);
  }).then(num => {
    toast.display('Total number of items removed: ' + num);
  }));
});

// count
document.getElementById('count').addEventListener('click', () => {
  chrome.runtime.getBackgroundPage(bg => bg.xapian.count().then(num => {
    toast.display('Total number of items stored: ' + num);
  }));
});

// export
document.getElementById('export').addEventListener('click', () => chrome.runtime.getBackgroundPage(bg => {
  bg.xapian.count().then(number => {
    bg.xapian.records({number}).then(objects => {
      const {estimated} = bg.xapian.search({
        query: 'keyword:pinned',
        size: 1
      });
      const guids = [];
      for (let i = 0; i < estimated; i += 10) {
        const {size} = bg.xapian.search({
          query: 'keyword:pinned',
          start: i,
          length: 10
        });
        for (let j = 0; j < size; j += 1) {
          guids.push(bg.xapian.search.guid(j));
        }
      }
      for (const object of objects) {
        if (guids.indexOf(object.guid) !== -1) {
          object.keywords = 'pinned';
        }
      }
      const blob = new Blob([JSON.stringify(objects)], {
        type: 'octet/stream'
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'clipboard-items.json';
      a.click();
      window.URL.revokeObjectURL(url);
    });
  });
}));

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
        chrome.runtime.getBackgroundPage(async bg => {
          const len = objects.length - 1;
          for (let i = 0; i <= len; i += 1) {
            toast.display((i / len * 100).toFixed(1) + '%', 10000);
            try {
              const object = objects[i];
              await bg.xapian.add(object, {
                pinned: object.keywords && object.keywords.indexOf('pinned') !== -1
              }, object.guid, 0, i === len - 1 || i % 100 === 0);
            }
            catch (e) {
              console.error(e);
            }
          }
          toast.display('');
        });
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
    chrome.runtime.getBackgroundPage(bg => {
      bg.xapian.compact(0, '/database').then(() => {
        toast.display('Done!');
      }).catch(e => {
        console.warn(e);
        toast.display('Something went wrong! ' + e.message);
      });
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
