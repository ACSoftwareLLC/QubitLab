import type { Circuit } from './types';

export type SavedCircuit = {
  id: string;
  name: string;
  username: string;
  circuit: Circuit;
  createdAt: string;
  updatedAt: string;
  thumbnailUrl: string | null;
};

async function request<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export async function listCircuits(): Promise<SavedCircuit[]> {
  const data = await request<{ circuits: SavedCircuit[] }>('GET', '/auth/circuits');
  return data.circuits;
}

export async function getCircuit(id: string): Promise<SavedCircuit> {
  const data = await request<{ circuit: SavedCircuit }>('GET', `/auth/circuits/${id}`);
  return data.circuit;
}

export async function createCircuit(input: {
  name: string;
  circuit: Circuit;
  thumbnail?: string;
}): Promise<SavedCircuit> {
  const data = await request<{ circuit: SavedCircuit }>('POST', '/auth/circuits', input);
  return data.circuit;
}

export async function updateCircuit(
  id: string,
  patch: { name?: string; circuit?: Circuit; thumbnail?: string }
): Promise<SavedCircuit> {
  const data = await request<{ circuit: SavedCircuit }>('PATCH', `/auth/circuits/${id}`, patch);
  return data.circuit;
}

export async function deleteCircuit(id: string): Promise<void> {
  await request('DELETE', `/auth/circuits/${id}`);
}
