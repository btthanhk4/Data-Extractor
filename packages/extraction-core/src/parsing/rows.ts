import type { DatasetDescriptor } from '@swde/shared';
import { readField, readMultiField, resolvePath, safeQueryAll } from './dom';
import { buildTableGrid } from './table';

/** Reads up to `limit` rows from a resolved container using the descriptor's columns. */
export function extractRows(
  container: Element,
  descriptor: DatasetDescriptor,
  limit: number,
): string[][] {
  const { columns } = descriptor;
  const skip = descriptor.skipLeadingItems ?? 0;
  if (descriptor.kind === 'table') {
    const grid = buildTableGrid(container);
    return grid.rows
      .slice(skip, skip + limit)
      .map((cells) =>
        columns.map((col) =>
          col.source.type === 'cell'
            ? readField(cells[col.source.index] ?? null, col.source.attr)
            : '',
        ),
      );
  }
  const items = safeQueryAll(container, descriptor.itemSelector).slice(skip, skip + limit);
  return items.map((item) =>
    columns.map((col) => {
      if (col.source.type === 'path') {
        return col.source.multi
          ? readMultiField(item, col.source.path, col.source.attr)
          : readField(resolvePath(item, col.source.path), col.source.attr);
      }
      return readField(item.children[col.source.index] ?? null, col.source.attr);
    }),
  );
}

/** Number of items the descriptor matches inside the container. */
export function countItems(container: Element, descriptor: DatasetDescriptor): number {
  if (descriptor.kind === 'table') return buildTableGrid(container).rows.length;
  return safeQueryAll(container, descriptor.itemSelector).length;
}
