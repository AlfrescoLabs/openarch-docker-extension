import { describe, expect, it } from 'vitest';
import { hitDocument, titleOf } from './semantic';

describe('titleOf', () => {
  it('takes the text before the first sentence end', () => {
    expect(titleOf('Salary bands 2026. Salary ranges per job level for 2026. HR uses the bands.')).toBe('Salary bands 2026');
  });

  it('keeps a text without a sentence end, and accepts none', () => {
    expect(titleOf('Office Wi-Fi guide')).toBe('Office Wi-Fi guide');
    expect(titleOf(undefined)).toBe('');
  });
});

describe('hitDocument', () => {
  it('keeps the id, so the document can be fetched by id', () => {
    expect(hitDocument({ docId: 'd1', score: 0.6, text: 'Merger proposal. Confidential.' })).toEqual({
      sys_id: 'd1',
      sys_title: 'Merger proposal',
      sys_path: '',
      sys_primaryType: 'SysFile',
    });
  });
});
