import { describe, expect, it } from 'vitest';
import { normalizePostgresRow } from './postgres-store';

describe('normalizePostgresRow', () => {
  it('narrows every persisted byte-count BIGINT returned as a string', () => {
    expect(
      normalizePostgresRow({
        bytes: '4316447',
        max_bytes: '524288000',
        expected_bytes: '4316447',
        seq: '9',
        title: 'unchanged',
      }),
    ).toEqual({
      bytes: 4316447,
      max_bytes: 524288000,
      expected_bytes: 4316447,
      seq: 9,
      title: 'unchanged',
    });
  });
});
