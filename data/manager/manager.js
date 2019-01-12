'use strict';

var manager = {
  index: 1,
  callbacks: {}
};

manager.on = (name, callback) => {
  manager.callbacks[name] = manager.callbacks[name] || [];
  manager.callbacks[name].push(callback);
};
manager.emit = (name, ...values) => {
  (manager.callbacks[name] || []).forEach(c => c(...values));
};

manager.observer = new IntersectionObserver(entries => {
  entries.forEach(e => {
    e.target.dataset.intersecting = e.isIntersecting;
    if (!e.target.nextElementSibling && e.isIntersecting) {
      manager.emit('last-child', e.target);
    }
    if (!e.target.previousElementSibling && e.isIntersecting) {
      manager.emit('first-child', e.target);
    }
  });
  window.clearTimeout(manager.observer.id);
  manager.observer.id = window.setTimeout(() => {
    [...document.querySelectorAll('#content [data-intersecting=true]')].forEach((tr, i) => {
      tr.querySelector('td').textContent = i + 1;
    });
  }, 100);
}, {});

manager.clear = () => document.querySelector('#content tbody').textContent = '';

manager.add = object => {
  const t = document.getElementById('entry');
  const clone = document.importNode(t.content, true);
  clone.querySelector('[data-id=title]').textContent = object.title;
  clone.querySelector('[data-id=body]').textContent = object.body.substr(0, 300);
  clone.querySelector('[data-id=url]').textContent = object.url;
  const tr = clone.querySelector('tr');
  Object.assign(tr.dataset, {
    pinned: object.pinned || false
  });
  tr.object = object;
  clone.querySelector('td').textContent = manager.index++;
  document.querySelector('#content tbody').appendChild(clone);
  manager.observer.observe(tr, {
    threshold: 0.5
  });
};
manager.update = ({title = '', body = '', url = '', pinned = false}, index) => {
  const tr = document.querySelector(`#content tr:nth-child(${index})`);
  if (tr) {
    tr.querySelector('[data-id=title]').textContent = title;
    tr.querySelector('[data-id=body]').textContent = body;
    tr.querySelector('[data-id=url]').textContent = url;
    Object.assign(tr.querySelector('tr').dataset, {
      pinned
    });
  }
};

manager._select = tr => {
  if (tr) {
    tr.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest'
    });
    tr.classList.add('selected');
    manager.emit('select', tr);
  }
};

manager.select = (tr = document.querySelector('#content tr')) => {
  [...document.querySelectorAll('.entry.selected')].forEach(tr => tr.classList.remove('selected'));
  manager._select(tr);
};
manager.select.next = () => {
  const tr = document.querySelector('#content tr.selected + tr');
  if (tr) {
    tr.previousElementSibling.classList.remove('selected');
    manager._select(tr);
  }
};
manager.select.previous = () => {
  const tr = document.querySelector('#content tr + tr.selected');
  if (tr) {
    tr.classList.remove('selected');
    manager._select(tr.previousElementSibling);
  }
};

manager.close = () => chrome.runtime.sendMessage({
  method: 'close'
}, () => window.close());

document.addEventListener('keydown', e => {
  if (e.code === 'ArrowUp') {
    manager.select.previous();
    e.preventDefault();
  }
  else if (e.code === 'ArrowDown') {
    manager.select.next();
    e.preventDefault();
  }
  else if (e.code === 'Enter') {
    const tr = document.querySelector('#content tr.selected');
    if (tr) {
      manager.emit('copy', tr);
    }
  }
  else if (e.code === 'Escape') {
    manager.close();
  }
});
document.addEventListener('dblclick', e => {
  const tr = e.target.closest('#content tr');
  if (tr) {
    manager.emit('copy', tr);
  }
});
document.addEventListener('click', e => {
  const entry = e.target.closest('.entry');
  const cmd = e.target.dataset.cmd;
  if (entry && !cmd) {
    manager.select(entry);
  }
  if (cmd) {
    manager.emit(cmd, entry);
  }
});

