import { describe, expect, it } from 'vitest';
import { readers } from './acl';

describe('readers', () => {
  it('skips an entry whose end date has passed', () => {
    // sys_effectiveAcl of /Demo/Finance/contractor-rates-2027, as OpenArch 1.0.90 returns it.
    const acl = [
      { permission: 'Read', granted: true, user: { username: 'alice' }, status: 'ARCHIVED' },
      { permission: 'Read', granted: true, group: { id: 'g1', name: 'demo-finance' }, status: 'EFFECTIVE' },
    ];
    expect(readers(acl)).toEqual(['demo-finance']);
  });

  it('skips an entry that has not started, a denied entry and other permissions', () => {
    const acl = [
      { permission: 'Read', granted: true, user: { username: 'bob' }, status: 'PENDING' },
      { permission: 'Everything', granted: false, user: { username: '__Everyone__' } },
      { permission: 'Write', granted: true, user: { username: 'carol' } },
      { permission: 'Read', granted: true, user: { username: 'alice' } },
    ];
    expect(readers(acl)).toEqual(['alice']);
  });

  it('accepts no ACL', () => {
    expect(readers(undefined)).toEqual([]);
  });
});
