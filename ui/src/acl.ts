import type { Ace } from './types';

// readers returns the users and groups that an effective ACL lets read the
// document. OpenArch already applies inheritance blocks in sys_effectiveAcl,
// but it keeps entries that give no access: a begin date not reached
// (PENDING) or an end date that has passed (ARCHIVED).
export function readers(acl: Ace[] | undefined): string[] {
  return (acl ?? [])
    .filter((a) => a.granted && a.permission === 'Read' && (a.status ?? 'EFFECTIVE') === 'EFFECTIVE')
    .map((a) => a.group?.name ?? a.user?.username ?? '')
    .filter(Boolean);
}
