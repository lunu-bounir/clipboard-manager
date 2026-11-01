/* globals manager, prefs */
'use strict';

const monitor = {
  id: 'desktop.clipboard.manager',
  port: null
};

/* ---------------------- Offscreen clipboard watcher ----------------------
 * Used by the 'system' and 'system-events' monitor modes to follow system
 * clipboard changes without a native client, as long as the browser runs.
 * ----------------------------------------------------------------------- */
monitor.offscreen = {
  url: 'data/offscreen/index.html'
};

monitor.offscreen.has = async () => {
  try {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL(monitor.offscreen.url)]
    });
    return contexts.length > 0;
  }
  catch (e) {
    // chrome.runtime.getContexts is not available on old Chrome releases
    return false;
  }
};

monitor.offscreen.setup = async () => {
  if (await monitor.offscreen.has()) {
    return;
  }
  try {
    await chrome.offscreen.createDocument({
      url: monitor.offscreen.url,
      reasons: ['CLIPBOARD'],
      justification: 'To record clipboard changes while the user is copying text'
    });
  }
  catch (e) {
    // the document might already be starting up
    console.warn(e);
  }
};

monitor.offscreen.close = async () => {
  if (await monitor.offscreen.has()) {
    try {
      await chrome.offscreen.closeDocument();
    }
    catch (e) {
      console.warn(e);
    }
  }
};

// forward the monitoring configuration to the running offscreen document;
// the document itself cannot read chrome.storage
monitor.offscreen.notify = async () => {
  if (await monitor.offscreen.has()) {
    const prefs = await chrome.storage.local.get({
      monitor: 'native',
      'monitor-interval': 5
    });
    chrome.runtime.sendMessage({
      method: 'monitor/config',
      monitor: prefs.monitor,
      interval: prefs['monitor-interval']
    }).catch(e => console.warn(e));
  }
};

// register content scripts used by both 'browser' and 'system' modes
monitor.browser = async () => {
  if (!chrome.scripting) {
    return;
  }
  const granted = await chrome.permissions.contains({
    permissions: ['scripting'],
    origins: ['*://*/*']
  }).catch(e => {
    console.warn(e);
    return false;
  });
  if (granted) {
    await chrome.scripting.registerContentScripts([{
      'id': 'main',
      'js': ['/data/inject.js'],
      'matches': ['*://*/*'],
      'allFrames': true,
      'matchOriginAsFallback': true,
      'runAt': 'document_start'
    }]).catch(e => console.warn(e));
  }
};

// make sure the watcher is running (used by the watchful alarm)
monitor.ensure = async () => {
  const prefs = await chrome.storage.local.get({
    monitor: 'native'
  });
  if (prefs.monitor === 'system' || prefs.monitor === 'system-events') {
    await monitor.offscreen.setup();
  }
};

// opens the setup window; at most once per browser session and never twice

monitor.presentInstaller = async () => {
  // serialize concurrent invocations (e.g. native client disconnects racing
  // with an install) so that two windows can never be created at once
  if (monitor.presentInstaller.busy) {
    return monitor.presentInstaller.busy;
  }
  monitor.presentInstaller.busy = monitor.presentInstaller.run().finally(
    () => monitor.presentInstaller.busy = null
  );
  return monitor.presentInstaller.busy;
};

monitor.presentInstaller.run = async () => {
  // a single-installation-window guarantee: the open window confirms itself
  // with "installer/exists" (and focuses itself) and no new one is created
  const alive = await chrome.runtime.sendMessage({
    method: 'installer/exists'
  }).then(r => r === true).catch(() => false);
  if (alive) {
    return;
  }
  // users with the native client already installed do not need the installer
  const native = await new Promise(resolve => {
    try {
      chrome.runtime.sendNativeMessage(monitor.id, {
        method: 'read'
      }, r => {
        chrome.runtime.lastError;
        resolve(Boolean(r));
      });
    }
    catch (e) {
      resolve(false);
    }
  });
  if (native) {
    return;
  }
  const {installer} = await chrome.storage.session.get({
    installer: false
  });
  if (installer) {
    return;
  }
  const win = await chrome.windows.getCurrent();
  try {
    await chrome.windows.create({
      url: 'data/installer/index.html',
      width: 800,
      height: 600,
      left: win.left + Math.round((win.width - 800) / 2),
      top: win.top + Math.round((win.height - 600) / 2),
      type: 'popup'
    });
    // only throttle future auto-open once the window actually exists,
    // so a failed creation path cannot permanently suppress reopening
    await chrome.storage.session.set({installer: true});
  }
  catch (e) {
    console.warn(e);
  }
};

// serialize concurrent invocations through a promise on the function object
monitor.presentInstaller.busy = null;

monitor.observe = () => {
  monitor.port = chrome.runtime.connectNative(monitor.id);
  monitor.port.onDisconnect.addListener(() => {
    console.error('native client exited unexpectedly or it is not installed');
    monitor.presentInstaller();
  });
  monitor.port.onMessage.addListener(r => {
    if (r) {
      if (r.result) {
        manager.add({
          body: r.result
        });
      }
      else if (r.error) {
        console.error(r.error);
      }
      monitor.port.disconnect();
      monitor.observe();
    }
  });
  const request = {
    method: 'read-next'
  };
  if (prefs['max-buffer-size']) {
    request.max = prefs['max-buffer-size'];
  }
  monitor.port.postMessage(request);
};
monitor.install = async () => {
  const prefs = await chrome.storage.local.get({
    monitor: 'native'
  });
  if (chrome.scripting) {
    await chrome.scripting.unregisterContentScripts().catch(e => console.warn(e));
  }
  if (prefs.monitor === 'native') {
    await monitor.offscreen.close();
    if (monitor.port) {
      monitor.port.disconnect();
    }
    monitor.observe();
  }
  else {
    if (monitor.port) {
      monitor.port.disconnect();
    }

    await monitor.browser();

    // both system modes poll/observe the system clipboard with an
    // offscreen document; no native client is needed
    if (prefs.monitor === 'system' || prefs.monitor === 'system-events') {
      await monitor.offscreen.setup();
    }
    else {
      await monitor.offscreen.close();
    }
  }
};
monitor.remove = () => {
  if (monitor.port) {
    monitor.port.disconnect();
  }
  if (chrome.scripting) {
    chrome.scripting.unregisterContentScripts();
  }
};

chrome.storage.onChanged.addListener(ps => {
  if (ps.monitor) {
    monitor.install();
  }
  if (ps.monitor || ps['monitor-interval']) {
    // keep the running offscreen document in sync with the new settings
    monitor.offscreen.notify();
  }
});
