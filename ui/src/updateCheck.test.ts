import { describe, expect, it } from 'vitest';
import { newer } from './updateCheck';

describe('newer', () => {
  it('compares versions part by part', () => {
    expect(newer('v1.2.0', '1.1.9')).toBe(true);
    expect(newer('v1.10.0', 'v1.9.0')).toBe(true);
    expect(newer('v1.2.0', '1.2.0')).toBe(false);
    expect(newer('v1.2.0', '1.3.0')).toBe(false);
    expect(newer('v0.1.0', '0.0.0-dev')).toBe(true);
  });
});
