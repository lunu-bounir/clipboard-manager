var getTableSize = function(db, dbName) {
  return new Promise((resolve, reject) => {
    if (db === null) {
      return reject(Error('db is null'));
    }
    let size = 0;
    db = event.target.result;
    const transaction = db.transaction([dbName])
      .objectStore(dbName)
      .openCursor();

    transaction.onsuccess = e => {
      const cursor = e.target.result;
      if (cursor) {
        const storedObject = cursor.value;
        const json = JSON.stringify(storedObject);
        size += json.length;
        cursor.continue();
      }
      else {
        resolve(size);
      }
    };
    transaction.onerror = e => {
      reject(Error('error in ' + dbName + ': ' + e.message));
    };
  });
};

var getDatabaseSize = dbName => new Promise((resolve, reject) => {
  const request = indexedDB.open(dbName);
  request.onsuccess = e => {
    const db = e.target.result;
    const tables = [...db.objectStoreNames];
    ((tables, db) => {
      const tableSizeGetters = tables
        .reduce( (acc, tableName) => {
          acc.push( getTableSize(db, tableName) );
          return acc;
        }, []);

      Promise.all(tableSizeGetters).then(sizes => {
        const total = sizes.reduce(function(acc, val) {
          return acc + val;
        }, 0);

        return humanReadableSize(total);
      }).then(resolve, reject);
    })(tables, db);
  };
});

var humanReadableSize = bytes => {
  const thresh = 1024;
  if (Math.abs(bytes) < thresh) {
    return bytes + ' B';
  }
  const units = ['KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  let u = -1;
  do {
    bytes /= thresh;
    ++u;
  } while (Math.abs(bytes) >= thresh && u < units.length - 1);
  return bytes.toFixed(1) + ' ' + units[u];
};
