/*
 * serializer.js — deterministic pretty-printer for a DOM subtree.
 *
 * Produces one tag per line with stable 2-space indentation, plus a
 * Map<Node, lineNumber> so a changed node can be located by line. The SAME
 * function generates the baseline and the current snapshot, so diffs are clean.
 *
 * Dual-mode: attaches to globalThis.DCR in the browser, module.exports in Node.
 */
(function (global) {
  'use strict';

  const VOID_TAGS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr'
  ]);

  // Nodes the extension injects should never appear in the snapshot.
  function isExtensionNode(node) {
    return node.nodeType === 1 && node.hasAttribute && node.hasAttribute('data-dcr-ignore');
  }

  function collapseWhitespace(text) {
    return text.replace(/\s+/g, ' ').trim();
  }

  function escapeText(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeAttr(value) {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }

  function serializeAttrs(el) {
    let out = '';
    const attrs = el.attributes;
    for (let i = 0; i < attrs.length; i++) {
      const a = attrs[i];
      out += ' ' + a.name + '="' + escapeAttr(a.value) + '"';
    }
    return out;
  }

  // A child is "meaningful" if it is an element/comment, or a non-empty text node.
  function meaningfulChildren(node) {
    const out = [];
    const kids = node.childNodes;
    for (let i = 0; i < kids.length; i++) {
      const c = kids[i];
      if (isExtensionNode(c)) continue;
      if (c.nodeType === 3 /* TEXT */) {
        if (collapseWhitespace(c.textContent)) out.push(c);
      } else if (c.nodeType === 1 /* ELEMENT */ || c.nodeType === 8 /* COMMENT */) {
        out.push(c);
      }
    }
    return out;
  }

  function indentOf(depth) {
    return '  '.repeat(depth);
  }

  function walk(node, depth, lines, nodeLine) {
    if (node.nodeType === 1) {
      const tag = node.tagName.toLowerCase();
      const open = '<' + tag + serializeAttrs(node) + '>';
      // line number of this element's opening tag (1-based)
      nodeLine.set(node, lines.length + 1);

      if (VOID_TAGS.has(tag)) {
        lines.push(indentOf(depth) + open);
        return;
      }

      const children = meaningfulChildren(node);

      if (children.length === 0) {
        lines.push(indentOf(depth) + open + '</' + tag + '>');
        return;
      }

      // Inline a single short text child onto the same line for readability.
      if (children.length === 1 && children[0].nodeType === 3) {
        const text = escapeText(collapseWhitespace(children[0].textContent));
        lines.push(indentOf(depth) + open + text + '</' + tag + '>');
        nodeLine.set(children[0], lines.length);
        return;
      }

      lines.push(indentOf(depth) + open);
      for (let i = 0; i < children.length; i++) {
        walk(children[i], depth + 1, lines, nodeLine);
      }
      lines.push(indentOf(depth) + '</' + tag + '>');
    } else if (node.nodeType === 3) {
      const text = collapseWhitespace(node.textContent);
      if (text) {
        lines.push(indentOf(depth) + escapeText(text));
        nodeLine.set(node, lines.length);
      }
    } else if (node.nodeType === 8) {
      lines.push(indentOf(depth) + '<!--' + node.textContent + '-->');
      nodeLine.set(node, lines.length);
    }
  }

  /**
   * serialize(root) -> { lines: string[], text: string, nodeLine: Map<Node,number> }
   */
  function serialize(root) {
    const lines = [];
    const nodeLine = new Map();
    if (root) walk(root, 0, lines, nodeLine);
    return { lines: lines, text: lines.join('\n'), nodeLine: nodeLine };
  }

  const api = { serialize: serialize };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.DCR = global.DCR || {};
    global.DCR.serialize = serialize;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
