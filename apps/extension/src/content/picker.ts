import type { ColumnDef, DatasetDescriptor, FieldAttr } from '@swde/shared';
import {
  childElements,
  describeGroup,
  extractRows,
  inferListColumns,
  jaccard,
  relativePath,
  shapeOf,
  uniqueNames,
  uniqueSelector,
} from '@swde/extraction-core';
import type { PickerControl } from './handler';
import { pageInfo } from './handler';

const MAX_BOXES = 300;
const ACCENT = '13 148 136';

const CSS = `
:host { all: initial; }
.layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483646; }
.box { position: fixed; box-sizing: border-box; border-radius: 4px; transition: all 60ms linear; }
.hover { border: 2px solid rgb(${ACCENT}); background: rgb(${ACCENT} / 0.12); }
.member { border: 1.5px dashed rgb(${ACCENT} / 0.9); background: rgb(${ACCENT} / 0.05); }
.field { border: 2px solid rgb(234 88 12); background: rgb(234 88 12 / 0.12); }
.toolbar { position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); pointer-events: auto;
  display: flex; align-items: center; gap: 8px; max-width: calc(100vw - 32px); padding: 10px 12px;
  background: #111418; color: #f4f4f5; border-radius: 12px; box-shadow: 0 10px 30px rgb(0 0 0 / 0.35);
  font: 13px/1.4 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; z-index: 2147483647; }
.msg { flex: 1; min-width: 180px; }
.msg strong { color: #5eead4; font-weight: 600; }
button { all: unset; cursor: pointer; padding: 6px 10px; border-radius: 8px; font-weight: 500;
  background: #262b33; color: #f4f4f5; white-space: nowrap; }
button:hover { background: #333a44; }
button:focus-visible { outline: 2px solid #5eead4; outline-offset: 1px; }
button.primary { background: rgb(${ACCENT}); color: white; }
button.primary:hover { background: rgb(15 118 110); }
button[disabled] { opacity: 0.45; cursor: default; }
.chip { padding: 2px 8px; border-radius: 999px; background: rgb(234 88 12 / 0.2); color: #fdba74; }
`;

interface Group {
  item: Element;
  members: Element[];
}

interface Field {
  path: string;
  attr: FieldAttr;
}

function groupsFor(target: Element, body: Element): Group[] {
  const groups: Group[] = [];
  let node: Element | null = target;
  for (let depth = 0; node && node !== body && depth < 14; depth++) {
    const parent: Element | null = node.parentElement;
    if (!parent) break;
    const shape = shapeOf(node);
    const tag = node.tagName;
    const members = childElements(parent).filter(
      (c) => c.tagName === tag && jaccard(shape, shapeOf(c)) >= 0.5,
    );
    if (members.length >= 2) groups.push({ item: node, members });
    node = parent;
  }
  return groups;
}

