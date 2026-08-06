import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  listCircuits,
  createCircuit,
  deleteCircuit,
  shareCircuit,
  listMarketplace,
  getMarketplaceCircuit,
} from './circuits';
import type { Circuit } from './types';

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

const sampleCircuit: Circuit = {
  numBits: 2,
  ops: [{ id: 1, type: 'H', segment: 0, targets: [0], controls: [], angle: null }],
};

describe('circuits api', () => {
  it('lists circuits with credentials included', async () => {
    const fetchMock = stubFetch(true, { circuits: [] });
    const result = await listCircuits();

    expect(result).toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(
      '/auth/circuits',
      expect.objectContaining({ method: 'GET', credentials: 'include' })
    );
  });

  it('posts name, circuit, and thumbnail when creating', async () => {
    const saved = { id: 'abc', name: 'Bell', circuit: sampleCircuit };
    const fetchMock = stubFetch(true, { circuit: saved }, 201);

    const result = await createCircuit({
      name: 'Bell',
      circuit: sampleCircuit,
      thumbnail: 'data:image/png;base64,iVBORw0KGgo=',
    });

    expect(result).toEqual(saved);
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe('/auth/circuits');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body)).toEqual({
      name: 'Bell',
      circuit: sampleCircuit,
      thumbnail: 'data:image/png;base64,iVBORw0KGgo=',
    });
  });

  it('throws the server error message on failure', async () => {
    stubFetch(false, { error: 'Validation error' }, 400);
    await expect(createCircuit({ name: '', circuit: sampleCircuit })).rejects.toThrow(
      'Validation error'
    );
  });

  it('deletes by id', async () => {
    const fetchMock = stubFetch(true, { success: true });
    await deleteCircuit('abc');
    expect(fetchMock).toHaveBeenCalledWith(
      '/auth/circuits/abc',
      expect.objectContaining({ method: 'DELETE', credentials: 'include' })
    );
  });

  it('shares a circuit', async () => {
    const saved = { id: 'abc', name: 'Bell', circuit: sampleCircuit, shared: true };
    const fetchMock = stubFetch(true, { circuit: saved });
    const result = await shareCircuit('abc', true);

    expect(result).toEqual(saved);
    expect(fetchMock).toHaveBeenCalledWith(
      '/auth/circuits/abc',
      expect.objectContaining({ method: 'PATCH', credentials: 'include' })
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ shared: true });
  });

  it('lists marketplace circuits', async () => {
    const fetchMock = stubFetch(true, { circuits: [] });
    const result = await listMarketplace();

    expect(result).toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(
      '/auth/marketplace',
      expect.objectContaining({ method: 'GET', credentials: 'include' })
    );
  });

  it('fetches a marketplace circuit by id', async () => {
    const saved = { id: 'abc', name: 'Bell', circuit: sampleCircuit, shared: true };
    const fetchMock = stubFetch(true, { circuit: saved });
    const result = await getMarketplaceCircuit('abc');

    expect(result).toEqual(saved);
    expect(fetchMock).toHaveBeenCalledWith(
      '/auth/marketplace/abc',
      expect.objectContaining({ method: 'GET', credentials: 'include' })
    );
  });
});
