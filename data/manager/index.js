/* global manager */
'use strict';

const BLANK = 'Empty database! Select a text, then use Ctrl + C on Windows and Command + C on Mac to add new entries';
// args
const args = new URLSearchParams(location.search);
document.body.dataset.mode = args.get('mode');
self.pid = args.has('pid') ? args.get('pid') : '';

const prefs = {
  'manager/number': 10, // items to be fetched on each access
  'manager/search': 20,
  'manager/hide-on-blur': false,
  'focus': true
};
chrome.storage.local.get(prefs, ps => Object.assign(prefs, ps));

const exit = () => {
  if (self.pid && self.pid !== -1 && prefs.focus) {
    chrome.runtime.sendMessage({
      method: 'native.focus',
      pid: self.pid
    }).then(() => {
      manager.close();
    });
  }
  else {
    manager.close();
  }
};

manager.on('copy', async e => {
  await navigator.clipboard.writeText(e.object.body);
  exit();
});

const fetch = (offset = 0, select = true) => chrome.runtime.sendMessage({
  method: 'manager.records',
  number: prefs['manager/number'],
  offset,
  direction: 'prev'
}).then(records => {
  records.forEach((obj, i) => {
    obj.index = i + offset;
    manager.add(obj);
  });
  if (select) {
    manager.select();
  }
  return records.length;
});

manager.on('last-child', e => {
  if (e.object.index) {
    const offset = e.object.index + 1;
    fetch(offset, false);
  }
});
manager.on('toggle-pinned', e => {
  const pinned = e.dataset.pinned === 'false';
  const object = Object.assign(e.object, {
    pinned
  });
  chrome.runtime.sendMessage({
    object,
    method: 'manager.add'
  }).then(r => {
    if (r && r.error) {
      window.alert(e.message);
    }
    else {
      e.dataset.pinned = pinned;
    }
  });
});
manager.on('trash', e => {
  const {guid, pinned} = e.object;
  if (pinned) {
    const confirm = window.confirm('This item is pinned, are you sure you want to remove it?');
    if (confirm === false) {
      return;
    }
  }
  chrome.runtime.sendMessage({
    method: 'manager.remove',
    guid
  }).then(r => {
    if (r && r.error) {
      window.alert(r.error);
    }
    else {
      e.remove();
    }
  });
});

// search
{
  const input = document.querySelector('#search [type=search]');
  input.addEventListener('blur', () => {
    input.focus();
  });
  input.focus();
}
document.getElementById('search').addEventListener('submit', e => e.preventDefault());
document.getElementById('search').addEventListener('input', async e => {
  manager.clear(e.target.value ? '' : BLANK);
  const form = document.querySelector('#search form');
  if (e.target.value) {
    const r = await chrome.runtime.sendMessage({
      method: 'manager.search',
      query: e.target.value,
      length: prefs['manager/search']
    });
    if (r && r.error) {
      manager.clear('An error occurred: ' + e.message);
    }
    else {
      r.size = r.size || 0;
      r.estimated = r.estimated || 0;

      for (let index = 0; index < r.size; index += 1) {
        const object = await chrome.runtime.sendMessage({
          method: 'manager.search.body',
          index
        });
        manager.add(object);
      }
      manager.select();
      form.dataset.value = 'matches: ' + r.estimated;
      if (r.size === 0) {
        manager.clear('No result for this search');
      }
    }
  }
  else {
    fetch();
    form.dataset.value = '';
  }
});

// init
fetch().then(length => {
  if (length === 0) {
    manager.clear(BLANK);
  }
});

// hide on blur
if (args.get('mode') === 'window') {
  window.addEventListener('blur', () => {
    if (prefs['manager/hide-on-blur']) {
      exit();
    }
  });
}
// close on escape
document.addEventListener('keydown', e => {
  if (e.code === 'Escape') {
    exit();
  }
});

//
chrome.runtime.onMessage.addListener((request, sender, response) => {
  if (request.method === 'close') {
    window.close();
  }
});

window.focus();
