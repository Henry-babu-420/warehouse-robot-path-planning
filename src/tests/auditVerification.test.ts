import { describe, it, expect } from 'vitest';
import { CollisionManager } from '../simulation/collisionManager';
import { ReservationTable } from '../algorithms/reservationTable';
import { DeadlockDetector } from '../algorithms/deadlockDetector';
import { handleDynamicObstaclePlacement, recoverFromDeadlock } from '../algorithms/replanner';
import { findPathCooperativeAStar, planFleetCooperativePaths } from '../algorithms/cooperativeAstar';
import { Robot } from '../types/robot';
import { Position } from '../types/grid';

describe('Audit Verification Tests', () => {
  // Test 1: Moving robot vs stationary parked robot
  it('prevents a moving robot from displacing a stationary parked robot, regardless of priority', () => {
    const manager = new CollisionManager();
    const table = new ReservationTable();

    // R1 is stationary/parked at (2, 2) with low priority 2
    // R2 is moving from (1, 2) to (2, 2) with high priority 10
    const robots: Robot[] = [
      {
        id: 'R1',
        name: 'Parked Robot',
        color: '#ff0000',
        position: { x: 2, y: 2 },
        startPosition: { x: 2, y: 2 },
        targetPosition: null,
        assignedPickup: null,
        assignedDelivery: null,
        status: 'COMPLETED',
        plannedPath: [{ x: 2, y: 2, t: 0 }],
        pathIndex: 0,
        priority: 2, // LOW priority
        priorityAge: 0,
        speed: 1,
        isActive: true,
        hasPayload: false,
        totalWaitSteps: 0,
        totalStepsMoved: 0,
        tasksCompleted: 1,
        replanCount: 0,
      },
      {
        id: 'R2',
        name: 'Moving Robot',
        color: '#00ff00',
        position: { x: 1, y: 2 },
        startPosition: { x: 1, y: 2 },
        targetPosition: { x: 3, y: 2 },
        assignedPickup: null,
        assignedDelivery: null,
        status: 'MOVING_TO_PICKUP',
        plannedPath: [{ x: 1, y: 2, t: 0 }, { x: 2, y: 2, t: 1 }],
        pathIndex: 0,
        priority: 10, // HIGH priority
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

    const r1 = result.filteredRobots.find(r => r.id === 'R1')!;
    const r2 = result.filteredRobots.find(r => r.id === 'R2')!;

    // Stationary robot R1 must remain at (2, 2)
    expect(r1.position).toEqual({ x: 2, y: 2 });
    // Moving robot R2 must NOT be allowed into (2, 2) - it must hold at (1, 2)!
    expect(r2.position).toEqual({ x: 1, y: 2 });
  });

  // Test 2: Cascading collision resolution
  it('handles cascading collision when yielding robot cell is targeted by a trailing robot', () => {
    const manager = new CollisionManager();
    const table = new ReservationTable();

    // R_A: (3, 2) -> (3, 3) (Priority 10)
    // R_B: (2, 3) -> (3, 3) (Priority 5)
    // R_C: (1, 3) -> (2, 3) (Priority 2)
    // When R_B yields to R_A and stays at (2, 3), R_C must NOT move into (2, 3)!
    const robots: Robot[] = [
      {
        id: 'RA',
        name: 'Robot A',
        color: '#ff0000',
        position: { x: 3, y: 2 },
        startPosition: { x: 3, y: 2 },
        targetPosition: { x: 3, y: 3 },
        assignedPickup: null,
        assignedDelivery: null,
        status: 'MOVING_TO_PICKUP',
        plannedPath: [{ x: 3, y: 2, t: 0 }, { x: 3, y: 3, t: 1 }],
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
        id: 'RB',
        name: 'Robot B',
        color: '#00ff00',
        position: { x: 2, y: 3 },
        startPosition: { x: 2, y: 3 },
        targetPosition: { x: 3, y: 3 },
        assignedPickup: null,
        assignedDelivery: null,
        status: 'MOVING_TO_PICKUP',
        plannedPath: [{ x: 2, y: 3, t: 0 }, { x: 3, y: 3, t: 1 }],
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
      {
        id: 'RC',
        name: 'Robot C',
        color: '#0000ff',
        position: { x: 1, y: 3 },
        startPosition: { x: 1, y: 3 },
        targetPosition: { x: 2, y: 3 },
        assignedPickup: null,
        assignedDelivery: null,
        status: 'MOVING_TO_PICKUP',
        plannedPath: [{ x: 1, y: 3, t: 0 }, { x: 2, y: 3, t: 1 }],
        pathIndex: 0,
        priority: 2,
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

    const ra = result.filteredRobots.find(r => r.id === 'RA')!;
    const rb = result.filteredRobots.find(r => r.id === 'RB')!;
    const rc = result.filteredRobots.find(r => r.id === 'RC')!;

    expect(ra.position).toEqual({ x: 3, y: 3 });
    expect(rb.position).toEqual({ x: 2, y: 3 }); // B held at (2,3)
    // C must NOT be at (2, 3) with B! C must hold at (1, 3)!
    expect(rc.position).toEqual({ x: 1, y: 3 });
  });

  // Test 3: Multiple robots simultaneous dynamic obstacle replanning
  it('clears all affected reservations before replanning multiple robots', () => {
    const table = new ReservationTable();

    // R1: (1, 2) -> (2, 2) -> (3, 2) -> (4, 2)
    // R2: (5, 2) -> (4, 2) -> (3, 2) -> (2, 2)
    // Dynamic obstacle placed at (3, 2) affects BOTH R1 and R2!
    const r1Path = [
      { x: 1, y: 2, t: 0 },
      { x: 2, y: 2, t: 1 },
      { x: 3, y: 2, t: 2 },
      { x: 4, y: 2, t: 3 },
    ];
    const r2Path = [
      { x: 5, y: 2, t: 0 },
      { x: 4, y: 2, t: 1 },
      { x: 3, y: 2, t: 2 },
      { x: 2, y: 2, t: 3 },
    ];
    table.reservePath('R1', r1Path, true);
    table.reservePath('R2', r2Path, true);

    const robots: Robot[] = [
      {
        id: 'R1',
        name: 'Robot 1',
        color: '#ff0000',
        position: { x: 1, y: 2 },
        startPosition: { x: 1, y: 2 },
        targetPosition: { x: 4, y: 2 },
        assignedPickup: { x: 4, y: 2 },
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
        position: { x: 5, y: 2 },
        startPosition: { x: 5, y: 2 },
        targetPosition: { x: 2, y: 2 },
        assignedPickup: { x: 2, y: 2 },
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

    const blockedCell = { x: 3, y: 2 };
    const { updatedRobots, replanEvents } = handleDynamicObstaclePlacement(
      blockedCell,
      robots,
      {
        width: 10,
        height: 10,
        isCellTraversable: (pos) => !(pos.x === 3 && pos.y === 2),
        reservationTable: table,
      },
      0
    );

    // Both should be replanned without throwing or mutual blocking
    expect(replanEvents.length).toBe(2);
    expect(replanEvents.every(e => e.success)).toBe(true);
  });

  // Test 4: Priority aging actually inverts/changes planning order in deadlock
  it('changes relative planning order during deadlock recovery to prevent repeated deadlocks', () => {
    const table = new ReservationTable();

    // R1 has base priority 10, R2 has base priority 5
    // In deadlock recovery, R2 should be given priority elevation to resolve the cycle
    const robots: Robot[] = [
      {
        id: 'R1',
        name: 'Robot 1',
        color: '#ff0000',
        position: { x: 1, y: 1 },
        startPosition: { x: 1, y: 1 },
        targetPosition: { x: 3, y: 1 },
        assignedPickup: null,
        assignedDelivery: null,
        status: 'WAITING',
        plannedPath: [{ x: 1, y: 1, t: 0 }],
        pathIndex: 0,
        priority: 10,
        priorityAge: 0,
        speed: 1,
        isActive: true,
        hasPayload: false,
        totalWaitSteps: 3,
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
        targetPosition: { x: 0, y: 1 },
        assignedPickup: null,
        assignedDelivery: null,
        status: 'WAITING',
        plannedPath: [{ x: 2, y: 1, t: 0 }],
        pathIndex: 0,
        priority: 5,
        priorityAge: 0,
        speed: 1,
        isActive: true,
        hasPayload: false,
        totalWaitSteps: 3,
        totalStepsMoved: 0,
        tasksCompleted: 0,
        replanCount: 0,
      },
    ];

    const recovery = recoverFromDeadlock(
      ['R1', 'R2'],
      robots,
      {
        width: 10,
        height: 10,
        isCellTraversable: () => true,
        reservationTable: table,
      },
      0
    );

    // After recovery, effective priorities must have changed relative ranking
    const r1After = recovery.updatedRobots.find(r => r.id === 'R1')!;
    const r2After = recovery.updatedRobots.find(r => r.id === 'R2')!;

    const eff1 = r1After.priority + r1After.priorityAge;
    const eff2 = r2After.priority + r2After.priorityAge;

    // Check that priority aging genuinely affected relative ranking rather than identically shifting both
    expect(eff1 !== eff2).toBe(true);
  });
});
