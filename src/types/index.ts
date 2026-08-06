export type GateType =
  | 'H' | 'X' | 'Y' | 'Z' | 'S' | 'T' | 'Sdg' | 'Tdg' | 'SX' | 'I'
  | 'Rx' | 'Ry' | 'Rz' | 'P'
  | 'C' | 'CX' | 'CZ' | 'CCX' | 'SWAP'
  | 'M';

export type GateCategory = 'single' | 'parameterized' | 'multi' | 'measure';

export type CanvasGate = {
  id: number;
  type: GateType;
  x: number; // absolute canvas coords (derived from segment via the layout)
  y: number;
  width: number;
  height: number;
  color: string;
  angle?: number; // radians — parameterized gates only
  segment?: number; // instruction-step cell the gate occupies (0-based)
};

export type GateLine = {
  id: number;
  gateId: number;
  barY: number;
  role: 'control' | 'target';
  originIndex: number; // which origin dot on the gate this line came from
  originX: number;     // local x offset of the origin within the gate
};

export type DragPreview = {
  gateType: GateType;
  x: number;
  y: number;
  visible: boolean;
};

export type DraggingGateLine = {
  gateId: number;
  originIndex: number;
  originX: number; // local x offset within the gate
  startX: number;  // absolute
  startY: number;
  currentX: number; // snapped: inline with origin, y snapped to bit lines
  currentY: number;
  rawX: number;     // raw cursor position (canvas coords)
  rawY: number;
};

export type GateConfig = {
  name: string;
  fullName: string;
  description: string;
  color: string;
  symbol: string;
  category: GateCategory;
  defaultAngle?: number; // radians, applied on drop for parameterized gates
  targetCapacity: number; // max 'target' lines the gate accepts
  controlCapacity: number; // max 'control' lines the gate accepts
};
