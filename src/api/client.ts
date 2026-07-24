import type { Circuit, HealthResponse, Snapshot, ValidationResult } from './types';

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    // 422s carry the ValidationResult shape; surface it uniformly.
    if (res.status === 422 && data && Array.isArray(data.errors)) {
      return data as T;
    }
    throw new Error(`POST ${url} failed: ${res.status}`);
  }
  return data as T;
}

export const apiHealth = (): Promise<HealthResponse> =>
  fetch('/api/health').then(r => {
    if (!r.ok) throw new Error(`health check failed: ${r.status}`);
    return r.json();
  });

export const validateCircuit = (circuit: Circuit): Promise<ValidationResult> =>
  postJson('/api/validate', circuit);

export const simulateCircuit = (
  circuit: Circuit,
  throughSegment: number | null = null,
): Promise<Snapshot> =>
  postJson('/api/simulate', { circuit, throughSegment });
