/*
 * Browser-free unit tests for diff.js (pure logic). Run with: node test/unit.js
 * The DOM-dependent serializer/selector are exercised manually in the browser.
 */
'use strict';

const assert = require('assert');
const { unifiedDiff, diffOps } = require('../src/diff.js');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('  ok - ' + name);
}

test('no changes yields empty diff', function () {
  const lines = ['<html>', '<body>', '</body>', '</html>'];
  assert.strictEqual(unifiedDiff(lines, lines, 'a', 'b'), '');
});

test('diffOps classifies insert/delete/equal', function () {
  const ops = diffOps(['a', 'b', 'c'], ['a', 'x', 'c']);
  const types = ops.map(function (o) { return o.type; }).join(',');
  // 'b' deleted, 'x' inserted, 'a' and 'c' equal (order of del/ins may vary)
  assert.ok(types.indexOf('del') !== -1, 'has a deletion');
  assert.ok(types.indexOf('ins') !== -1, 'has an insertion');
  assert.strictEqual(ops.filter(function (o) { return o.type === 'eq'; }).length, 2);
});

test('unified diff has headers and a hunk', function () {
  const oldLines = ['line1', 'line2', 'line3', 'line4', 'line5'];
  const newLines = ['line1', 'line2', 'CHANGED', 'line4', 'line5'];
  const out = unifiedDiff(oldLines, newLines, 'a/x.html', 'b/x.html');
  assert.ok(out.indexOf('--- a/x.html') === 0, 'starts with --- header');
  assert.ok(out.indexOf('+++ b/x.html') !== -1, 'has +++ header');
  assert.ok(/@@ -\d+,\d+ \+\d+,\d+ @@/.test(out), 'has a hunk header');
  assert.ok(out.indexOf('-line3') !== -1, 'removes old line');
  assert.ok(out.indexOf('+CHANGED') !== -1, 'adds new line');
});

test('pure insertion at end produces 0-count old range', function () {
  const oldLines = ['a', 'b'];
  const newLines = ['a', 'b', 'c'];
  const out = unifiedDiff(oldLines, newLines);
  assert.ok(out.indexOf('+c') !== -1, 'inserts c');
});

test('context lines included around change', function () {
  const oldLines = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const newLines = ['1', '2', '3', '4', 'X', '6', '7', '8', '9'];
  const out = unifiedDiff(oldLines, newLines, 'a', 'b', 2);
  // 3 lines of context default -> here 2; should include ' 3' and ' 6'
  assert.ok(out.indexOf(' 3') !== -1 && out.indexOf(' 6') !== -1, 'has context');
  assert.ok(out.indexOf(' 1') === -1, 'distant lines excluded');
});

console.log('\n' + passed + ' tests passed.');
