import type { StatevectorEntry } from '../../api/types';

/**
 * Compute the Bloch-vector coordinates (x, y, z) for a single qubit by tracing
 * out all other qubits from the sparse statevector.
 *
 * Convention:
 *   |0⟩ -> +z
 *   |1⟩ -> -z
 *   |+⟩ -> +x
 *   |i+⟩ -> +y
 */
export const calculateBlochVector = (statevector: StatevectorEntry[], qubitIndex: number) => {
  let rho00 = 0;
  let rho11 = 0;
  let rho01_re = 0;
  let rho01_im = 0;

  const coeffsByReducedBasis = new Map<string, [{ re: number; im: number } | null, { re: number; im: number } | null]>();

  for (const entry of statevector) {
    const basis = entry.basis;
    if (qubitIndex >= basis.length) continue;

    const bit = parseInt(basis[qubitIndex], 10);
    const reducedBasis = basis.slice(0, qubitIndex) + basis.slice(qubitIndex + 1);

    let pair = coeffsByReducedBasis.get(reducedBasis);
    if (!pair) {
      pair = [null, null];
      coeffsByReducedBasis.set(reducedBasis, pair);
    }

    if (bit === 0) {
      pair[0] = { re: entry.re, im: entry.im };
    } else {
      pair[1] = { re: entry.re, im: entry.im };
    }
  }

  for (const pair of coeffsByReducedBasis.values()) {
    const c0 = pair[0];
    const c1 = pair[1];

    if (c0) {
      rho00 += c0.re * c0.re + c0.im * c0.im;
    }
    if (c1) {
      rho11 += c1.re * c1.re + c1.im * c1.im;
    }
    if (c0 && c1) {
      // rho01 = c0 * conj(c1)
      // Re(rho01) = c0.re * c1.re + c0.im * c1.im
      // Im(rho01) = c0.im * c1.re - c0.re * c1.im
      rho01_re += c0.re * c1.re + c0.im * c1.im;
      rho01_im += c0.im * c1.re - c0.re * c1.im;
    }
  }

  const x = 2 * rho01_re;
  const y = -2 * rho01_im;
  const z = rho00 - rho11;

  return { x, y, z };
};
