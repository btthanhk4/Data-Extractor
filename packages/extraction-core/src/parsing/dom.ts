import type { FieldAttr } from '@swde/shared';
import { LIMITS, normalizeText, safeHttpUrl } from '@swde/shared';

/** Tags that never contain user-visible tabular data. */
export const SKIP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEMPLATE',
  'SVG',
  'CANVAS',
  'IFRAME',
  'OBJECT',
  'HEAD',
  'META',
  'LINK',
  'BR',
  'HR',
]);

/** CSS.escape polyfill (CSSOM spec); jsdom and some contexts lack CSS.escape. */
export function cssEscape(value: string): string {
  const s = String(value);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    const ch = s.charAt(i);
    if (code === 0) {
      out += '\uFFFD';
    } else if (
      (code >= 0x1 && code <= 0x1f) ||
      code === 0x7f ||
      (i === 0 && code >= 0x30 && code <= 0x39) ||
      (i === 1 && code >= 0x30 && code <= 0x39 && s.charCodeAt(0) === 0x2d)
    ) {
      out += `\\${code.toString(16)} `;
    } else if (i === 0 && code === 0x2d && s.length === 1) {
      out += `\\${ch}`;
    } else if (
      code >= 0x80 ||
      code === 0x2d ||
      code === 0x5f ||
      (code >= 0x30 && code <= 0x39) ||
      (code >= 0x41 && code <= 0x5a) ||
      (code >= 0x61 && code <= 0x7a)
    ) {
      out += ch;
    } else {
      out += `\\${ch}`;
    }
  }
  return out;
}

const UNSTABLE_CLASS =
  /^(active|selected|current|hover|focus|focused|open|odd|even|first|last|visible|hidden|show|is-|has-|js-|ng-|v-|css-|sc-|jsx-)/i;

/**
 * Filters out state classes and generated/hashed class names (CSS modules, styled-components),
 * which differ between otherwise-identical items or between page loads.
 */
export function isStableClass(cls: string): boolean {
  if (!cls || cls.length > 40) return false;
  if (UNSTABLE_CLASS.test(cls)) return false;
  if (/\d{3,}/.test(cls)) return false;
  // Hash-like suffixes: card__a8F2k, Card_title_3xQz
  if (/[_-][A-Za-z0-9]{5,}$/.test(cls) && /[0-9]/.test(cls) && /[A-Z]/.test(cls)) return false;
  return /^[A-Za-z_-][A-Za-z0-9_-]*$/.test(cls);
}

export function stableClasses(el: Element, max = 3): string[] {
  const out: string[] = [];
  for (const cls of Array.from(el.classList)) {
    if (isStableClass(cls)) out.push(cls);
    if (out.length >= max) break;
  }
  return out;
}

/** Child elements as an array, via sibling pointers (fast even where HTMLCollection is slow). */
export function childElements(el: Element): Element[] {
  const out: Element[] = [];
  for (let c = el.firstElementChild; c; c = c.nextElementSibling) out.push(c);
  return out;
}

export function tagName(el: Element): string {
  return el.tagName.toLowerCase();
}

/** One path step: tag plus stable classes, e.g. `div.card.product`. */
// Column inference asks for the same elements' steps many times (once per sibling comparison).
// Entries are keyed by element and invalidated if its class attribute changes.
const stepCache = new WeakMap<Element, { cls: string; step: string }>();

export function elementStep(el: Element): string {
  const cls = el.getAttribute('class') ?? '';
  const cached = stepCache.get(el);
  if (cached && cached.cls === cls) return cached.step;
  const classes = stableClasses(el, 2);
  const step = tagName(el) + classes.map((c) => `.${cssEscape(c)}`).join('');
  stepCache.set(el, { cls, step });
  return step;
}

/**
 * Relative path from an ancestor (the item) to a descendant. Adds `:nth-of-type` only when
 * siblings share the same step, so optional elements do not shift other columns.
 * Returns '' when target === root.
 */
export function relativePath(root: Element, target: Element): string {
  if (root === target) return '';
  const steps: string[] = [];
  let node: Element | null = target;
  while (node && node !== root) {
    const parent: Element | null = node.parentElement;
    if (!parent) return '';
    let step = elementStep(node);
    // Sibling pointers instead of parent.children: live HTMLCollections are slow in some DOMs.
    let sameStep = 0;
    let typeIndex = 0;
    let seenSelf = false;
    for (let s = parent.firstElementChild; s; s = s.nextElementSibling) {
      if (s === node) seenSelf = true;
      if (!seenSelf && s.tagName === node.tagName) typeIndex += 1;
      if (elementStep(s) === step) sameStep += 1;
    }
    if (sameStep > 1) {
      step = `${tagName(node)}:nth-of-type(${typeIndex + 1})${step.slice(tagName(node).length)}`;
    }
    steps.unshift(step);
    node = parent;
  }
  if (node !== root) return '';
  return `:scope > ${steps.join(' > ')}`;
}

export function resolvePath(item: Element, path: string): Element | null {
  if (path === '') return item;
  try {
    return item.querySelector(path);
  } catch {
    return null;
  }
}

function looksGeneratedId(id: string): boolean {
  return (
    /\d{4,}|^[a-f0-9-]{16,}$|^(ember|react|radix|headlessui|mui|:r)/i.test(id) || id.includes(':')
  );
}

