import { Position } from '../types/grid';
import { TimePosition } from '../types/path';

export function manhattanDistance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function euclideanDistance(a: Position, b: Position): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export function posEquals(a: Position | null | undefined, b: Position | null | undefined): boolean {
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y;
}

export function posKey(pos: Position): string {
  return `${pos.x},${pos.y}`;
}

export function parsePosKey(key: string): Position {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

export function timePosKey(pos: TimePosition): string {
  return `${pos.x},${pos.y}@${pos.t}`;
}

export function edgeKey(from: Position, to: Position, t: number): string {
  return `${from.x},${from.y}->${to.x},${to.y}@${t}`;
}

export const DIRECTIONS_4: Array<{ dx: number; dy: number; name: string }> = [
  { dx: 0, dy: -1, name: 'NORTH' },
  { dx: 1, dy: 0, name: 'EAST' },
  { dx: 0, dy: 1, name: 'SOUTH' },
  { dx: -1, dy: 0, name: 'WEST' },
];
