import { Position } from './grid';

export interface TimePosition extends Position {
  t: number;
}

export interface PathNode {
  x: number;
  y: number;
  t?: number;
  g: number;
  h: number;
  f: number;
  parent: PathNode | null;
}

export interface PlanningResult {
  robotId: string;
  success: boolean;
  path: Position[];
  timeIndexedPath: TimePosition[];
  exploredNodes: Position[];
  visitedNodesCount: number;
  exploredNodesCount: number;
  executionTimeMs: number;
  cost: number;
  failureReason?: string;
  timestamp: number;
}

export interface ReservationKey {
  x: number;
  y: number;
  t: number;
}

export interface EdgeKey {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  t: number; // time step of transition
}

export interface GoalReservation {
  robotId: string;
  position: Position;
  fromTime: number;
}
