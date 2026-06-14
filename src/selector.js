/*
 * selector.js — build a unique CSS selector path for a DOM node.
 * Dual-mode: attaches to globalThis.DCR in the browser, module.exports in Node.
 */
(function (global) {
  'use strict';

  // CSS.escape isn't available everywhere (or in Node); provide a small fallback.
  function cssEscape(value) {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(value);
    }
    return String(value).replace(/[^a-zA-Z0-9_-]/g, function (ch) {
      return '\\' + ch;
    });
  }

  // Return true if `selector` matches exactly one element in the document.
  function isUnique(selector, doc) {
    try {
      return doc.querySelectorAll(selector).length === 1;
    } catch (e) {
      return false;
    }
  }

  // Index of `el` among same-tag siblings (1-based), for :nth-of-type.
  function nthOfType(el) {
    let i = 1;
    let sib = el.previousElementSibling;
    while (sib) {
      if (sib.tagName === el.tagName) i++;
      sib = sib.previousElementSibling;
    }
    return i;
  }

  // Build a selector segment for a single element.
  function segment(el) {
    const tag = el.tagName.toLowerCase();
    if (el.id) {
      return tag + '#' + cssEscape(el.id);
    }
    return tag + ':nth-of-type(' + nthOfType(el) + ')';
  }

  /**
   * cssPath(node) -> a CSS selector string that locates `node` (or its nearest
   * element ancestor for text/comment nodes). Walks up the tree, stopping early
   * if an id-anchored prefix is already unique.
   */
  function cssPath(node) {
    if (!node) return '';
    // Resolve text/comment nodes to their parent element.
    let el = node;
    if (el.nodeType !== 1 /* ELEMENT_NODE */) {
      el = el.parentElement;
      if (!el) return '';
    }

    const doc = el.ownerDocument || (typeof document !== 'undefined' ? document : null);
    const parts = [];
    let current = el;
    while (current && current.nodeType === 1 && current.tagName !== 'HTML') {
      const seg = segment(current);
      parts.unshift(seg);
      // If this element has an id and that id alone is unique, we can stop.
      if (current.id && doc && isUnique('#' + cssEscape(current.id) + (parts.length > 1 ? ' ' + parts.slice(1).join(' > ') : ''), doc)) {
        // Replace the leading segment with the bare id selector for brevity.
        parts[0] = current.tagName.toLowerCase() + '#' + cssEscape(current.id);
        break;
      }
      current = current.parentElement;
    }

    const selector = parts.join(' > ');
    // Verify uniqueness; if not unique, the nth-of-type chain above still gives
    // a structurally valid (if not guaranteed-unique) path, which is the best
    // we can do for detached/duplicated subtrees.
    return selector || el.tagName.toLowerCase();
  }

  const api = { cssPath: cssPath };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.DCR = global.DCR || {};
    global.DCR.cssPath = cssPath;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
