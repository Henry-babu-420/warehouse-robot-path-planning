import { describe, it, expect } from 'vitest';
import { ReservationTable } from '../algorithms/reservationTable';
import { findPathCooperativeAStar, planFleetCooperativePaths } from '../algorithms/cooperativeAstar';
import { Position } from '../types/grid';
import { Robot } from '../types/robot';

describe('Multi-Robot Cooperative A*', () => {
  const width = 10;
  const height = 10;

  it('generates a wait action when another robot occupies a narrow 1-cell corridor', () => {
    const table = new ReservationTable();

    // Robot 1 is scheduled to traverse a narrow corridor at (3, 2) at time t=2
    table.reservePath('R1', [
      { x: 1, y: 2, t: 0 },
      { x: 2, y: 2, t: 1 },
      { x: 3, y: 2, t: 2 },
      { x: 4, y: 2, t: 3 },
    ], false);

    // Robot 2 wants to cross the corridor from (3, 1) to (3, 3)
    // Direct path would want (3, 2) at t=1 or t=2.
    // Cooperative A* should schedule a wait or route around if blocked
    const r2Start: Position = { x: 3, y: 0 };
    const r2Goal: Position = { x: 3, y: 4 };

    // Confined corridor where x=3 is the only open column for y=1..3
    const isCellTraversable = (pos: Position) => {
      if (pos.y >= 1 && pos.y <= 3 && pos.x !== 3) return false;
      return true;
    };

    const plan = findPathCooperativeAStar(r2Start, r2Goal, 'R2', {
      width,
      height,
      isCellTraversable,
      reservationTable: table,
      maxTimeHorizon: 50,
    });

    expect(plan.success).toBe(true);
    // Path must not have vertex conflict at (3,2) at t=2
    const conflict = plan.timeIndexedPath.some(tp => tp.x === 3 && tp.y === 2 && tp.t === 2);
    expect(conflict).toBe(false);

    // Wait action should occur
    let hasWait = false;
    for (let i = 1; i < plan.timeIndexedPath.length; i++) {
      const prev = plan.timeIndexedPath[i - 1];
      const curr = plan.timeIndexedPath[i];
      if (prev.x === curr.x && prev.y === curr.y && curr.t === prev.t + 1) {
        hasWait = true;
        break;
      }
    }
    expect(hasWait).toBe(true);
  });

  it('plans fleet paths for multiple robots with no vertex or edge collisions', () => {
    const table = new ReservationTable();

    const robots: Robot[] = [
      {
        id: 'R1',
        name: 'Robot 1',
        color: '#ff0000',
        position: { x: 1, y: 1 },
        startPosition: { x: 1, y: 1 },
        targetPosition: { x: 5, y: 1 },
        assignedPickup: { x: 5, y: 1 },
        assignedDelivery: null,
        status: 'IDLE',
        plannedPath: [],
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
        position: { x: 5, y: 1 },
        startPosition: { x: 5, y: 1 },
        targetPosition: { x: 1, y: 1 },
        assignedPickup: { x: 1, y: 1 },
        assignedDelivery: null,
        status: 'IDLE',
        plannedPath: [],
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

    const { plannedRobots, planningResults } = planFleetCooperativePaths(
      robots,
      {
        width: 10,
        height: 10,
        isCellTraversable: () => true,
        reservationTable: table,
      },
      0
    );

    expect(planningResults[0].success).toBe(true);
    expect(planningResults[1].success).toBe(true);

    const r1TimePath = plannedRobots.find(r => r.id === 'R1')!.plannedPath;
    const r2TimePath = plannedRobots.find(r => r.id === 'R2')!.plannedPath;

    // Verify no vertex collisions at any time step t
    const maxT = Math.max(
      r1TimePath[r1TimePath.length - 1].t,
      r2TimePath[r2TimePath.length - 1].t
    );

    for (let t = 0; t <= maxT; t++) {
      const p1 = r1TimePath.find(p => p.t === t) || r1TimePath[r1TimePath.length - 1];
      const p2 = r2TimePath.find(p => p.t === t) || r2TimePath[r2TimePath.length - 1];

      // Must never occupy same cell at same time
      const isSameCell = p1.x === p2.x && p1.y === p2.y;
      expect(isSameCell).toBe(false);
    }
  });
});
