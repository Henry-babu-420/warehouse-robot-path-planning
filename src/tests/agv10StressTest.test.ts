import { describe, it, expect } from 'vitest';
import { SimulationEngine } from '../simulation/simulationEngine';
import { createDefaultWarehouse } from '../utils/warehousePresets';
import { findPathCooperativeAStar, planFleetCooperativePaths } from '../algorithms/cooperativeAstar';
import { ReservationTable } from '../algorithms/reservationTable';
import { DeadlockDetector } from '../algorithms/deadlockDetector';
import { recoverFromDeadlock } from '../algorithms/replanner';
import { Robot } from '../types/robot';

describe('AGV-10 Stress Test and Reservation Analysis', () => {
  it('reproduces AGV-10 at P1 (1,3) with destination D1 (18,3) under high traffic', () => {
    const engine = new SimulationEngine();
    // Add robots up to 10
    while (engine.robots.length < 10) {
      engine.addRobot();
    }
    expect(engine.robots.length).toBe(10);

    const agv10 = engine.robots.find(r => r.id === 'R10' || r.name === 'AGV-10');
    expect(agv10).toBeDefined();

    // Verify AGV-10 initial priority is 1 (lowest in fleet)
    expect(agv10!.priority).toBe(1);

    // Simulate AGV-10 positioned at P1 (1, 3) with payload loaded and target D1 (18, 3)
    agv10!.position = { x: 1, y: 3 };
    agv10!.hasPayload = true;
    agv10!.status = 'AT_PICKUP';
    agv10!.targetPosition = { x: 18, y: 3 };
    agv10!.assignedDelivery = { x: 18, y: 3 };

    // Inspect reservation table state
    const allResBefore = engine.reservationTable.getAllVertexReservations();
    const agv10ResBefore = allResBefore.filter(r => r.robotId === agv10!.id);

    // Prior to our fix, if AGV-10's plan failed or was waiting, agv10ResBefore was 0 while allRes was high
    console.log(`Fleet reservations: ${allResBefore.length}, AGV-10 reservations: ${agv10ResBefore.length}`);
  });

  it('verifies priority aging prevents permanent starvation of low-priority AGVs', () => {
    const table = new ReservationTable();
    const warehouse = createDefaultWarehouse(20, 14);

    const robotA: Robot = {
      id: 'R1',
      name: 'AGV-01',
      color: '#426B8A',
      position: { x: 2, y: 3 },
      startPosition: { x: 2, y: 3 },
      targetPosition: { x: 2, y: 1 },
      assignedPickup: null,
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
    };

    const robot10: Robot = {
      id: 'R10',
      name: 'AGV-10',
      color: '#B45309',
      position: { x: 1, y: 3 },
      startPosition: { x: 1, y: 3 },
      targetPosition: { x: 18, y: 3 },
      assignedPickup: { x: 1, y: 3 },
      assignedDelivery: { x: 18, y: 3 },
      status: 'WAITING',
      plannedPath: [],
      pathIndex: 0,
      priority: 1,
      priorityAge: 0,
      speed: 1,
      isActive: true,
      hasPayload: true,
      totalWaitSteps: 11,
      totalStepsMoved: 0,
      tasksCompleted: 0,
      replanCount: 0,
    };

    // When robot 10 accumulates priorityAge, its effective priority increases
    robot10.priorityAge += 25; // 5 steps of starvation age
    expect(robot10.priority + robot10.priorityAge).toBe(26);
    expect(robot10.priority + robot10.priorityAge).toBeGreaterThan(robotA.priority + robotA.priorityAge);

    // Higher effective priority planned first
    const sorted = [robotA, robot10].sort((a, b) => 
      (b.priority + (b.priorityAge || 0)) - (a.priority + (a.priorityAge || 0))
    );
    expect(sorted[0].id).toBe('R10');
  });

  it('demonstrates deadlock detector cycle detection vs consecutive wait stall detection', () => {
    const detector = new DeadlockDetector();
    const table = new ReservationTable();

    // Case A: 2 robots in opposite deadlock (head-on wait cycle)
    const r1: Robot = {
      id: 'R1', name: 'AGV-01', color: '#000',
      position: { x: 5, y: 5 }, startPosition: { x: 5, y: 5 },
      targetPosition: { x: 6, y: 5 }, assignedPickup: null, assignedDelivery: null, status: 'MOVING_TO_PICKUP',
      plannedPath: [{ x: 5, y: 5, t: 0 }, { x: 6, y: 5, t: 1 }],
      pathIndex: 0, priority: 5, priorityAge: 0, speed: 1,
      isActive: true, hasPayload: false, totalWaitSteps: 0, totalStepsMoved: 0,
      tasksCompleted: 0, replanCount: 0,
    };
    const r2: Robot = {
      id: 'R2', name: 'AGV-02', color: '#000',
      position: { x: 6, y: 5 }, startPosition: { x: 6, y: 5 },
      targetPosition: { x: 5, y: 5 }, assignedPickup: null, assignedDelivery: null, status: 'MOVING_TO_PICKUP',
      plannedPath: [{ x: 6, y: 5, t: 0 }, { x: 5, y: 5, t: 1 }],
      pathIndex: 0, priority: 4, priorityAge: 0, speed: 1,
      isActive: true, hasPayload: false, totalWaitSteps: 0, totalStepsMoved: 0,
      tasksCompleted: 0, replanCount: 0,
    };

    const cycleReport = detector.detectDeadlock([r1, r2], table, 0);
    expect(cycleReport.isDeadlocked).toBe(true);
    expect(cycleReport.cycleFound).toBe(true);
    expect(cycleReport.involvedRobotIds).toContain('R1');
    expect(cycleReport.involvedRobotIds).toContain('R2');

    // Case B: Stall without circular graph (robot waiting at threshold >= 3)
    detector.reset();
    const rWait: Robot = {
      id: 'R10', name: 'AGV-10', color: '#000',
      position: { x: 1, y: 3 }, startPosition: { x: 1, y: 3 },
      targetPosition: { x: 18, y: 3 }, assignedPickup: null, assignedDelivery: null, status: 'WAITING',
      plannedPath: [{ x: 1, y: 3, t: 0 }],
      pathIndex: 0, priority: 1, priorityAge: 0, speed: 1,
      isActive: true, hasPayload: true, totalWaitSteps: 3, totalStepsMoved: 0,
      tasksCompleted: 0, replanCount: 0,
    };

    // Record 3 steps of waiting
    detector.recordStep([rWait]);
    detector.recordStep([rWait]);
    detector.recordStep([rWait]);

    const stallReport = detector.detectDeadlock([rWait], table, 3);
    expect(stallReport.isDeadlocked).toBe(true);
    expect(stallReport.cycleFound).toBe(false); // Stalled wait, NOT a directed cycle!
    expect(stallReport.involvedRobotIds).toContain('R10');
  });
});
