import { describe, it, expect } from 'vitest';
import { CollisionManager } from '../simulation/collisionManager';
import { ReservationTable } from '../algorithms/reservationTable';
import { Robot } from '../types/robot';

describe('Collision Manager & Avoidance', () => {
  it('prevents head-on edge swap collisions and increments collision counter', () => {
    const manager = new CollisionManager();
    const table = new ReservationTable();

    // Two robots attempting to swap places: R1 at (1,1)->(2,1), R2 at (2,1)->(1,1)
    const robots: Robot[] = [
      {
        id: 'R1',
        name: 'Robot 1',
        color: '#ff0000',
        position: { x: 1, y: 1 },
        startPosition: { x: 1, y: 1 },
        targetPosition: { x: 2, y: 1 },
        assignedPickup: null,
        assignedDelivery: null,
        status: 'MOVING_TO_PICKUP',
        plannedPath: [
          { x: 1, y: 1, t: 0 },
          { x: 2, y: 1, t: 1 },
        ],
        pathIndex: 0,
        priority: 10, // Higher priority
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
        position: { x: 2, y: 1 },
        startPosition: { x: 2, y: 1 },
        targetPosition: { x: 1, y: 1 },
        assignedPickup: null,
        assignedDelivery: null,
        status: 'MOVING_TO_PICKUP',
        plannedPath: [
          { x: 2, y: 1, t: 0 },
          { x: 1, y: 1, t: 1 },
        ],
        pathIndex: 0,
        priority: 5, // Lower priority
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

    expect(manager.getPreventedCount()).toBe(0);

    const result = manager.validateAndFilterMoves(
      robots,
      () => true,
      0,
      table
    );

    // Both robots must hold safe positions before head-on collision occurs
    const r1 = result.filteredRobots.find(r => r.id === 'R1')!;
    expect(r1.position).toEqual({ x: 1, y: 1 });

    const r2 = result.filteredRobots.find(r => r.id === 'R2')!;
    expect(r2.position).toEqual({ x: 2, y: 1 });

    // Exactly 1 collision prevented!
    expect(manager.getPreventedCount()).toBe(1);
    expect(result.preventedCollisionsThisStep.length).toBe(1);
    expect(result.preventedCollisionsThisStep[0].type).toBe('EDGE_SWAP');
  });

  it('prevents same-cell vertex collisions', () => {
    const manager = new CollisionManager();
    const table = new ReservationTable();

    // R1 from (1,0) -> (1,1); R2 from (0,1) -> (1,1)
    const robots: Robot[] = [
      {
        id: 'R1',
        name: 'Robot 1',
        color: '#ff0000',
        position: { x: 1, y: 0 },
        startPosition: { x: 1, y: 0 },
        targetPosition: { x: 1, y: 1 },
        assignedPickup: null,
        assignedDelivery: null,
        status: 'MOVING_TO_PICKUP',
        plannedPath: [{ x: 1, y: 0, t: 0 }, { x: 1, y: 1, t: 1 }],
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
        position: { x: 0, y: 1 },
        startPosition: { x: 0, y: 1 },
        targetPosition: { x: 1, y: 1 },
        assignedPickup: null,
        assignedDelivery: null,
        status: 'MOVING_TO_PICKUP',
        plannedPath: [{ x: 0, y: 1, t: 0 }, { x: 1, y: 1, t: 1 }],
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

    const result = manager.validateAndFilterMoves(robots, () => true, 0, table);

    // R1 gets the cell (1,1)
    expect(result.filteredRobots.find(r => r.id === 'R1')!.position).toEqual({ x: 1, y: 1 });
    // R2 remains at (0,1)
    expect(result.filteredRobots.find(r => r.id === 'R2')!.position).toEqual({ x: 0, y: 1 });

    expect(manager.getPreventedCount()).toBe(1);
    expect(result.preventedCollisionsThisStep[0].type).toBe('VERTEX_CONFLICT');
  });
});
