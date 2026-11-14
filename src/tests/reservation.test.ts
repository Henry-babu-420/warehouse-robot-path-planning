import { describe, it, expect } from 'vitest';
import { ReservationTable } from '../algorithms/reservationTable';
import { TimePosition } from '../types/path';

describe('Reservation Table', () => {
  it('reserves vertices and detects vertex collisions', () => {
    const table = new ReservationTable();
    const path: TimePosition[] = [
      { x: 1, y: 1, t: 0 },
      { x: 2, y: 1, t: 1 },
      { x: 3, y: 1, t: 2 },
    ];

    table.reservePath('R1', path, false);

    // Same robot is allowed
    expect(table.isVertexReserved(2, 1, 1, 'R1')).toBe(false);
    // Other robot is blocked
    expect(table.isVertexReserved(2, 1, 1, 'R2')).toBe(true);
    // Other time step is free
    expect(table.isVertexReserved(2, 1, 5, 'R2')).toBe(false);
  });

  it('detects head-on edge swap conflicts', () => {
    const table = new ReservationTable();
    // Robot 1 moves from (1,1) at t=0 to (2,1) at t=1
    const r1Path: TimePosition[] = [
      { x: 1, y: 1, t: 0 },
      { x: 2, y: 1, t: 1 },
    ];
    table.reservePath('R1', r1Path, false);

    // Robot 2 attempts to move from (2,1) at t=0 to (1,1) at t=1 (head-on collision / swap)
    const isConflict = table.isEdgeSwapConflict(2, 1, 1, 1, 0, 'R2');
    expect(isConflict).toBe(true);

    // Transition reserved check should catch it
    const transitionBlocked = table.isTransitionReserved(2, 1, 1, 1, 0, 'R2');
    expect(transitionBlocked).toBe(true);
  });

  it('reserves goals indefinitely preventing collisions with finished robots', () => {
    const table = new ReservationTable();
    const path: TimePosition[] = [
      { x: 1, y: 1, t: 0 },
      { x: 2, y: 2, t: 3 },
    ];
    // Goal reservation enabled
    table.reservePath('R1', path, true);

    // Goal at (2,2) should be reserved for all t >= 3
    expect(table.isVertexReserved(2, 2, 2, 'R2')).toBe(false);
    expect(table.isVertexReserved(2, 2, 3, 'R2')).toBe(true);
    expect(table.isVertexReserved(2, 2, 50, 'R2')).toBe(true);
  });

  it('clears reservations properly when a robot is rerouted or removed', () => {
    const table = new ReservationTable();
    const path: TimePosition[] = [
      { x: 1, y: 1, t: 0 },
      { x: 1, y: 2, t: 1 },
    ];
    table.reservePath('R1', path, true);

    expect(table.isVertexReserved(1, 2, 1, 'R2')).toBe(true);
    table.clearRobot('R1');
    expect(table.isVertexReserved(1, 2, 1, 'R2')).toBe(false);
  });
});
