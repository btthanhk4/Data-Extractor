import type { ColumnDef, FieldAttr } from '@swde/shared';
import { LIMITS } from '@swde/shared';
import {
  SKIP_TAGS,
  elementStep,
  ownText,
  readField,
  readMultiField,
  relativePath,
  tagName,
} from '../parsing/dom';
import type { TableGrid } from '../parsing/table';
import { detectColumnType } from '../normalization/values';

const INLINE_TAGS = new Set([
  'B',
  'I',
  'EM',
  'STRONG',
  'SMALL',
  'SPAN',
  'SUP',
  'SUB',
  'MARK',
  'U',
  'S',
  'ABBR',
  'CODE',
  'TIME',
  'BDI',
  'Q',
]);

const MAX_NODES_PER_ITEM = 200;
const MAX_DEPTH = 10;
const MAX_SAMPLE_ITEMS = 60;

const NAME_HINTS: [RegExp, string][] = [
  [/\b(title|headline|heading)\b/, 'Title'],
  [/\b(name|product-?name|item-?name)\b/, 'Name'],
  [/\b(price|cost|amount|fee)\b/, 'Price'],
  [/\b(discount|sale|savings|was-?price|old-?price)\b/, 'Discount'],
  [/\b(rating|stars?|score)\b/, 'Rating'],
  [/\breviews?\b/, 'Reviews'],
  [/\b(date|time|posted|published|updated)\b/, 'Date'],
  [/\b(author|byline|user(name)?|seller)\b/, 'Author'],
  [/\b(desc|description|summary|excerpt|snippet|teaser)\b/, 'Description'],
  [/\b(address|location|city|region|country)\b/, 'Location'],
  [/\b(phone|tel|telephone)\b/, 'Phone'],
  [/\b(e-?mail)\b/, 'Email'],
  [/\b(category|categories|tags?|genre)\b/, 'Category'],
  [/\b(brand|manufacturer|vendor)\b/, 'Brand'],
  [/\b(company|employer|organization|org)\b/, 'Company'],
  [/\bsku\b/, 'SKU'],
  [/\b(stock|availability|inventory)\b/, 'Availability'],
  [/\b(salary|wage|compensation)\b/, 'Salary'],
];

interface FieldStat {
  path: string;
  attr: FieldAttr;
  multi: boolean;
  count: number;
  orderSum: number;
  values: string[];
  hint: string;
  tag: string;
}

function hintText(el: Element): string {
  const parts = [
    el.getAttribute('itemprop'),
    el.getAttribute('data-testid'),
    el.getAttribute('data-test'),
    el.getAttribute('aria-label') && el.getAttribute('aria-label')!.length < 30
      ? el.getAttribute('aria-label')
      : null,
    el.getAttribute('class'),
  ];
  return parts
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_]+/g, '-')
    .slice(0, 300);
}

function sampleItems(items: Element[]): Element[] {
  if (items.length <= MAX_SAMPLE_ITEMS) return items;
  const step = items.length / MAX_SAMPLE_ITEMS;
  const out: Element[] = [];
  for (let i = 0; i < MAX_SAMPLE_ITEMS; i++) out.push(items[Math.floor(i * step)]!);
  return out;
}

function collectItemFields(item: Element, visit: (el: Element, order: number) => void): void {
  let order = 0;
  const stack: { el: Element; depth: number }[] = [{ el: item, depth: 0 }];
  while (stack.length > 0 && order < MAX_NODES_PER_ITEM) {
    const { el, depth } = stack.pop()!;
    if (SKIP_TAGS.has(el.tagName) || el.hasAttribute('hidden')) continue;
    visit(el, order++);
    if (depth >= MAX_DEPTH) continue;
    const children = el.children;
    for (let i = children.length - 1; i >= 0; i--)
      stack.push({ el: children[i]!, depth: depth + 1 });
  }
}

function repeatsAmongSiblings(node: Element): boolean {
  const parent = node.parentElement;
  if (!parent || parent.childElementCount < 3) return false;
  const step = elementStep(node);
  let same = 0;
  for (let c = parent.firstElementChild; c; c = c.nextElementSibling) {
    if (elementStep(c) === step && ++same >= 3) return true;
  }
  return false;
}

/**
 * When an element sits inside a repeated sub-structure of the item (tag chips, feature bullets,
 * a nested list), returns a path matching every repetition so they become one joined column
 * instead of one column per position.
 */
function multiPath(item: Element, el: Element): string | null {
  if (el === item) return null;
  let repeated: Element | null = null;
  for (let node: Element | null = el; node && node !== item; node = node.parentElement) {
    if (repeatsAmongSiblings(node)) {
      repeated = node;
      break;
    }
  }
  if (!repeated?.parentElement) return null;
  const base = relativePath(item, repeated.parentElement);
  if (base === '' && repeated.parentElement !== item) return null;
  const head = `${base === '' ? ':scope' : base} > ${elementStep(repeated)}`;
  const tail = repeated === el ? '' : relativePath(repeated, el).replace(/^:scope > /, ' > ');
  if (repeated !== el && tail === '') return null;
  return head + tail;
}

const TAG_NAMES: Record<string, string> = {
  cite: 'Source',
  time: 'Date',
  address: 'Location',
  q: 'Quote',
  blockquote: 'Quote',
  figcaption: 'Caption',
};

