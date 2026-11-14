import { describe, it, expect } from 'vitest';
import { handleDynamicObstaclePlacement } from '../algorithms/replanner';
import { ReservationTable } from '../algorithms/reservationTable';
import { Robot } from '../types/robot';
import { Position } from '../types/grid';

describe('Dynamic Obstacle Replanning', () => {
  it('detects an obstacle blocking a planned path and reroutes only the affected robot', () => {
    const table = new ReservationTable();

    // R1 plans to pass through (3, 2): (1,2) -> (2,2) -> (3,2) -> (4,2) -> (5,2)
    const r1Path = [
      { x: 1, y: 2, t: 0 },
      { x: 2, y: 2, t: 1 },
      { x: 3, y: 2, t: 2 },
      { x: 4, y: 2, t: 3 },
      { x: 5, y: 2, t: 4 },
    ];
    table.reservePath('R1', r1Path, true);

    // R2 is completely far away on row 8: (1,8) -> (2,8) -> (3,8)
    const r2Path = [
      { x: 1, y: 8, t: 0 },
      { x: 2, y: 8, t: 1 },
      { x: 3, y: 8, t: 2 },
    ];
    table.reservePath('R2', r2Path, true);

    const robots: Robot[] = [
      {
        id: 'R1',
        name: 'Robot 1',
        color: '#ff0000',
        position: { x: 1, y: 2 },
        startPosition: { x: 1, y: 2 },
        targetPosition: { x: 5, y: 2 },
        assignedPickup: { x: 5, y: 2 },
        assignedDelivery: null,
        status: 'MOVING_TO_PICKUP',
        plannedPath: r1Path,
        pathIndex: 0,
        priority: 10,
        priorityAge: 0,
        speed: 1,
        isActive: true,
        hasPayload: false,
        totalWaitSteps: 0,
        totalStepsMoved: 0,
        tasksCompleted: 0,
        replanCount: 0,
      },
      {
        id: 'R2',
        name: 'Robot 2',
        color: '#00ff00',
        position: { x: 1, y: 8 },
        startPosition: { x: 1, y: 8 },
        targetPosition: { x: 3, y: 8 },
        assignedPickup: { x: 3, y: 8 },
        assignedDelivery: null,
        status: 'MOVING_TO_PICKUP',
        plannedPath: r2Path,
        pathIndex: 0,
        priority: 5,
        priorityAge: 0,
        speed: 1,
        isActive: true,
        hasPayload: false,
        totalWaitSteps: 0,
        totalStepsMoved: 0,
        tasksCompleted: 0,
        replanCount: 0,
      },
    ];

    // Dynamic obstacle placed at (3, 2)
    const blockedCell: Position = { x: 3, y: 2 };
    const isCellTraversable = (pos: Position) => !(pos.x === 3 && pos.y === 2);

    const { updatedRobots, replanEvents } = handleDynamicObstaclePlacement(
      blockedCell,
      robots,
      {
        width: 10,
        height: 10,
        isCellTraversable,
        reservationTable: table,
      },
      0
    );

    // Exactly 1 robot (R1) affected and replanned
    expect(replanEvents.length).toBe(1);
    expect(replanEvents[0].robotId).toBe('R1');
    expect(replanEvents[0].success).toBe(true);

    const r1 = updatedRobots.find(r => r.id === 'R1')!;
    // New planned path must completely avoid (3, 2)
    const touchesBlocked = r1.plannedPath.some(p => p.x === 3 && p.y === 2);
    expect(touchesBlocked).toBe(false);
    expect(r1.replanCount).toBe(1);

    // R2 remains unchanged
    const r2 = updatedRobots.find(r => r.id === 'R2')!;
    expect(r2.plannedPath).toEqual(r2Path);
    expect(r2.replanCount).toBe(0);
  });
});