/**
 * Builds a selector that uniquely identifies `el` within its document, preferring stable ids
 * and falling back to an nth-of-type chain from the nearest identifiable ancestor.
 */
export function uniqueSelector(el: Element): string {
  const doc = el.ownerDocument;
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node.nodeType === 1) {
    if (node.id && !looksGeneratedId(node.id)) {
      const idSel = `#${cssEscape(node.id)}`;
      if (safeQueryAll(doc, idSel).length === 1) {
        parts.unshift(idSel);
        break;
      }
    }
    const tag = tagName(node);
    if (tag === 'html' || tag === 'body') {
      parts.unshift(tag);
      if (tag === 'body') break;
      node = node.parentElement;
      continue;
    }
    const parent: Element | null = node.parentElement;
    if (!parent) {
      parts.unshift(tag);
      break;
    }
    const sameTag = childElements(parent).filter((c) => c.tagName === node!.tagName);
    parts.unshift(sameTag.length > 1 ? `${tag}:nth-of-type(${sameTag.indexOf(node) + 1})` : tag);
    node = parent;
  }
  return parts.join(' > ');
}

export function safeQuery(root: ParentNode, selector: string): Element | null {
  try {
    return root.querySelector(selector);
  } catch {
    return null;
  }
}

export function safeQueryAll(root: ParentNode, selector: string): Element[] {
  try {
    return Array.from(root.querySelectorAll(selector));
  } catch {
    return [];
  }
}

/** Cheap visibility check that does not force layout. */
export function isHidden(el: Element): boolean {
  if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return true;
  const view = el.ownerDocument.defaultView;
  if (!view) return false;
  try {
    const style = view.getComputedStyle(el);
    return style.display === 'none' || style.visibility === 'hidden';
  } catch {
    return false;
  }
}

/** Text from direct child text nodes only. */
export function ownText(el: Element): string {
  let text = '';
  for (let node = el.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === 3) text += node.nodeValue ?? '';
  }
  return normalizeText(text);
}

const NON_TEXT_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);
const MAX_TEXT_SCAN = 4 * LIMITS.maxCellLength;

/** Concatenated text of an element, skipping script/style subtrees (textContent would not). */
function visibleText(el: Element): string {
  let text = '';
  const stack: Node[] = [el];
  while (stack.length > 0 && text.length < MAX_TEXT_SCAN) {
    const node = stack.pop()!;
    if (node.nodeType === 3) {
      text += node.nodeValue ?? '';
      continue;
    }
    if (node.nodeType !== 1 || NON_TEXT_TAGS.has((node as Element).tagName)) continue;
    // Push children in reverse so they are visited in document order.
    for (let c = node.lastChild; c; c = c.previousSibling) stack.push(c);
  }
  return text;
}

function clip(value: string): string {
  return value.length > LIMITS.maxCellLength ? value.slice(0, LIMITS.maxCellLength) : value;
}

function urlAttr(el: Element, name: string): string {
  const raw = el.getAttribute(name);
  if (!raw) return '';
  // Resolve relative URLs and drop javascript:, data: and other non-http schemes.
  return safeHttpUrl(raw.trim(), el.ownerDocument.baseURI) ?? '';
}

function srcFor(el: Element): string {
  const img = tagName(el) === 'img' ? el : el.querySelector('img');
  if (!img) return '';
  const direct = urlAttr(img, 'src');
  if (direct) return direct;
  // Lazy-loading attributes used by many sites.
  for (const attr of ['data-src', 'data-lazy-src', 'data-original']) {
    const v = urlAttr(img, attr);
    if (v) return v;
  }
  const srcset = img.getAttribute('srcset');
  const first = srcset?.split(',')[0]?.trim().split(/\s+/)[0];
  return first ? (safeHttpUrl(first, el.ownerDocument.baseURI) ?? '') : '';
}

/** Reads one field value from an element. Never returns HTML. */
export function readField(el: Element | null, attr: FieldAttr): string {
  if (!el) return '';
  switch (attr) {
    case 'text':
      return clip(normalizeText(visibleText(el)));
    case 'href': {
      const a = el.closest('a[href]') ?? el.querySelector('a[href]');
      return a ? urlAttr(a, 'href') : '';
    }
    case 'src':
      return srcFor(el);
    case 'alt':
      return clip(
        normalizeText(el.getAttribute('alt') ?? el.querySelector('img')?.getAttribute('alt') ?? ''),
      );
    case 'title':
      return clip(normalizeText(el.getAttribute('title') ?? ''));
    case 'datetime':
      return clip(normalizeText(el.getAttribute('datetime') ?? el.getAttribute('content') ?? ''));
    case 'value':
      return clip(normalizeText((el as HTMLInputElement).value ?? el.getAttribute('value') ?? ''));
    default:
      return '';
  }
}

/** Joins the values of every element matching `path` inside the item, e.g. tag chips. */
export function readMultiField(item: Element, path: string, attr: FieldAttr): string {
  if (path === '') return readField(item, attr);
  const values = safeQueryAll(item, path)
    .slice(0, 100)
    .map((el) => readField(el, attr))
    .filter((v) => v !== '');
  return clip(values.join(', '));
}

export function isInsideNavigation(el: Element): boolean {
  return !!el.closest(
    'nav,header,footer,[role="navigation"],[role="menubar"],[role="menu"],[role="banner"],[role="contentinfo"]',
  );
}