function nameFor(stat: FieldStat): string {
  const hint = stat.hint;
  for (const [re, name] of NAME_HINTS) {
    if (re.test(hint)) {
      if (stat.attr === 'href') return `${name} link`;
      if (stat.attr === 'src') return `${name} image`;
      return name;
    }
  }
  if (stat.attr === 'href') return 'Link';
  if (stat.attr === 'src') return 'Image';
  if (stat.attr === 'datetime') return 'Date';
  if (/^h[1-6]$/.test(stat.tag)) return 'Title';
  if (TAG_NAMES[stat.tag]) return TAG_NAMES[stat.tag]!;
  if (stat.multi) return stat.tag === 'li' ? 'Tags' : 'Items';
  switch (detectColumnType(stat.values)) {
    case 'currency':
      return 'Price';
    case 'date':
      return 'Date';
    case 'number':
      return 'Number';
    case 'percent':
      return 'Percent';
    case 'email':
      return 'Email';
    case 'url':
      return 'URL';
    default:
      return stat.tag === 'a' ? 'Link text' : 'Text';
  }
}

export function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    return n === 1 ? name : `${name} ${n}`;
  });
}

/**
 * Infers columns for a repeating list by collecting candidate fields (own text, links, images)
 * from sampled items and keeping the paths that recur across items.
 */
export function inferListColumns(items: Element[]): ColumnDef[] {
  const sample = sampleItems(items);
  const stats = new Map<string, FieldStat>();

  sample.forEach((item) => {
    const seen = new Set<string>();
    collectItemFields(item, (el, order) => {
      const tag = el.tagName;
      const add = (attr: FieldAttr) => {
        const multi = multiPath(item, el);
        const path = multi ?? relativePath(item, el);
        if (path === '' && el !== item) return;
        const key = `${path}|${attr}|${multi ? 'm' : ''}`;
        if (seen.has(key)) return;
        seen.add(key);
        const value = multi ? readMultiField(item, multi, attr) : readField(el, attr);
        if (!value) return;
        let stat = stats.get(key);
        if (!stat) {
          const heading = el.closest('h1,h2,h3,h4,h5,h6');
          const tag = heading && item.contains(heading) ? 'h2' : tagName(el);
          stat = {
            path,
            attr,
            multi: multi !== null,
            count: 0,
            orderSum: 0,
            values: [],
            hint: hintText(el),
            tag,
          };
          stats.set(key, stat);
        }
        stat.count += 1;
        stat.orderSum += order + (attr === 'text' ? 0 : 0.1);
        if (stat.values.length < 50) stat.values.push(value);
      };

      const parent = el.parentElement;
      const isInlineInText =
        INLINE_TAGS.has(tag) && el !== item && parent !== null && ownText(parent) !== '';
      if (!isInlineInText && ownText(el) !== '') add('text');
      if (tag === 'A' && el.hasAttribute('href')) add('href');
      if (tag === 'IMG') add('src');
    });
  });

  const minCount = Math.max(2, Math.ceil(sample.length * 0.3));
  let kept = Array.from(stats.values()).filter((s) => s.count >= Math.min(minCount, sample.length));

  // Drop constant button labels ("Add to cart") that carry no data.
  kept = kept.filter((s) => {
    if (s.attr !== 'text' || s.tag !== 'button') return true;
    return new Set(s.values).size > 1;
  });

  // Drop link/image columns that duplicate an earlier column's values exactly.
  const bySignature = new Set<string>();
  kept.sort((a, b) => a.orderSum / a.count - b.orderSum / b.count);
  kept = kept.filter((s) => {
    if (s.attr === 'text') return true;
    const sig = `${s.attr}|${s.values.join('\u0001')}`;
    if (bySignature.has(sig)) return false;
    bySignature.add(sig);
    return true;
  });

  if (kept.length > LIMITS.maxColumns) {
    const top = new Set(
      kept
        .slice()
        .sort((a, b) => b.count - a.count)
        .slice(0, LIMITS.maxColumns),
    );
    kept = kept.filter((s) => top.has(s));
  }

  const rawNames = kept.map(nameFor);
  // A leading link with no explicit title column is almost always the item title.
  if (!rawNames.some((n) => n === 'Title' || n === 'Name')) {
    const first = rawNames.indexOf('Link text');
    if (first >= 0) rawNames[first] = 'Title';
  }
  const names = uniqueNames(rawNames);
  return kept.map((s, i) => ({
    id: `c${i}`,
    name: names[i]!,
    source: s.multi
      ? { type: 'path', path: s.path, attr: s.attr, multi: true }
      : { type: 'path', path: s.path, attr: s.attr },
  }));
}

/** Builds columns for a table grid, adding link/image columns where cells mostly contain them. */
export function inferTableColumns(grid: TableGrid): ColumnDef[] {
  const out: { name: string; index: number; attr: FieldAttr }[] = [];
  const rows = grid.rows.slice(0, 500);
  for (let c = 0; c < grid.width; c++) {
    let nonEmpty = 0;
    let links = 0;
    let images = 0;
    for (const row of rows) {
      const cell = row[c];
      if (!cell) continue;
      if (readField(cell, 'text')) nonEmpty += 1;
      if (cell.querySelector('a[href]')) links += 1;
      if (cell.querySelector('img')) images += 1;
    }
    const base = grid.header[c] || `Column ${c + 1}`;
    if (nonEmpty === 0 && links === 0 && images === 0 && !grid.header[c]) continue;
    out.push({ name: base, index: c, attr: 'text' });
    if (rows.length > 0 && links / rows.length >= 0.5) {
      out.push({ name: `${base} link`, index: c, attr: 'href' });
    }
    if (rows.length > 0 && images / rows.length >= 0.5) {
      out.push({ name: `${base} image`, index: c, attr: 'src' });
    }
  }
  const limited = out.slice(0, LIMITS.maxColumns);
  const names = uniqueNames(limited.map((c) => c.name));
  return limited.map((c, i) => ({
    id: `c${i}`,
    name: names[i]!,
    source: { type: 'cell', index: c.index, attr: c.attr },
  }));
}
