import { LIMITS } from '@swde/shared';
import {
  SKIP_TAGS,
  childElements,
  cssEscape,
  isInsideNavigation,
  stableClasses,
  tagName,
} from '../parsing/dom';
import { isPriceLike } from '../normalization/values';

const TABLE_PARTS = new Set([
  'TABLE',
  'THEAD',
  'TBODY',
  'TFOOT',
  'TR',
  'COLGROUP',
  'SELECT',
  'OPTGROUP',
  'DATALIST',
]);
const ARIA_TABLE_ROLES = new Set(['table', 'grid', 'treegrid', 'rowgroup']);
const MIN_ITEMS = 3;
const SHAPE_SIMILARITY = 0.5;

export interface ListGroup {
  container: Element;
  items: Element[];
  itemSelector: string;
  signature: string;
  preScore: number;
}

/** Tag-path set of an element's first two descendant levels; cheap structural fingerprint. */
export function shapeOf(el: Element): Set<string> {
  const shape = new Set<string>();
  for (const child of childElements(el)) {
    if (SKIP_TAGS.has(child.tagName)) continue;
    const t = child.tagName;
    shape.add(t);
    for (const grand of childElements(child)) {
      if (!SKIP_TAGS.has(grand.tagName)) shape.add(`${t}>${grand.tagName}`);
    }
  }
  return shape;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const v of a) if (b.has(v)) inter += 1;
  return inter / (a.size + b.size - inter);
}

function commonClasses(items: Element[]): string[] {
  let common: string[] | null = null;
  for (const item of items) {
    const classes = stableClasses(item, 6);
    common = common === null ? classes : common.filter((c) => classes.includes(c));
    if (common.length === 0) break;
  }
  return (common ?? []).slice(0, 3);
}

/** Picks the members of a same-tag sibling group that share the dominant structure. */
function similarMembers(group: Element[]): {
  members: Element[];
  similarity: number;
  shape: Set<string>;
} {
  const shapes = group.map(shapeOf);
  const probe = Math.min(group.length, 15);
  let bestIndex = 0;
  let bestTotal = -1;
  for (let i = 0; i < probe; i++) {
    let total = 0;
    for (let j = 0; j < probe; j++) if (i !== j) total += jaccard(shapes[i]!, shapes[j]!);
    if (total > bestTotal) {
      bestTotal = total;
      bestIndex = i;
    }
  }
  const ref = shapes[bestIndex]!;
  const members: Element[] = [];
  let simSum = 0;
  group.forEach((el, i) => {
    const sim = jaccard(ref, shapes[i]!);
    if (sim >= SHAPE_SIMILARITY) {
      members.push(el);
      simSum += sim;
    }
  });
  return { members, similarity: members.length ? simSum / members.length : 0, shape: ref };
}

function textLength(el: Element): number {
  return Math.min((el.textContent ?? '').replace(/\s+/g, ' ').trim().length, 2_000);
}

/** Item selector and structural signature for a set of sibling items. */
export function describeGroup(items: Element[]): { itemSelector: string; signature: string } {
  const first = items[0];
  if (!first) return { itemSelector: ':scope > *', signature: '' };
  const classes = commonClasses(items);
  const step = tagName(first) + classes.map((c) => `.${cssEscape(c)}`).join('');
  const shape = shapeOf(first);
  return {
    itemSelector: `:scope > ${step}`,
    signature: `${step}|${Array.from(shape).sort().join(',')}`.slice(0, 500),
  };
}

/**
 * Scans the document for elements whose children form a repeating structure (cards, result
 * rows, directory entries). The scan is bounded by LIMITS.maxScanElements.
 */
export function findListGroups(root: Element): ListGroup[] {
  const groups: ListGroup[] = [];
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, 1 /* NodeFilter.SHOW_ELEMENT */);
  let scanned = 0;
  for (
    let node = walker.currentNode as Element | null;
    node;
    node = walker.nextNode() as Element | null
  ) {
    if (++scanned > LIMITS.maxScanElements) break;
    if (SKIP_TAGS.has(node.tagName) || TABLE_PARTS.has(node.tagName)) continue;
    // ARIA tables/grids are handled (with their header cells) by table detection.
    if (ARIA_TABLE_ROLES.has(node.getAttribute('role') ?? '')) continue;
    if (node.childElementCount < MIN_ITEMS) continue;

    const byTag = new Map<string, Element[]>();
    for (const child of childElements(node)) {
      if (SKIP_TAGS.has(child.tagName) || child.hasAttribute('hidden')) continue;
      const list = byTag.get(child.tagName);
      if (list) list.push(child);
      else byTag.set(child.tagName, [child]);
    }
    let best: ListGroup | null = null;
    for (const [tag, group] of byTag) {
      if (group.length < MIN_ITEMS) continue;
      const { members, similarity, shape } = similarMembers(group);
      if (members.length < MIN_ITEMS) continue;

      let totalText = 0;
      let links = 0;
      let images = 0;
      let prices = 0;
      const probe = members.slice(0, 30);
      for (const m of probe) {
        totalText += textLength(m);
        if (tagName(m) === 'a' || m.querySelector('a[href]')) links += 1;
        if (m.querySelector('img')) images += 1;
        const leafTexts = Array.from(m.querySelectorAll('span,div,p,strong,b,em,ins'))
          .slice(0, 40)
          .map((e) => (e.childElementCount === 0 ? (e.textContent ?? '').trim() : ''));
        if (leafTexts.some((t) => t && isPriceLike(t))) prices += 1;
      }
      const avgText = totalText / probe.length;
      if (avgText < 2) continue;

      let preScore =
        Math.pow(members.length, 0.75) *
        Math.log2(2 + avgText) *
        (0.5 + similarity) *
        (1 + shape.size / 10);
      if (links / probe.length > 0.6) preScore *= 1.15;
      if (images / probe.length > 0.6) preScore *= 1.25;
      if (prices / probe.length > 0.5) preScore *= 1.6;
      if (isInsideNavigation(node)) preScore *= 0.25;
      // Lists of bare links with very little text are usually menus.
      if (avgText < 25 && shape.size <= 1) preScore *= 0.5;

      const classes = commonClasses(members);
      const step = tag.toLowerCase() + classes.map((c) => `.${cssEscape(c)}`).join('');
      const signature = `${step}|${Array.from(shape).sort().join(',')}`.slice(0, 500);
      const candidate: ListGroup = {
        container: node,
        items: members,
        itemSelector: `:scope > ${step}`,
        signature,
        preScore,
      };
      if (!best || candidate.preScore > best.preScore) best = candidate;
    }
    if (best) groups.push(best);
  }
  return groups;
}
