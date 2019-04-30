/* globals md5, xapian, monitor */
'use strict';

var app = chrome.runtime.getManifest().app;

var prefs = {
  'mode': 'popup',
  'max-buffer-size': null,
  'focus': true,
  'maximum-records': 1000
};
chrome.storage.onChanged.addListener(ps => {
  Object.keys(ps).forEach(name => prefs[name] = ps[name].newValue);
  if (ps.mode) {
    mode();
  }
});
chrome.storage.local.get(prefs, ps => {
  Object.assign(prefs, ps);
  mode();
  monitor.install();
});

var pid; // process id of the last active app (will be used to focus the window on Mac OS)

var ports = [];
chrome.runtime.onConnect.addListener(p => {
  p.onDisconnect.addListener(() => {
    const index = ports.indexOf(p);
    if (index !== -1) {
      ports.splice(index, 1);
    }
  });
  ports.push(p);
});

xapian.config.persistent = true; // use persistent storage
var ready = false;
var jobs = [];

document.addEventListener('xapian-ready', async () => {
  ready = true;

  for (const job of jobs) {
    await manager.add(job);
  }
});

var manager = {};

manager.language = query => new Promise(resolve => chrome.i18n.detectLanguage(query, obj => {
  var convert = code => {
    code = code.split('-')[0];
    return ({
      'ar': 'arabic',
      'fa': 'arabic',
      'hy': 'armenian',
      'eu': 'basque',
      'ca': 'catalan',
      'da': 'danish',
      'nl': 'dutch',
      'en': 'english',
      'fi': 'finnish',
      'fr': 'french',
      'de': 'german',
      'hu': 'hungarian',
      'id': 'indonesian',
      'ga': 'irish',
      'it': 'italian',
      'lt': 'lithuanian',
      'ne': 'nepali',
      'no': 'norwegian',
      'nn': 'norwegian',
      'nb': 'norwegian',
      'pt': 'portuguese',
      'ro': 'romanian',
      'ru': 'russian',
      'es': 'spanish',
      'sv': 'swedish',
      'ta': 'tamil',
      'tr': 'turkish'
    })[code] || 'english';
  };
  const code = obj && obj.languages.length ? obj.languages[0].language : 'en';
  resolve(convert(code));
}));

manager.add = obj => new Promise((resolve, reject) => {
  const {body} = obj;
  let {guid} = obj;

  if (!body || body.trim().length === 0) {
    return Promise.reject(Error('empty record is ignored'));
  }
  if (ready) {
    chrome.storage.local.get({
      'record-max-length': Infinity
    }, async prefs => {
      if (body.length > prefs['record-max-length']) {
        return reject(Error('record is too big; ignored'));
      }
      obj.lang = await manager.language(body);
      guid = guid || md5(body.trim());
      // if pinned state is not forced; we need to use the previous value
      if (!('pinned' in obj)) {
        try {
          const old = await xapian.body(guid);
          obj.pinned = old.pinned;
        }
        catch (e) {}
      }
      if (obj.pinned) {
        obj.keywords = 'pinned';
      }
      return xapian.add(obj, {
        pinned: obj.pinned
      }, guid).then(resolve, reject);
    });
  }
  else {
    jobs.push(obj);
    return Promise.resolve();
  }
});

manager.search = async obj => {
  obj.lang = await manager.language(obj.query);
  return xapian.search(obj);
};
manager.search.body = (...args) => xapian.search.body(...args);
manager.records = (...args) => xapian.records(...args);
manager.remove = (...args) => xapian.remove(...args);

manager.cleanUp = (max = 500) => xapian.count().then(number => {
  const removing = number - max;
  if (removing > 0) {
    return xapian.records({
      number: removing,
      trash: true
    }).then(async records => {
      for (const record of records) {
        await xapian.remove(record.guid);
      }
      return records.length;
    });
  }
  else {
    return 0;
  }
});

// clean up
chrome.idle.onStateChanged.addListener(state => {
  if (state === 'idle') {
    manager.cleanUp(prefs['maximum-records'])
      .then(length => length && console.log(length, 'old items are removed from your clipboard history'));
  }
});

/*
(async () => {
  for (let i = 0; i < 500; i += 1) {
    console.log(i);
    await manager.add({
      body: 'this is a sample text #' + i
    });
  }
})();
*/

// messaging
chrome.runtime.onMessage.addListener((request, sender) => {
  if (request.method === 'close') {
    if (sender.tab) {
      chrome.windows.remove(sender.tab.windowId);
    }
  }
});

var getProcessId = () => new Promise(resolve => {
  if (navigator.platform === 'MacIntel') {
    chrome.runtime.sendNativeMessage(monitor.id, {
      method: 'pid'
    }, r => {
      if (r && r.result) {
        pid = r.result;
      }
      resolve();
    });
  }
  else {
    resolve();
  }
});

// commands
var onCommand = async command => {
  if (command === 'open' && app) {
    chrome.storage.local.get({
      width: 750,
      height: 550,
      left: screen.availLeft + Math.round((screen.availWidth - 700) / 2),
      top: screen.availTop + Math.round((screen.availHeight - 500) / 2)
    }, prefs => {
      chrome.app.window.create('data/manager/index.html?mode=window', {
        id: 'clipboard-manager',
        width: prefs.width,
        height: prefs.height,
        left: prefs.left,
        top: prefs.top
      });
    });
  }
  else if (command === 'open') {
    // on Mac, we store process id to focus the lat active window on the manager close request
    if (prefs.focus) {
      await getProcessId();
    }
    if (ports.length) {
      chrome.windows.update(ports[0].sender.tab.windowId, {
        focused: true
      });
    }
    else {
      chrome.storage.local.get({
        width: 750,
        height: 550,
        left: screen.availLeft + Math.round((screen.availWidth - 700) / 2),
        top: screen.availTop + Math.round((screen.availHeight - 500) / 2)
      }, prefs => {
        chrome.windows.create({
          url: chrome.extension.getURL('data/manager/index.html?mode=window'),
          width: prefs.width,
          height: prefs.height,
          left: prefs.left,
          top: prefs.top,
          type: 'popup'
        }, win => chrome.windows.update(win.id, {
          focused: true
        }));
      });
    }
  }
};
chrome.commands.onCommand.addListener(onCommand);
if (app) {
  chrome.app.runtime.onLaunched.addListener(() => onCommand('open'));
}
else {
  chrome.browserAction.onClicked.addListener(() => onCommand('open'));
}

var mode = () => chrome.browserAction && chrome.browserAction.setPopup({
  popup: prefs.mode === 'window' ? '' : 'data/manager/index.html'
});

// FAQs
{
  const {onInstalled, setUninstallURL, getManifest} = chrome.runtime;
  const {name, version} = getManifest();
  const page = getManifest().homepage_url;
  onInstalled.addListener(({reason, previousVersion}) => {
    chrome.storage.local.get({
      'faqs': true,
      'last-update': 0
    }, prefs => {
      if (reason === 'install' || (prefs.faqs && reason === 'update')) {
        const doUpdate = (Date.now() - prefs['last-update']) / 1000 / 60 / 60 / 24 > 45;
        if (doUpdate && previousVersion !== version) {
          chrome.tabs.create({
            url: page + '?version=' + version +
              (previousVersion ? '&p=' + previousVersion : '') +
              '&type=' + reason,
            active: reason === 'install'
          });
          chrome.storage.local.set({'last-update': Date.now()});
        }
      }
    });
  });
  setUninstallURL(page + '?rd=feedback&name=' + encodeURIComponent(name) + '&version=' + version);
}
