import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Line, Sphere, Html } from '@react-three/drei';
import type { StatevectorEntry, Snapshot } from '../../api/types';
import { calculateBlochVector } from './bloch-vector';

interface BlochSphereProps {
  statevector: StatevectorEntry[];
  qubitIndex?: number;
  snapshotHistory?: Snapshot[];
}

const SPHERE_RADIUS = 1.5;
const SPHERE_OPACITY = 0.04;

const formatCoord = (n: number) => n.toFixed(3);

/** Map a raw Bloch vector to Three.js coordinates and scale to the sphere surface. */
const toThreeTip = ([x, y, z]: [number, number, number]): [number, number, number] => [
  SPHERE_RADIUS * x,
  SPHERE_RADIUS * z,
  -SPHERE_RADIUS * y,
];

const segmentColor = (index: number, total: number): string => {
  if (total <= 1) return '#fbbf24';
  const hue = Math.round((index / (total - 1)) * 300); // 0 (red) -> 300 (magenta)
  return `hsl(${hue}, 80%, 60%)`;
};

const CoordinateLabel: React.FC<{ vector: [number, number, number] }> = ({ vector }) => {
  const [x, y, z] = vector;
  return (
    <div
      style={{
        color: '#fbbf24',
        fontSize: '11px',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        whiteSpace: 'nowrap',
        textShadow: '0 1px 2px rgba(0,0,0,0.8)',
        pointerEvents: 'none',
        transform: 'translate(8px, -50%)',
      }}
    >
      ({formatCoord(x)}, {formatCoord(y)}, {formatCoord(z)})
    </div>
  );
};

const BlochSphereScene: React.FC<{
  vector: [number, number, number];
  historyVectors: [number, number, number][];
}> = ({ vector, historyVectors }) => {
  const tip = toThreeTip(vector);

  // Build the full trail including the current vector.
  const trail = useMemo(() => {
    const points = historyVectors.map(toThreeTip);
    points.push(tip);
    return points;
  }, [historyVectors, tip]);

  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} />

      {/* The Sphere */}
      <Sphere args={[1, 32, 32]} scale={SPHERE_RADIUS}>
        <meshStandardMaterial color="#444" transparent opacity={SPHERE_OPACITY} wireframe />
      </Sphere>

      {/* Axes */}
      <Line points={[[-2, 0, 0], [2, 0, 0]]} color="red" lineWidth={1} />   {/* X axis */}
      <Line points={[[0, -2, 0], [0, 2, 0]]} color="green" lineWidth={1} /> {/* Y (Bloch z) axis */}
      <Line points={[[0, 0, -2], [0, 0, 2]]} color="blue" lineWidth={1} />  {/* Z (Bloch y) axis */}

      {/* Trail through prior steps — one colored segment per step transition */}
      {trail.length > 1 &&
        trail.slice(0, -1).map((start, i) => {
          const end = trail[i + 1];
          return (
            <Line
              key={i}
              points={[start, end]}
              color={segmentColor(i, trail.length - 1)}
              lineWidth={4}
            />
          );
        })}

      {/* State Vector */}
      <Line points={[[0, 0, 0], tip]} color="yellow" lineWidth={3} />

      {/* Small sphere at tip of vector */}
      <Sphere args={[0.05, 16, 16]} position={tip}>
        <meshStandardMaterial color="yellow" />
      </Sphere>

      {/* Coordinate label at the tip */}
      <Html position={tip}>
        <CoordinateLabel vector={vector} />
      </Html>

      <OrbitControls enableZoom={false} />
    </>
  );
};

export const BlochSphere: React.FC<BlochSphereProps> = ({
  statevector,
  qubitIndex = 0,
  snapshotHistory = [],
}) => {
  const current = useMemo(
    () => calculateBlochVector(statevector, qubitIndex),
    [statevector, qubitIndex]
  );

  const currentVector: [number, number, number] = [current.x, current.y, current.z];

  const historyVectors = useMemo(() => {
    return snapshotHistory.map(snap => {
      const v = calculateBlochVector(snap.statevector, qubitIndex);
      return [v.x, v.y, v.z] as [number, number, number];
    });
  }, [snapshotHistory, qubitIndex]);

  return (
    <div style={{ width: '100%', height: '100%', minHeight: '300px', background: 'var(--bg-deep)', borderRadius: '8px', overflow: 'hidden', position: 'relative' }}>
      <Canvas camera={{ position: [3, 3, 3], fov: 45 }}>
        <BlochSphereScene vector={currentVector} historyVectors={historyVectors} />
      </Canvas>
      <div style={{ position: 'absolute', bottom: 10, left: 10, color: 'var(--muted)', fontSize: '12px', pointerEvents: 'none' }}>
        Qubit {qubitIndex} Bloch Sphere
      </div>
    </div>
  );
};
