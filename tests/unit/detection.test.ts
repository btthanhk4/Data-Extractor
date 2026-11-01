import { describe, expect, it } from 'vitest';
import { detectDatasets } from '@swde/extraction-core';
import { htmlDocument, loadFixture } from '../helpers';

function names(ds: { descriptor: { columns: { name: string }[] } }) {
  return ds.descriptor.columns.map((c) => c.name);
}

describe('table detection', () => {
  const datasets = detectDatasets(loadFixture('table.html'));

  it('finds data tables and ignores layout tables and navigation', () => {
    expect(datasets.map((d) => d.label)).toEqual(['Largest cities', 'Opening hours']);
    expect(datasets.every((d) => d.descriptor.kind === 'table')).toBe(true);
  });

  it('uses header cells as column names and adds link columns', () => {
    const cities = datasets[0]!;
    expect(names(cities)).toEqual([
      'Rank',
      'City',
      'City link',
      'Country',
      'Population',
      'Founded',
    ]);
    expect(cities.rowCount).toBe(5);
    expect(cities.preview[0]).toEqual([
      '1',
      'Tokyo',
      'https://fixtures.test/city/tokyo',
      'Japan',
      '37,400,068',
      '1457-01-01',
    ]);
  });

  it('excludes tfoot totals and keeps unicode text intact', () => {
    const cities = datasets[0]!;
    expect(cities.preview.some((r) => r[0] === 'Total')).toBe(false);
    expect(cities.preview[4]?.[1]).toBe('Thành phố Hồ Chí Minh');
  });

  it('expands colspan and rowspan into a rectangular grid', () => {
    const hours = datasets[1]!;
    expect(hours.preview).toEqual([
      ['Monday', 'Closed', 'Closed'],
      ['Tuesday', '09:00', '17:00'],
      ['Weekend', '10:00', '14:00'],
      ['Weekend', '11:00', '15:00'],
    ]);
  });

  it('detects ARIA grids built from divs', () => {
    const doc = htmlDocument(`
      <div role="table" aria-label="Scores">
        <div role="row"><span role="columnheader">Team</span><span role="columnheader">Points</span></div>
        <div role="row"><span role="cell">Red</span><span role="cell">10</span></div>
        <div role="row"><span role="cell">Blue</span><span role="cell">7</span></div>
        <div role="row"><span role="cell">Green</span><span role="cell">3</span></div>
      </div>`);
    const [scores] = detectDatasets(doc);
    expect(scores?.label).toBe('Scores');
    expect(names(scores!)).toEqual(['Team', 'Points']);
    expect(scores?.preview).toEqual([
      ['Red', '10'],
      ['Blue', '7'],
      ['Green', '3'],
    ]);
  });
});

describe('repeating list detection', () => {
  it('detects product cards with inferred, named columns', () => {
    const [products, ...rest] = detectDatasets(loadFixture('products.html'));
    expect(rest).toHaveLength(0); // header nav and footer links are not reported
    expect(products?.descriptor.kind).toBe('list');
    expect(products?.label).toBe('Headphones');
    expect(products?.rowCount).toBe(6); // the sponsored block is not a product
    expect(names(products!)).toEqual(['Link', 'Image', 'Title', 'Price', 'Rating', 'Tags']);
    expect(products?.preview[0]).toEqual([
      'https://fixtures.test/p/aurora-x1',
      'https://fixtures.test/img/aurora.jpg',
      'Aurora X1 Wireless',
      '$129.99',
      '4.5 stars',
      'Bluetooth, ANC, USB-C',
    ]);
  });

  it('handles missing values and lazy-loaded images', () => {
    const [products] = detectDatasets(loadFixture('products.html'));
    const cobalt = products!.preview[2]!;
    expect(cobalt[2]).toBe('Cobalt Pro "Studio"');
    expect(cobalt[1]).toBe('https://fixtures.test/img/cobalt.jpg'); // from data-src
    expect(cobalt[4]).toBe(''); // no rating element
  });

  it('detects deeply nested directory entries and search results separately', () => {
    const datasets = detectDatasets(loadFixture('nested.html'));
    expect(datasets.map((d) => d.label)).toEqual(['Members', 'Search results']);
    const [members, results] = datasets;
    expect(members?.rowCount).toBe(4);
    expect(names(members!)).toEqual(['Name', 'Text', 'Email', 'Location']);
    expect(members?.preview[2]).toEqual(['Grace Hopper', 'Rear admiral', '', 'Arlington, USA']);
    expect(names(results!)).toEqual(['Title', 'Link', 'Description', 'Source']);
    expect(results?.preview[1]?.[2]).toBe('Another snippet with bold text.');
  });

  it('returns nothing for pages without data', () => {
    expect(detectDatasets(loadFixture('empty.html'))).toEqual([]);
  });

  it('never returns script contents or non-http links from malformed markup', () => {
    const datasets = detectDatasets(loadFixture('malformed.html'));
    const all = JSON.stringify(datasets);
    expect(all).not.toContain('__pwned');
    expect(all).not.toContain('javascript:');
    expect(all).not.toContain('data:text');
    const list = datasets.find((d) => d.descriptor.kind === 'list')!;
    expect(list.rowCount).toBe(5);
    expect(list.preview.map((r) => r[0])).toContain('Epsilon <b>not html</b>');
  });

  it('caps the number of datasets and stays fast on large documents', () => {
    const blocks = Array.from(
      { length: 40 },
      (_, b) =>
        `<section><h2>Group ${b}</h2><ul>${Array.from({ length: 30 }, (_, i) => `<li><a href="/x/${b}/${i}">Item ${i}</a> <span>${i * 3} pts</span></li>`).join('')}</ul></section>`,
    ).join('');
    const doc = htmlDocument(`<main>${blocks}</main>`);
    const started = performance.now();
    const datasets = detectDatasets(doc);
    expect(performance.now() - started).toBeLessThan(5_000);
    expect(datasets.length).toBeGreaterThan(0);
    expect(datasets.length).toBeLessThanOrEqual(12);
  });
});
