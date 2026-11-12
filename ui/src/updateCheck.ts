// Self-installed extensions get no update notice from Docker Desktop, so the
// extension checks its latest GitHub release itself, at most once a day.

export const RELEASES_URL = 'https://api.github.com/repos/AlfrescoLabs/openarch-docker-extension/releases/latest';
export const IMAGE = 'alfrescolabs/openarch-docker-extension';
const KEY = 'openarch-update-check';
const DAY = 24 * 60 * 60 * 1000;

// newer reports whether version a (such as "v1.2.0") is newer than b. Parts that are not numbers count as 0.
export function newer(a: string, b: string): boolean {
  const parts = (v: string) => v.replace(/^v/, '').split(/[.-]/).slice(0, 3).map((x) => Number.parseInt(x, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) {
      return (x[i] ?? 0) > (y[i] ?? 0);
    }
  }
  return false;
}

interface Cache {
  checked: number;
  latest: string;
}

// latestNewerThan returns the latest release tag when it is newer than current, else null.
// Errors and rate limits give null.
export async function latestNewerThan(current: string, now = Date.now(), store: Storage = localStorage): Promise<string | null> {
  let cache: Cache | null = null;
  try {
    cache = JSON.parse(store.getItem(KEY) ?? 'null');
  } catch {
    cache = null;
  }
  if (!cache || now - cache.checked > DAY) {
    try {
      const res = await fetch(RELEASES_URL, { headers: { Accept: 'application/vnd.github+json' } });
      if (!res.ok) {
        return null;
      }
      const tag = ((await res.json()) as { tag_name?: string }).tag_name ?? '';
      cache = { checked: now, latest: tag };
      store.setItem(KEY, JSON.stringify(cache));
    } catch {
      return null;
    }
  }
  return cache.latest && newer(cache.latest, current) ? cache.latest : null;
}
