import type { NextControl } from '@swde/shared';
import { normalizeText } from '@swde/shared';
import { isHidden, safeQuery, safeQueryAll, uniqueSelector } from '../parsing/dom';

const NEXT_TEXT =
  /^(next|next page|next »|next ›|more results|older( posts)?|›|»|→|>|>>|tiếp|trang sau|siguiente|suivant|weiter|próxima|avanti|次へ|下一页)$/i;
const NEXT_HINT = /(^|[\s_-])(next|pagination-next|pager-next|page-next)([\s_-]|$)/i;

const CLICKABLE =
  'a[href], button, [role="button"], [role="link"], input[type="button"], input[type="submit"]';

export function isDisabledControl(el: Element): boolean {
  if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return true;
  if (/(^|\s)(disabled|is-disabled)(\s|$)/.test(el.getAttribute('class') ?? '')) return true;
  const li = el.closest('li');
  if (li && /(^|\s)disabled(\s|$)/.test(li.getAttribute('class') ?? '')) return true;
  return isHidden(el);
}

function labelOf(el: Element): string {
  const text = normalizeText(el.textContent ?? '');
  return (
    text ||
    normalizeText(el.getAttribute('aria-label') ?? '') ||
    normalizeText(el.getAttribute('title') ?? '') ||
    normalizeText((el as HTMLInputElement).value ?? '')
  ).slice(0, 80);
}

function control(el: Element, strategy: NextControl['strategy']): NextControl {
  return { strategy, selector: uniqueSelector(el), label: labelOf(el) || 'Next' };
}

/** Numbered pagination: the link right after the current page marker. */
function numberedNext(doc: Document): Element | null {
  const markers = safeQueryAll(
    doc,
    '[aria-current="page"], .pagination .active, .pager .active, .pagination .current, nav .current, [class*="pagination"] [class*="active"]',
  );
  for (const marker of markers) {
    const current = Number.parseInt(normalizeText(marker.textContent ?? ''), 10);
    if (!Number.isFinite(current)) continue;
    const scope =
      marker.closest('nav, ul, ol, [class*="pagination"], [class*="pager"]') ??
      marker.parentElement;
    if (!scope) continue;
    for (const link of safeQueryAll(scope, CLICKABLE)) {
      if (
        normalizeText(link.textContent ?? '') === String(current + 1) &&
        !isDisabledControl(link)
      ) {
        return link;
      }
    }
  }
  return null;
}

/**
 * Locates the "next page" control using, in order: rel=next, visible next-like labels or class
 * hints, and numbered pagination. Returns null when no enabled control is found.
 */
export function findNextControl(doc: Document): NextControl | null {
  const rel = safeQuery(doc, 'a[rel~="next"][href]');
  if (rel && !isDisabledControl(rel)) return control(rel, 'rel-next');

  const clickables = safeQueryAll(doc, CLICKABLE).slice(0, 3_000);
  for (const el of clickables) {
    if (isDisabledControl(el)) continue;
    const label = labelOf(el);
    if (
      NEXT_TEXT.test(label) ||
      NEXT_TEXT.test(normalizeText(el.getAttribute('aria-label') ?? ''))
    ) {
      return control(el, 'text');
    }
  }
  for (const el of clickables) {
    if (isDisabledControl(el)) continue;
    const hint = `${el.getAttribute('class') ?? ''} ${el.getAttribute('id') ?? ''} ${el.getAttribute('data-testid') ?? ''}`;
    if (NEXT_HINT.test(hint) && !/prev/i.test(hint)) return control(el, 'text');
  }
  const numbered = numberedNext(doc);
  return numbered ? control(numbered, 'numbered') : null;
}

/**
 * Re-locates a stored next control on the current page. Pages re-render pagination, so the
 * stored selector is tried first and detection runs again as a fallback.
 */
export function resolveNextControl(doc: Document, next: NextControl): Element | null {
  const bySelector = safeQuery(doc, next.selector);
  if (bySelector && !isDisabledControl(bySelector)) {
    if (next.strategy !== 'numbered') return bySelector;
  }
  const fresh = findNextControl(doc);
  return fresh ? safeQuery(doc, fresh.selector) : null;
}

/** Clicks the control like a user would. Returns false when it is missing or disabled. */
export function clickNextControl(doc: Document, next: NextControl): boolean {
  const el = resolveNextControl(doc, next);
  if (!el || isDisabledControl(el)) return false;
  (el as HTMLElement).click();
  return true;
}
