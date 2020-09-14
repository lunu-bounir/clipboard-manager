/* global importScripts, xapian  */

importScripts('xapian.js');
xapian.config.persistent = true; // use persistent storage

self.addEventListener('xapian-ready', async () => {
  postMessage({
    method: 'ready'
  });
});
importScripts('xapian/xapian_noexception_wasm_db.js');

self.onmessage = e => {
  const {method} = e.data;
  if (
    method === 'body' || method === 'add' || method === 'records' || method === 'remove' ||
    method === 'count' || method === 'search.body' || method === 'compact'
  ) {
    const error = err => {
      postMessage({
        id: e.data.id,
        error: err.message
      });
      console.warn('internal error', err);
    };
    try {
      const pointer = method === 'search.body' ? xapian.search.body : xapian[method];
      pointer(...e.data.args).then(response => {
        postMessage({
          id: e.data.id,
          response
        });
      }).catch(error);
    }
    catch (e) {
      error(e);
    }
  }
  else if (method === 'search') {
    const error = err => postMessage({
      id: e.data.id,
      error: err.message
    });
    try {
      postMessage({
        id: e.data.id,
        response: xapian[method](...e.data.args)
      });
    }
    catch (e) {
      error(e);
    }
  }
};
