/*
 * diff.js — line-based unified diff between two snapshots.
 *
 * Uses an LCS (longest common subsequence) over arrays of lines, then groups
 * the edits into standard unified-diff hunks with surrounding context. Pure
 * string/array logic (no DOM) so it is unit-testable in Node.
 *
 * Dual-mode: attaches to globalThis.DCR in the browser, module.exports in Node.
 */
(function (global) {
  'use strict';

  // Build the LCS length matrix for arrays a and b.
  function lcsMatrix(a, b) {
    const n = a.length;
    const m = b.length;
    const dp = new Array(n + 1);
    for (let i = 0; i <= n; i++) {
      dp[i] = new Int32Array(m + 1);
    }
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        if (a[i] === b[j]) {
          dp[i][j] = dp[i + 1][j + 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
      }
    }
    return dp;
  }

  // Produce a list of ops: { type: 'eq'|'del'|'ins', value, aIndex, bIndex }.
  function diffOps(a, b) {
    const dp = lcsMatrix(a, b);
    const ops = [];
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) {
        ops.push({ type: 'eq', value: a[i], aIndex: i, bIndex: j });
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        ops.push({ type: 'del', value: a[i], aIndex: i, bIndex: j });
        i++;
      } else {
        ops.push({ type: 'ins', value: b[j], aIndex: i, bIndex: j });
        j++;
      }
    }
    while (i < a.length) {
      ops.push({ type: 'del', value: a[i], aIndex: i, bIndex: j });
      i++;
    }
    while (j < b.length) {
      ops.push({ type: 'ins', value: b[j], aIndex: i, bIndex: j });
      j++;
    }
    return ops;
  }

  /**
   * unifiedDiff(oldLines, newLines, oldName, newName, context)
   *   -> unified-diff string (empty string if there are no changes).
   */
  function unifiedDiff(oldLines, newLines, oldName, newName, context) {
    oldName = oldName || 'a';
    newName = newName || 'b';
    context = context == null ? 3 : context;

    const ops = diffOps(oldLines, newLines);
    if (!ops.some(function (o) { return o.type !== 'eq'; })) {
      return '';
    }

    // Find indices of changed ops, then expand by `context` and merge overlaps.
    const changedIdx = [];
    for (let k = 0; k < ops.length; k++) {
      if (ops[k].type !== 'eq') changedIdx.push(k);
    }

    const ranges = [];
    for (let c = 0; c < changedIdx.length; c++) {
      const idx = changedIdx[c];
      const start = Math.max(0, idx - context);
      const end = Math.min(ops.length - 1, idx + context);
      const last = ranges[ranges.length - 1];
      if (last && start <= last.end + 1) {
        last.end = Math.max(last.end, end);
      } else {
        ranges.push({ start: start, end: end });
      }
    }

    const out = [];
    out.push('--- ' + oldName);
    out.push('+++ ' + newName);

    for (let r = 0; r < ranges.length; r++) {
      const slice = ops.slice(ranges[r].start, ranges[r].end + 1);

      let aStart = null;
      let bStart = null;
      let aCount = 0;
      let bCount = 0;
      const body = [];

      for (let s = 0; s < slice.length; s++) {
        const op = slice[s];
        if (aStart === null) aStart = op.aIndex;
        if (bStart === null) bStart = op.bIndex;
        if (op.type === 'eq') {
          aCount++;
          bCount++;
          body.push(' ' + op.value);
        } else if (op.type === 'del') {
          aCount++;
          body.push('-' + op.value);
        } else {
          bCount++;
          body.push('+' + op.value);
        }
      }

      // Unified-diff line numbers are 1-based; 0 count -> 0 start.
      const aHeadStart = aCount === 0 ? aStart : aStart + 1;
      const bHeadStart = bCount === 0 ? bStart : bStart + 1;
      out.push('@@ -' + aHeadStart + ',' + aCount + ' +' + bHeadStart + ',' + bCount + ' @@');
      for (let t = 0; t < body.length; t++) out.push(body[t]);
    }

    return out.join('\n');
  }

  const api = { unifiedDiff: unifiedDiff, diffOps: diffOps };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.DCR = global.DCR || {};
    global.DCR.unifiedDiff = unifiedDiff;
    global.DCR.diffOps = diffOps;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
