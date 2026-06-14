/*
 * popup.js — UI for the recorder. Talks to the page's content script via
 * chrome.tabs.sendMessage, renders the change list, and performs exports
 * (clipboard + downloads) from the popup's own extension context.
 */
(function () {
  'use strict';

  const els = {
    status: document.getElementById('status'),
    toggle: document.getElementById('toggle'),
    clear: document.getElementById('clear'),
    count: document.getElementById('count'),
    url: document.getElementById('url'),
    list: document.getElementById('list'),
    copy: document.getElementById('copy'),
    download: document.getElementById('download'),
    diff: document.getElementById('diff'),
    snapshot: document.getElementById('snapshot'),
    toast: document.getElementById('toast')
  };

  let capturing = false;

  function toast(message) {
    els.toast.textContent = message;
    els.toast.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { els.toast.hidden = true; }, 1800);
  }

  async function activeTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0];
  }

  // Send a command to the content script; resolves to null if it isn't there.
  async function send(cmd) {
    const tab = await activeTab();
    if (!tab || !tab.id) return null;
    try {
      return await chrome.tabs.sendMessage(tab.id, { cmd: cmd });
    } catch (e) {
      return null; // no content script on this page (e.g. chrome:// or not reloaded)
    }
  }

  function setStatus(isOn) {
    capturing = isOn;
    els.status.textContent = isOn ? 'recording' : 'idle';
    els.status.className = 'status ' + (isOn ? 'recording' : 'idle');
    els.toggle.textContent = isOn ? 'Stop capture' : 'Start capture';
    els.toggle.classList.toggle('recording', isOn);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function truncate(s, n) {
    s = String(s);
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  function renderEntry(c) {
    const li = document.createElement('li');
    li.className = 'entry';

    const top = document.createElement('div');
    top.className = 'top';
    top.innerHTML =
      '<span class="badge ' + c.type + '">' + c.type + '</span>' +
      '<span class="line">line ' + (c.line == null ? '?' : c.line) + '</span>' +
      (c.attr ? '<span class="line">@' + escapeHtml(c.attr) + '</span>' : '');
    li.appendChild(top);

    const sel = document.createElement('code');
    sel.className = 'selector';
    sel.textContent = c.selector;
    li.appendChild(sel);

    if (c.oldValue != null || c.newValue != null) {
      const v = document.createElement('div');
      v.className = 'values';
      let html = '';
      if (c.oldValue != null) html += '<div class="old">- ' + escapeHtml(truncate(c.oldValue, 120)) + '</div>';
      if (c.newValue != null) html += '<div class="new">+ ' + escapeHtml(truncate(c.newValue, 120)) + '</div>';
      v.innerHTML = html;
      li.appendChild(v);
    }
    return li;
  }

  function render(summary, changes) {
    if (!summary) {
      els.list.innerHTML =
        '<li class="empty">No recorder on this tab. Open a normal web page and ' +
        'reload it (the extension can\'t run on chrome:// pages or pages opened ' +
        'before it was installed).</li>';
      els.count.textContent = '—';
      els.url.textContent = '';
      setStatus(false);
      return;
    }
    setStatus(summary.capturing);
    els.count.textContent = summary.count + (summary.count === 1 ? ' change' : ' changes');
    els.url.textContent = summary.url || '';
    els.url.title = summary.url || '';

    els.list.innerHTML = '';
    if (!changes || !changes.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = summary.capturing
        ? 'Recording… edit the page to see changes appear here.'
        : 'No changes recorded yet. Click “Start capture”, then edit the page.';
      els.list.appendChild(li);
      return;
    }
    // newest first
    for (let i = changes.length - 1; i >= 0; i--) {
      els.list.appendChild(renderEntry(changes[i]));
    }
  }

  async function refresh() {
    const res = await send('GET');
    render(res && res.ok ? res.summary : null, res && res.changes);
  }

  function timestamp() {
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  }

  function downloadText(text, filename) {
    if (!text) { toast('Nothing to export'); return; }
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url: url, filename: filename, saveAs: true }, function () {
      // Revoke once the download has been handed off.
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    });
  }

  // ---- event wiring ---------------------------------------------------------

  els.toggle.addEventListener('click', async function () {
    const res = await send(capturing ? 'STOP' : 'START');
    if (!res) { toast('No recorder on this tab — reload the page'); return; }
    await refresh();
  });

  els.clear.addEventListener('click', async function () {
    await send('CLEAR');
    await refresh();
    toast('Cleared');
  });

  els.copy.addEventListener('click', async function () {
    const res = await send('LOG');
    if (!res || !res.text) { toast('Nothing to copy'); return; }
    try {
      await navigator.clipboard.writeText(res.text);
      toast('Change log copied');
    } catch (e) {
      toast('Clipboard blocked by browser');
    }
  });

  els.download.addEventListener('click', async function () {
    const res = await send('LOG');
    downloadText(res && res.text, 'dom-changes-' + timestamp() + '.txt');
  });

  els.diff.addEventListener('click', async function () {
    const res = await send('DIFF');
    if (!res || !res.text) { toast('No differences to export'); return; }
    downloadText(res.text, 'dom-changes-' + timestamp() + '.patch');
  });

  els.snapshot.addEventListener('click', async function () {
    const res = await send('SNAPSHOT');
    downloadText(res && res.text, 'page-snapshot-' + timestamp() + '.html');
  });

  refresh();
})();
