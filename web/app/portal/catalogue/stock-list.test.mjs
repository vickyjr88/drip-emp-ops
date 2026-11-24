import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStockList } from './stock-list.ts';

const sizes = ['EUR 40', 'EUR 41', 'EUR 42', 'EUR 43'];

test('colon, equals, x and space all separate a size from its count', () => {
  const r = parseStockList('40:3, 41=5, 42x2\n43 4', sizes);
  assert.deepEqual(r.quantities, { 'EUR 40': 3, 'EUR 41': 5, 'EUR 42': 2, 'EUR 43': 4 });
  assert.deepEqual(r.unknown, []);
});

test('the full option name works too, and repeats add up', () => {
  const r = parseStockList('EUR 42: 2, 42: 1', sizes);
  assert.deepEqual(r.quantities, { 'EUR 42': 3 });
});

test('sizes that are not being created, and pieces with no count, are reported not dropped', () => {
  const r = parseStockList('44:2, 41, 40:1', sizes);
  assert.deepEqual(r.quantities, { 'EUR 40': 1 });
  assert.deepEqual(r.unknown, ['44:2', '41']);
});

test('a part of a size does not match: "4" is not EUR 40 or EUR 43', () => {
  const r = parseStockList('4:9', sizes);
  assert.deepEqual(r.quantities, {});
  assert.deepEqual(r.unknown, ['4:9']);
});

test('empty input is empty', () => {
  assert.deepEqual(parseStockList('  \n ', sizes), { quantities: {}, unknown: [] });
});