export function createPicker(doc: Document): PickerControl {
  let host: HTMLElement | null = null;
  let layer: HTMLDivElement | null = null;
  let toolbar: HTMLDivElement | null = null;
  let message: HTMLDivElement | null = null;
  let buttons: {
    wider: HTMLButtonElement;
    narrower: HTMLButtonElement;
    done: HTMLButtonElement;
    back: HTMLButtonElement;
  } | null = null;
  let phase: 'item' | 'fields' = 'item';
  let candidates: Group[] = [];
  let level = 0;
  let locked: Group | null = null;
  let hoverField: Element | null = null;
  let fields: Field[] = [];
  let frame = 0;
  let lastPoint: { x: number; y: number } | null = null;
  const boxes: HTMLDivElement[] = [];

  const active = () => host !== null;

  function box(i: number, cls: string): HTMLDivElement {
    let el = boxes[i];
    if (!el) {
      el = doc.createElement('div');
      boxes[i] = el;
      layer!.append(el);
    }
    el.className = `box ${cls}`;
    el.style.display = 'block';
    return el;
  }

  function place(el: HTMLDivElement, target: Element): void {
    const r = target.getBoundingClientRect();
    el.style.top = `${r.top}px`;
    el.style.left = `${r.left}px`;
    el.style.width = `${r.width}px`;
    el.style.height = `${r.height}px`;
  }

  function currentGroup(): Group | null {
    return locked ?? candidates[Math.min(level, candidates.length - 1)] ?? null;
  }

  function render(): void {
    if (!layer || !message || !buttons) return;
    let used = 0;
    const group = currentGroup();
    if (group) {
      for (const m of group.members.slice(0, MAX_BOXES)) {
        place(box(used++, m === group.item && phase === 'item' ? 'hover' : 'member'), m);
      }
    }
    if (phase === 'fields' && locked) {
      for (const f of fields) {
        for (const m of locked.members.slice(0, 50)) {
          const target = f.path === '' ? m : m.querySelector(f.path);
          if (target && used < MAX_BOXES * 2) place(box(used++, 'field'), target);
        }
      }
      if (hoverField) place(box(used++, 'hover'), hoverField);
    }
    for (let i = used; i < boxes.length; i++) boxes[i]!.style.display = 'none';

    message.textContent = '';
    const strong = doc.createElement('strong');
    if (phase === 'item') {
      if (group) {
        strong.textContent = `${group.members.length} similar items`;
        message.append(strong, doc.createTextNode(' — click to select, or use Wider/Narrower.'));
      } else {
        message.append(
          doc.createTextNode('Hover over one item of the list or table you want to extract.'),
        );
      }
    } else {
      strong.textContent = `${locked?.members.length ?? 0} items`;
      message.append(
        strong,
        doc.createTextNode(' selected. Click values inside an item to choose columns, then Done.'),
      );
      if (fields.length > 0) {
        const chip = doc.createElement('span');
        chip.className = 'chip';
        chip.textContent = `${fields.length} column${fields.length === 1 ? '' : 's'}`;
        message.append(doc.createTextNode(' '), chip);
      }
    }
    buttons.wider.disabled = phase !== 'item' || level >= candidates.length - 1;
    buttons.narrower.disabled = phase !== 'item' || level <= 0;
    buttons.back.style.display = phase === 'fields' ? '' : 'none';
    buttons.done.disabled = phase !== 'fields';
  }

  function schedule(): void {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      render();
    });
  }

  function isOwn(event: Event): boolean {
    return host !== null && event.composedPath().includes(host);
  }

  function updateHover(x: number, y: number): void {
    const target = doc.elementFromPoint(x, y);
    if (!target || (host && host.contains(target)) || target === host) return;
    if (phase === 'item') {
      const next = groupsFor(target, doc.body);
      const prevItem = currentGroup()?.item;
      candidates = next;
      // Prefer the first level with 3+ members (real lists), keep the user's level otherwise.
      if (!prevItem || !next.some((g) => g.item === prevItem)) {
        const preferred = next.findIndex((g) => g.members.length >= 3);
        level = preferred >= 0 ? preferred : 0;
      }
    } else if (locked) {
      const owner = locked.members.find((m) => m.contains(target));
      hoverField = owner ? target : null;
    }
    schedule();
  }

  function onMove(event: MouseEvent): void {
    if (isOwn(event)) return;
    lastPoint = { x: event.clientX, y: event.clientY };
    updateHover(event.clientX, event.clientY);
  }

  function block(event: Event): void {
    if (isOwn(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  function onClick(event: MouseEvent): void {
    if (isOwn(event)) return;
    block(event);
    if (phase === 'item') {
      const group = currentGroup();
      if (!group) return;
      locked = group;
      phase = 'fields';
      fields = [];
    } else if (locked) {
      const target = event.target instanceof Element ? event.target : null;
      const owner = target ? locked.members.find((m) => m.contains(target)) : null;
      if (!target || !owner) return;
      const path = relativePath(owner, target);
      if (path === '' && target !== owner) return;
      const attrs: FieldAttr[] =
        target.tagName === 'IMG'
          ? ['src']
          : target.closest('a[href]') && owner.contains(target.closest('a[href]'))
            ? ['text', 'href']
            : ['text'];
      const exists = fields.some((f) => f.path === path);
      fields = exists
        ? fields.filter((f) => f.path !== path)
        : [...fields, ...attrs.map((attr) => ({ path, attr }))];
    }
    schedule();
  }

  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      block(event);
      cancel();
    } else if (event.key === 'Enter' && phase === 'fields') {
      block(event);
      finish();
    } else if (event.key === 'ArrowUp' && phase === 'item') {
      block(event);
      level = Math.min(level + 1, candidates.length - 1);
      schedule();
    } else if (event.key === 'ArrowDown' && phase === 'item') {
      block(event);
      level = Math.max(level - 1, 0);
      schedule();
    }
  }

  const onViewport = () => schedule();

  function buildDescriptor(group: Group): DatasetDescriptor | null {
    const container = group.item.parentElement;
    if (!container) return null;
    const { itemSelector, signature } = describeGroup(group.members);
    let columns: ColumnDef[];
    if (fields.length > 0) {
      const names = uniqueNames(
        fields.map((f) => (f.attr === 'href' ? 'Link' : f.attr === 'src' ? 'Image' : 'Field')),
      );
      columns = fields.map((f, i) => ({
        id: `c${i}`,
        name: names[i]!,
        source: { type: 'path', path: f.path, attr: f.attr },
      }));
    } else {
      columns = inferListColumns(group.members);
    }
    if (columns.length === 0) return null;
    const descriptor: DatasetDescriptor = {
      kind: 'custom',
      containerSelector: uniqueSelector(container),
      itemSelector,
      skipLeadingItems: 0,
      itemSignature: signature,
      columns: columns.slice(0, 60),
    };
    return extractRows(container, descriptor, 1).length > 0 ? descriptor : null;
  }

  function finish(): void {
    const group = locked;
    const descriptor = group ? buildDescriptor(group) : null;
    stop();
    if (!descriptor) return;
    void chrome.runtime
      .sendMessage({ type: 'swde:pickerResult', descriptor, page: pageInfo(doc) })
      .catch(() => {});
  }

  function cancel(): void {
    stop();
    void chrome.runtime.sendMessage({ type: 'swde:pickerCancelled' }).catch(() => {});
  }

  function start(): void {
    if (active()) return;
    host = doc.createElement('swde-picker');
    const shadow = host.attachShadow({ mode: 'closed' });
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
      shadow.adoptedStyleSheets = [sheet];
    } catch {
      const style = doc.createElement('style');
      style.textContent = CSS;
      shadow.append(style);
    }
    layer = doc.createElement('div');
    layer.className = 'layer';
    toolbar = doc.createElement('div');
    toolbar.className = 'toolbar';
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Smart Web Data Extractor selection');
    message = doc.createElement('div');
    message.className = 'msg';
    const mk = (label: string, title: string, onPress: () => void, cls = '') => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.title = title;
      if (cls) b.className = cls;
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onPress();
      });
      return b;
    };
    buttons = {
      narrower: mk('Narrower', 'Select a smaller repeating element (↓)', () => {
        level = Math.max(level - 1, 0);
        schedule();
      }),
      wider: mk('Wider', 'Select a larger repeating element (↑)', () => {
        level = Math.min(level + 1, candidates.length - 1);
        schedule();
      }),
      back: mk('Back', 'Choose a different list', () => {
        phase = 'item';
        locked = null;
        fields = [];
        hoverField = null;
        schedule();
      }),
      done: mk('Done', 'Extract the selection (Enter)', finish, 'primary'),
    };
    const exit = mk('Exit', 'Exit selection mode (Esc)', cancel);
    toolbar.append(message, buttons.narrower, buttons.wider, buttons.back, buttons.done, exit);
    shadow.append(layer, toolbar);
    doc.documentElement.append(host);

    phase = 'item';
    candidates = [];
    level = 0;
    locked = null;
    fields = [];
    hoverField = null;
    boxes.length = 0;
    const opts = { capture: true, passive: false } as const;
    doc.addEventListener('mousemove', onMove, opts);
    doc.addEventListener('click', onClick, opts);
    doc.addEventListener('mousedown', block, opts);
    doc.addEventListener('mouseup', block, opts);
    doc.addEventListener('keydown', onKey, opts);
    window.addEventListener('scroll', onViewport, true);
    window.addEventListener('resize', onViewport);
    render();
    if (lastPoint) updateHover(lastPoint.x, lastPoint.y);
  }

  function stop(): void {
    if (!host) return;
    const opts = { capture: true } as const;
    doc.removeEventListener('mousemove', onMove, opts);
    doc.removeEventListener('click', onClick, opts);
    doc.removeEventListener('mousedown', block, opts);
    doc.removeEventListener('mouseup', block, opts);
    doc.removeEventListener('keydown', onKey, opts);
    window.removeEventListener('scroll', onViewport, true);
    window.removeEventListener('resize', onViewport);
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    host.remove();
    host = null;
    layer = null;
    toolbar = null;
    message = null;
    buttons = null;
    boxes.length = 0;
  }

  return { start, stop };
}
