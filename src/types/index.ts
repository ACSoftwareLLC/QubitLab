export type GateType = 'H' | 'X' | 'Y' | 'Z' | 'S' | 'T' | 'C';

export type CanvasGate = {
  id: number;
  type: GateType;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
};

export type AppNode = {
  id: number;
  x: number;
  y: number;
  gates: CanvasGate[];
};

export type GateLine = {
  id: number;
  nodeId: number;
  gateId: number;
  barY: number;
};

export type NodeLine = {
  id: number;
  nodeId: number;
  bitY: number;
};

export type DragPreview = {
  gateType: GateType;
  x: number;
  y: number;
  visible: boolean;
};

export type DraggingGateLine = {
  nodeId: number;
  gateId: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

export type GateConfig = {
  name: string;
  color: string;
  symbol: string;
};
