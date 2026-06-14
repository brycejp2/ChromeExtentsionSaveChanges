/*
 * content.js — the recorder that lives in the page.
 *
 * Stays dormant until the popup sends START. On START it captures a baseline
 * snapshot and attaches a MutationObserver. Mutations are batched, turned into
 * change entries (type, CSS selector, snapshot line, old/new values), and kept
 * in page memory so the popup can fetch them whenever it opens.
 *
 * Relies on globals from selector.js, serializer.js, diff.js (loaded first).
 */
(function () {
  'use strict';

  const DCR = globalThis.DCR || {};
  const serialize = DCR.serialize;
  const cssPath = DCR.cssPath;
  const unifiedDiff = DCR.unifiedDiff;

  const state = {
    capturing: false,
    baseline: null,        // { lines, text, nodeLine }
    changes: [],           // recorded change entries
    observer: null,
    pending: [],           // mutation records awaiting a flush
    flushTimer: null,
    startedAt: null,
    seq: 0
  };

  function nowIso() {
    return new Date().toISOString();
  }

  function safePath(node) {
    try {
      return cssPath(node) || '(unknown)';
    } catch (e) {
      return '(unknown)';
    }
  }

  function start() {
    if (state.capturing) return summary();
    state.baseline = serialize(document.documentElement);
    state.changes = [];
    state.seq = 0;
    state.startedAt = nowIso();
    state.observer = new MutationObserver(onMutations);
    state.observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeOldValue: true,
      characterData: true,
      characterDataOldValue: true
    });
    state.capturing = true;
    return summary();
  }

  function stop() {
    if (state.observer) {
      flush(); // capture anything still pending
      state.observer.disconnect();
      state.observer = null;
    }
    state.capturing = false;
    return summary();
  }

  function clear() {
    state.changes = [];
    state.seq = 0;
    if (state.capturing) {
      // re-baseline so future lines stay meaningful
      state.baseline = serialize(document.documentElement);
    }
    return summary();
  }

  function onMutations(records) {
    for (let i = 0; i < records.length; i++) state.pending.push(records[i]);
    if (state.flushTimer) return;
    // Coalesce bursts (e.g. a framework re-render) into one snapshot pass.
    state.flushTimer = setTimeout(flush, 250);
  }

  function flush() {
    clearTimeout(state.flushTimer);
    state.flushTimer = null;
    const records = state.pending;
    state.pending = [];
    if (!records.length) return;

    // Re-serialize once so every entry in this batch gets a fresh line number.
    const current = serialize(document.documentElement);

    function lineOf(node) {
      const l = current.nodeLine.get(node);
      if (l) return l;
      const base = state.baseline && state.baseline.nodeLine.get(node);
      return base || null;
    }

    for (let i = 0; i < records.length; i++) {
      const m = records[i];

      if (m.type === 'attributes') {
        const name = m.attributeName;
        const newValue = m.target.getAttribute(name);
        // Ignore no-op attribute mutations and our own marker.
        if (name === 'data-dcr-ignore') continue;
        if (newValue === m.oldValue) continue;
        record({
          type: name === 'style' ? 'style' : 'attribute',
          attr: name,
          selector: safePath(m.target),
          line: lineOf(m.target),
          oldValue: m.oldValue == null ? null : String(m.oldValue),
          newValue: newValue == null ? null : String(newValue)
        });
      } else if (m.type === 'characterData') {
        if (m.target.data === m.oldValue) continue;
        record({
          type: 'text',
          selector: safePath(m.target.parentNode),
          line: lineOf(m.target) || lineOf(m.target.parentNode),
          oldValue: m.oldValue == null ? null : String(m.oldValue),
          newValue: String(m.target.data)
        });
      } else if (m.type === 'childList') {
        for (let a = 0; a < m.addedNodes.length; a++) {
          const node = m.addedNodes[a];
          if (node.nodeType === 1 && node.hasAttribute('data-dcr-ignore')) continue;
          record({
            type: 'added',
            selector: safePath(node),
            line: lineOf(node) || lineOf(m.target),
            oldValue: null,
            newValue: outline(node)
          });
        }
        for (let r = 0; r < m.removedNodes.length; r++) {
          const node = m.removedNodes[r];
          record({
            type: 'removed',
            selector: safePath(m.target) + ' › (removed child)',
            line: lineOf(m.target),
            oldValue: outline(node),
            newValue: null
          });
        }
      }
    }
  }

  // Short, single-line description of a node for the log.
  function outline(node) {
    if (node.nodeType === 3) return JSON.stringify(node.data.trim().slice(0, 80));
    if (node.nodeType === 8) return '<!-- comment -->';
    if (node.nodeType !== 1) return '(node)';
    const tag = node.tagName.toLowerCase();
    const id = node.id ? '#' + node.id : '';
    const cls = node.className && typeof node.className === 'string'
      ? '.' + node.className.trim().split(/\s+/).join('.')
      : '';
    return '<' + tag + id + cls + '>';
  }

  function record(entry) {
    entry.seq = ++state.seq;
    entry.at = nowIso();
    state.changes.push(entry);
  }

  function summary() {
    return {
      capturing: state.capturing,
      count: state.changes.length,
      startedAt: state.startedAt,
      url: location.href
    };
  }

  // ---- export helpers -------------------------------------------------------

  function changeLogText() {
    const head = [
      'DOM Change Recorder — change log',
      'URL:     ' + location.href,
      'Started: ' + (state.startedAt || '(not started)'),
      'Changes: ' + state.changes.length,
      ''.padEnd(60, '=')
    ];
    const body = state.changes.map(function (c) {
      const lines = [
        '#' + c.seq + '  [' + c.type.toUpperCase() + ']  line ' + (c.line == null ? '?' : c.line),
        '  selector: ' + c.selector
      ];
      if (c.attr) lines.push('  attribute: ' + c.attr);
      if (c.oldValue != null) lines.push('  - old: ' + c.oldValue);
      if (c.newValue != null) lines.push('  + new: ' + c.newValue);
      lines.push('  at: ' + c.at);
      return lines.join('\n');
    });
    return head.join('\n') + '\n' + body.join('\n\n') + '\n';
  }

  function snapshotText() {
    return serialize(document.documentElement).text;
  }

  function diffText() {
    if (!state.baseline) return '';
    const current = serialize(document.documentElement);
    const host = location.hostname || 'page';
    return unifiedDiff(
      state.baseline.lines,
      current.lines,
      'a/' + host + '.html',
      'b/' + host + '.html',
      3
    );
  }

  // ---- messaging ------------------------------------------------------------

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg || !msg.cmd) return false;
    switch (msg.cmd) {
      case 'PING':
        sendResponse({ ok: true });
        break;
      case 'START':
        sendResponse({ ok: true, summary: start() });
        break;
      case 'STOP':
        sendResponse({ ok: true, summary: stop() });
        break;
      case 'CLEAR':
        sendResponse({ ok: true, summary: clear() });
        break;
      case 'GET':
        sendResponse({ ok: true, summary: summary(), changes: state.changes });
        break;
      case 'LOG':
        sendResponse({ ok: true, text: changeLogText() });
        break;
      case 'SNAPSHOT':
        sendResponse({ ok: true, text: snapshotText() });
        break;
      case 'DIFF':
        sendResponse({ ok: true, text: diffText() });
        break;
      default:
        sendResponse({ ok: false, error: 'unknown command' });
    }
    return true; // keep the message channel open for the sync response
  });
})();
