import { useEffect, useRef, useState } from 'react';

interface AngleDialProps {
  angle: number; // radians
  onChange: (angle: number) => void;
}

const SIZE = 120;
const CENTER = SIZE / 2;
const RADIUS = 44;

const toDegrees = (rad: number) => (rad * 180) / Math.PI;
const toRadians = (deg: number) => (deg * Math.PI) / 180;
const norm360 = (deg: number) => ((deg % 360) + 360) % 360;

/** Rotary dial for setting a gate's rotation angle: drag the radial line
 *  around the circle, or type degrees into the text box above. */
export function AngleDial({ angle, onChange }: AngleDialProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);
  const [text, setText] = useState(String(Math.round(toDegrees(angle))));

  // Keep the text box in sync when the angle changes from elsewhere.
  useEffect(() => {
    setText(String(Math.round(norm360(toDegrees(angle)))));
  }, [angle]);

  const setFromPointer = (e: React.PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = e.clientX - (rect.left + (rect.width * CENTER) / SIZE);
    const dy = e.clientY - (rect.top + (rect.height * CENTER) / SIZE);
    // Math convention: 0° = east, counterclockwise positive (screen y is flipped).
    const deg = norm360((Math.atan2(-dy, dx) * 180) / Math.PI);
    onChange(toRadians(Math.round(deg)));
  };

  const handleTextChange = (value: string) => {
    setText(value);
    const deg = Number.parseFloat(value);
    if (Number.isFinite(deg)) {
      onChange(toRadians(norm360(deg)));
    }
  };

  const degrees = norm360(toDegrees(angle));
  const rad = toRadians(degrees);
  const tipX = CENTER + RADIUS * Math.cos(rad);
  const tipY = CENTER - RADIUS * Math.sin(rad);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="number"
          step={1}
          min={0}
          max={359}
          value={text}
          onChange={e => handleTextChange(e.target.value)}
          style={{ width: 64, background: '#333', color: '#fff', border: '1px solid #555', borderRadius: 4, padding: '4px 6px' }}
        />
        <span style={{ color: '#aaa' }}>degrees</span>
      </div>

      <svg
        ref={svgRef}
        width={SIZE}
        height={SIZE}
        style={{ cursor: 'grab', touchAction: 'none', userSelect: 'none' }}
        onPointerDown={e => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          setFromPointer(e);
        }}
        onPointerMove={e => dragging && setFromPointer(e)}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
      >
        {/* dial face */}
        <circle cx={CENTER} cy={CENTER} r={RADIUS} fill='#2a2a2a' stroke='#555' strokeWidth={2} />
        {/* quarter ticks */}
        {[0, 90, 180, 270].map(d => {
          const t = toRadians(d);
          return (
            <line
              key={d}
              x1={CENTER + (RADIUS - 6) * Math.cos(t)}
              y1={CENTER - (RADIUS - 6) * Math.sin(t)}
              x2={CENTER + RADIUS * Math.cos(t)}
              y2={CENTER - RADIUS * Math.sin(t)}
              stroke='#777'
              strokeWidth={2}
            />
          );
        })}
        {/* angle line */}
        <line x1={CENTER} y1={CENTER} x2={tipX} y2={tipY} stroke='#4DB6AC' strokeWidth={3} strokeLinecap='round' />
        {/* handle */}
        <circle cx={tipX} cy={tipY} r={6} fill='#4DB6AC' stroke='#fff' strokeWidth={2} />
        {/* center dot */}
        <circle cx={CENTER} cy={CENTER} r={3} fill='#888' />
        {/* label */}
        <text x={CENTER} y={SIZE - 4} textAnchor='middle' fill='#aaa' fontSize={11}>
          {Math.round(degrees)}°
        </text>
      </svg>
    </div>
  );
}
