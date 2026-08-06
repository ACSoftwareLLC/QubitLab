import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchStats } from './stats';

afterEach(() => {
  vi.unstubAllGlobals();
});

const stubFetch = (ok: boolean, payload: unknown, status = ok ? 200 : 400) => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(payload),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

describe('stats api', () => {
  it('fetches stats with credentials included', async () => {
    const fetchMock = stubFetch(true, {
      users: 42,
      circuits: 150,
      shared: 12,
      sharedThisWeek: 3,
    });

    const result = await fetchStats();

    expect(result).toEqual({
      users: 42,
      circuits: 150,
      shared: 12,
      sharedThisWeek: 3,
    });
    expect(fetchMock).toHaveBeenCalledWith('/auth/stats', {
      credentials: 'include',
    });
  });

  it('throws the server error message on failure', async () => {
    stubFetch(false, { error: 'Server error' }, 500);

    await expect(fetchStats()).rejects.toThrow('Server error');
  });
});
