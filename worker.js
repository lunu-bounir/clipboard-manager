/* global md5, monitor, xapian */
'use strict';

if (typeof importScripts !== 'undefined') {
  self.importScripts('xapian.js', 'md5.js', 'monitor.js');
}

xapian.config.persistent = true; // use persistent storage

const prefs = {
  'mode': 'popup',
  'max-buffer-size': 100 * 1024,
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

const manager = {
  ready: false,
  jobs: new Set()
};

manager.language = query => new Promise(resolve => chrome.i18n.detectLanguage(query, obj => {
  const convert = code => {
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

manager.add = async obj => {
  const {body} = obj;
  let {guid} = obj;

  if (!body || body.trim().length === 0) {
    return Promise.reject(Error('empty record is ignored'));
  }
  if (manager.ready) {
    const prefs = await chrome.storage.local.get({
      'record-max-length': Infinity
    });
    if (body.length > prefs['record-max-length']) {
      throw Error('record is too big; ignored');
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

    return await xapian.add(obj, {
      pinned: obj.pinned || false
    }, guid);
  }
  else {
    manager.jobs.add(obj);
    return Promise.resolve();
  }
};

manager.cleanUp = async (max = 500, report = () => {}) => {
  const number = await xapian.count();
  const removing = number - max;
  if (removing > 0) {
    const records = await xapian.records({
      number: removing,
      trash: true
    });
    const len = records.length - 1;
    for (let i = 0; i <= len; i += 1) {
      await xapian.remove(records[i].guid, undefined, i === len || i % 100 === 0);
      report(i / len * 100);
    }
    return len + 1;
  }
  else {
    return 0;
  }
};

// clean up
chrome.idle.onStateChanged.addListener(async state => {
  if (state === 'idle') {
    const length = await manager.cleanUp(prefs['maximum-records']);
    if (length) {
      console.info(length, 'old items are removed from your clipboard history');
    }
  }
});

// messaging
chrome.runtime.onMessage.addListener((request, sender, response) => {
  if (request.method === 'close') {
    if (sender.tab) {
      chrome.windows.remove(sender.tab.windowId);
    }
  }
  else if (request.method === 'focus') {
    chrome.windows.update(sender.tab.windowId, {
      focused: true
    });
  }
  else if (request.method === 'native.focus') {
    console.log(request);
    chrome.runtime.sendNativeMessage(monitor.id, {
      method: 'focus',
      pid: request.pid
    }, response);
    return true;
  }
  else if (request.method === 'manager.records') {
    xapian.records(request).then(response);

    return true;
  }
  else if (request.method === 'manager.add') {
    manager.add(request.object).then(response).catch(e => {
      console.error(e);
      response({
        error: e.message
      });
    });
    return true;
  }
  else if (request.method === 'manager.remove') {
    xapian.remove(request.guid).then(response).catch(e => {
      console.error(e);
      response({
        error: e.message
      });
    });
    return true;
  }
  else if (request.method === 'manager.search') {
    manager.language(request.query).then(lang => {
      request.lang = lang;

      try {
        response(xapian.search(request));
      }
      catch (e) {
        console.error(e);
        response({
          error: e.message
        });
      }
    });
    return true;
  }
  else if (request.method === 'manager.search.body') {
    xapian.search.body(request.index).then(response).catch(e => {
      console.error(e);
      response({
        error: e.message
      });
    });
    return true;
  }
  else if (request.method === 'manager.count') {
    xapian.count().then(response).catch(e => {
      console.error(e);
      response({
        error: e.message
      });
    });

    return true;
  }
  else if (request.method === 'manager.cleanUp') {
    manager.cleanUp(request.number).then(response).catch(e => {
      console.error(e);
      response({
        error: e.message
      });
    });

    return true;
  }
  else if (request.method === 'export') {
    xapian.count().then(async number => {
      const objects = await xapian.records({number});
      const {estimated} = xapian.search({
        query: 'keyword:pinned',
        size: 1
      });
      const guids = [];
      for (let i = 0; i < estimated; i += 10) {
        const {size} = xapian.search({
          query: 'keyword:pinned',
          start: i,
          length: 10
        });
        for (let j = 0; j < size; j += 1) {
          guids.push(xapian.search.guid(j));
        }
      }
      for (const object of objects) {
        if (guids.indexOf(object.guid) !== -1) {
          object.keywords = 'pinned';
        }
      }

      return objects;
    }).then(response).catch(e => {
      console.error(e);
      response({
        error: e.message
      });
    });

    return true;
  }
  else if (request.method === 'import') {
    (async () => {
      const len = request.objects.length - 1;
      for (let i = 0; i <= len; i += 1) {
        chrome.runtime.sendMessage({
          method: 'toast',
          message: (i / len * 100).toFixed(1) + '%',
          timeout: 10000
        });
        try {
          const object = request.objects[i];
          await xapian.add(object, {
            pinned: object.keywords && object.keywords.indexOf('pinned') !== -1
          }, object.guid, 0, i === len - 1 || i % 100 === 0);
        }
        catch (e) {
          console.error(e);
        }
      }
      response(true);
    })();

    return true;
  }
  else if (request.method === 'manager.compact') {
    xapian.compact(0, '/database').then(response).catch(e => {
      console.error(e);
      response({
        error: e.message
      });
    });
    return true;
  }
  else if (request.method === 'write') {
    manager.add({
      body: request.body
    });
  }
});

const getProcessId = async () => {
  if (navigator.platform === 'MacIntel') {
    const r = await chrome.runtime.sendNativeMessage(monitor.id, {
      method: 'pid'
    }).catch(e => {});
    if (r && r.result) {
      // process id of the last active app (will be used to focus the window on Mac OS)
      self.pid = r.result;
    }
  }
  return;
};

// commands
const onCommand = async command => {
  if (command === 'open') {
    // on Mac, we store process id to focus the lat active window on the manager close request
    if (prefs.focus) {
      await getProcessId();
    }

    const r = await chrome.runtime.sendMessage({
      method: 'ping',
      pid: self.pid
    }).catch(e => {});
    if (!r) {
      const win = await chrome.windows.getCurrent();
      const prefs = await chrome.storage.local.get({
        width: 750,
        height: 550,
        left: win.left + Math.round((win.width - 700) / 2),
        top: win.top + Math.round((win.height - 500) / 2)
      });
      chrome.windows.create({
        url: 'data/manager/index.html?mode=window&pid=' + (self.pid || ''),
        width: prefs.width,
        height: prefs.height,
        left: prefs.left,
        top: prefs.top,
        type: 'popup'
      }, win => chrome.windows.update(win.id, {
        focused: true
      }));
    }
  }
};
chrome.commands.onCommand.addListener(onCommand);
chrome.action.onClicked.addListener(() => onCommand('open'));

const mode = () => chrome.action.setPopup({
  popup: prefs.mode === 'window' ? '' : 'data/manager/index.html'
});

/* start xapian engine */
self.addEventListener('xapian-ready', async () => {
  manager.ready = true;

  for (const job of manager.jobs) {
    await manager.add(job);
  }
  manager.jobs.clear();
});
if (typeof importScripts !== 'undefined') {
  self.importScripts('xapian/xapian_noexception_wasm_db.js');
}

/* FAQs & Feedback */
{
  const {management, runtime: {onInstalled, setUninstallURL, getManifest}, storage, tabs} = chrome;
  if (navigator.webdriver !== true) {
    const {homepage_url: page, name, version} = getManifest();
    onInstalled.addListener(({reason, previousVersion}) => {
      management.getSelf(({installType}) => installType === 'normal' && storage.local.get({
        'faqs': true,
        'last-update': 0
      }, prefs => {
        if (reason === 'install' || (prefs.faqs && reason === 'update')) {
          const doUpdate = (Date.now() - prefs['last-update']) / 1000 / 60 / 60 / 24 > 45;
          if (doUpdate && previousVersion !== version) {
            tabs.query({active: true, lastFocusedWindow: true}, tbs => tabs.create({
              url: page + '?version=' + version + (previousVersion ? '&p=' + previousVersion : '') + '&type=' + reason,
              active: reason === 'install',
              ...(tbs && tbs.length && {index: tbs[0].index + 1})
            }));
            storage.local.set({'last-update': Date.now()});
          }
        }
      }));
    });
    setUninstallURL(page + '?rd=feedback&name=' + encodeURIComponent(name) + '&version=' + version);
  }
}
