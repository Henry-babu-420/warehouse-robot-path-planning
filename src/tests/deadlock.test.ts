import { describe, it, expect } from 'vitest';
import { DeadlockDetector } from '../algorithms/deadlockDetector';
import { recoverFromDeadlock } from '../algorithms/replanner';
import { ReservationTable } from '../algorithms/reservationTable';
import { Robot } from '../types/robot';

describe('Deadlock Detection and Recovery', () => {
  it('detects a circular wait-for deadlock between two robots', () => {
    const detector = new DeadlockDetector();
    const table = new ReservationTable();

    // R1 is at (1,1) wanting to move to (2,1) which is occupied by R2
    // R2 is at (2,1) wanting to move to (1,1) which is occupied by R1
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
        plannedPath: [{ x: 1, y: 1, t: 0 }, { x: 2, y: 1, t: 1 }],
        pathIndex: 0,
        priority: 10,
        priorityAge: 0,
        speed: 1,
        isActive: true,
        hasPayload: false,
        totalWaitSteps: 2,
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
        plannedPath: [{ x: 2, y: 1, t: 0 }, { x: 1, y: 1, t: 1 }],
        pathIndex: 0,
        priority: 5,
        priorityAge: 0,
        speed: 1,
        isActive: true,
        hasPayload: false,
        totalWaitSteps: 2,
        totalStepsMoved: 0,
        tasksCompleted: 0,
        replanCount: 0,
      },
    ];

    const report = detector.detectDeadlock(robots, table, 0);

    expect(report.isDeadlocked).toBe(true);
    expect(report.cycleFound).toBe(true);
    expect(report.involvedRobotIds).toContain('R1');
    expect(report.involvedRobotIds).toContain('R2');
  });

  it('recovers from deadlock by reprioritizing and replanning', () => {
    const table = new ReservationTable();

    const robots: Robot[] = [
      {
        id: 'R1',
        name: 'Robot 1',
        color: '#ff0000',
        position: { x: 2, y: 2 },
        startPosition: { x: 2, y: 2 },
        targetPosition: { x: 5, y: 2 },
        assignedPickup: null,
        assignedDelivery: null,
        status: 'WAITING',
        plannedPath: [{ x: 2, y: 2, t: 0 }],
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
      ['R1'],
      robots,
      {
        width: 10,
        height: 10,
        isCellTraversable: () => true,
        reservationTable: table,
      },
      0
    );

    expect(recovery.recovered).toBe(true);
    const r1 = recovery.updatedRobots.find(r => r.id === 'R1')!;
    expect(r1.plannedPath.length).toBeGreaterThan(1);
    expect(r1.replanCount).toBe(1);
  });
});
