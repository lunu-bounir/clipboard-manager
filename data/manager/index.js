/* globals manager */
'use strict';

const BLANK = 'Empty database! Select a text, then use Ctrl + C on Windows and Command + C on Mac to add new entries';
// args
var args = new URLSearchParams(location.search);
document.body.dataset.mode = args.get('mode');

// add persistent connection to detect single window
chrome.runtime.connect();

var bg;

var prefs = {
  'manager/number': 10, // items to be fetched on each access
  'manager/search': 20,
  'manager/hide-on-blur': false,
  'focus': true
};
chrome.storage.local.get(prefs, ps => Object.assign(prefs, ps));

manager.on('copy', async e => {
  await navigator.clipboard.writeText(e.object.body);
  if (bg.pid && bg.pid !== -1 && prefs.focus) {
    chrome.runtime.sendNativeMessage(bg.monitor.id, {
      method: 'focus',
      pid: bg.pid
    }, () => manager.close());
  }
  else {
    manager.close();
  }
});

var fetch = (offset = 0, select = true) => bg.manager.records({
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
  bg.manager.add(object)
    .then(() => e.dataset.pinned = pinned)
    .catch(e => window.alert(e.message));
});
manager.on('trash', e => {
  const {guid, pinned} = e.object;
  if (pinned) {
    const confirm = window.confirm('This item is pinned, are you sure you want to remove it?');
    if (confirm === false) {
      return;
    }
  }
  bg.manager.remove(guid)
    .then(() => e.remove())
    .catch(e => window.alert(e.message));
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
    const {size, estimated} = await bg.manager.search({
      query: e.target.value,
      length: prefs['manager/search']
    });
    for (let i = 0; i < size; i += 1) {
      const object = await bg.manager.search.body(i);
      manager.add(object);
    }
    manager.select();
    form.dataset.value = 'matches: ' + estimated;
    if (size === 0) {
      manager.clear('No result for this search');
    }
  }
  else {
    fetch();
    form.dataset.value = '';
  }
});

// init
chrome.runtime.getBackgroundPage(_bg => {
  bg = _bg;
  fetch().then(length => {
    if (length === 0) {
      manager.clear(BLANK);
    }
  });
});

// hide on blur
window.addEventListener('blur', () => {
  if (prefs['manager/hide-on-blur']) {
    manager.close();
  }
});
