import { describe, it, expect } from 'vitest';
import { SimulationEngine } from '../simulation/simulationEngine';
import { createDefaultWarehouse } from '../utils/warehousePresets';
import { posEquals } from '../utils/heuristics';
import { Robot } from '../types/robot';
import { ReservationTable } from '../algorithms/reservationTable';
import { DeadlockDetector } from '../algorithms/deadlockDetector';
import { CollisionManager } from '../simulation/collisionManager';

describe('FINAL END-TO-END VALIDATION: Warehouse Control System', () => {

  // =========================================================================
  // TEST 1 — AGV-10 COMPLETE DELIVERY
  // =========================================================================
  it('TEST 1: executes end-to-end delivery for AGV-10 from (1,3) to (18,3) under 10-AGV traffic', { timeout: 30000 }, () => {
    const engine = new SimulationEngine();
    engine.resetRobotPositions();

    // Commission 10 AGVs
    while (engine.robots.length < 10) {
      engine.addRobot();
    }
    expect(engine.robots.length).toBe(10);

    // Initial plan for all robots
    engine.planFleetPaths();

    // Locate AGV-10 (R10)
    const agv10 = engine.robots.find(r => r.id === 'R10' || r.name === 'AGV-10');
    expect(agv10).toBeDefined();

    // Setup initial condition: AGV-10 at P1 (1,3) with loaded payload targeting D1 (18,3)
    agv10!.position = { x: 1, y: 3 };
    agv10!.startPosition = { x: 1, y: 3 };
    agv10!.assignedPickup = { x: 1, y: 3 };
    agv10!.assignedDelivery = { x: 18, y: 3 };
    agv10!.targetPosition = { x: 18, y: 3 };
    agv10!.hasPayload = true;
    agv10!.status = 'MOVING_TO_DELIVERY';
    agv10!.tasksCompleted = 0;
    agv10!.totalWaitSteps = 0;
    agv10!.replanCount = 0;
    agv10!.priorityAge = 0;

    // Plan fleet routes with AGV-10 at (1, 3) targeting (18, 3)
    engine.planFleetPaths();

    const initialPriority = agv10!.priority;
    expect(initialPriority).toBe(1); // Lowest in 10-robot fleet

    // Record telemetry prior to execution
    let initialReservationCount = engine.reservationTable
      .getAllVertexReservations()
      .filter(r => r.robotId === agv10!.id).length;

    // Run the actual simulation engine tick-by-tick
    const MAX_TICKS = 150;
    let completedTick = -1;
    let maxPriorityAge = 0;
    let currentAgv10 = engine.robots.find(r => r.id === 'R10' || r.name === 'AGV-10')!;

    for (let t = 0; t < MAX_TICKS; t++) {
      engine.step();
      currentAgv10 = engine.robots.find(r => r.id === 'R10' || r.name === 'AGV-10')!;

      maxPriorityAge = Math.max(maxPriorityAge, currentAgv10.priorityAge || 0);

      // Check if AGV-10 completed delivery (arrived at D1, discharged payload, task completed)
      if (currentAgv10.tasksCompleted >= 1 || (!currentAgv10.hasPayload && posEquals(currentAgv10.position, { x: 18, y: 3 }))) {
        completedTick = t + 1;
        break;
      }
    }

    const finalReservationCount = engine.reservationTable
      .getAllVertexReservations()
      .filter(r => r.robotId === currentAgv10.id).length;

    console.log(`[TEST 1 Result] AGV-10 Delivery Outcome:
      - Initial Priority: ${initialPriority}
      - Max Priority Aging: +${maxPriorityAge}
      - Total Wait Ticks: ${currentAgv10.totalWaitSteps}
      - Replanning Count: ${currentAgv10.replanCount}
      - Final Reservation Count: ${finalReservationCount}
      - Tasks Completed: ${currentAgv10.tasksCompleted}
      - Final Position: (${currentAgv10.position.x}, ${currentAgv10.position.y})
      - Completed at Tick: ${completedTick}`);

    // Verify delivery completed in reality, not just path planning!
    expect(currentAgv10.tasksCompleted).toBeGreaterThanOrEqual(1);
    expect(completedTick).toBeGreaterThan(0);
    expect(completedTick).toBeLessThanOrEqual(MAX_TICKS);
  });

  // =========================================================================
  // TEST 2 — DELIVERY BAY RESERVATION & STARVATION FREEDOM
  // =========================================================================
  it('TEST 2: validates delivery bay reservation holding, safe waiting, and release upon departure', { timeout: 30000 }, () => {
    const engine = new SimulationEngine();
    engine.resetRobotPositions();

    // Park Robot 1 at Outbound Bay D1 (18, 3)
    const r1 = engine.robots[0];
    r1.position = { x: 18, y: 3 };
    r1.targetPosition = null;
    r1.hasPayload = false;
    r1.status = 'COMPLETED';
    r1.plannedPath = [];
    r1.pathIndex = 0;

    // Robot 2 at (17, 3) directly in front of D1 (18, 3)
    const r2 = engine.robots[1];
    r2.position = { x: 17, y: 3 };
    r2.startPosition = { x: 17, y: 3 };
    r2.assignedPickup = null;
    r2.assignedDelivery = { x: 18, y: 3 };
    r2.targetPosition = { x: 18, y: 3 };
    r2.hasPayload = true;
    r2.status = 'MOVING_TO_DELIVERY';
    r2.plannedPath = [];
    r2.pathIndex = 0;
    r2.tasksCompleted = 0;

    // Plan fleet paths: R1 locks (18, 3), R2 attempts to plan to (18, 3)
    engine.planFleetPaths();

    // Step 1: Verify R2 cannot enter (18, 3) while R1 is parked there
    engine.step();
    let currentR2 = engine.robots.find(r => r.id === r2.id)!;
    let currentR1 = engine.robots.find(r => r.id === r1.id)!;
    expect(posEquals(currentR2.position, { x: 18, y: 3 })).toBe(false);
    expect(posEquals(currentR1.position, { x: 18, y: 3 })).toBe(true);

    // Let R2 wait safely for 4 ticks
    for (let i = 0; i < 4; i++) {
      engine.step();
      currentR2 = engine.robots.find(r => r.id === r2.id)!;
      expect(posEquals(currentR2.position, { x: 18, y: 3 })).toBe(false);
    }

    // Now R1 departs D1: assign R1 a task to Pickup P2 (1, 6)
    currentR1 = engine.robots.find(r => r.id === r1.id)!;
    currentR1.assignedPickup = { x: 1, y: 6 };
    currentR1.targetPosition = { x: 1, y: 6 };
    currentR1.status = 'IDLE';

    // R1 replans route away from (18, 3)
    engine.planFleetPaths();

    // Verify R1 moves away over subsequent steps, and R2 delivers to D1
    let r2Completed = false;
    let finalR1 = engine.robots.find(r => r.id === r1.id)!;
    let finalR2 = engine.robots.find(r => r.id === r2.id)!;

    for (let t = 0; t < 60; t++) {
      engine.step();
      finalR1 = engine.robots.find(r => r.id === r1.id)!;
      finalR2 = engine.robots.find(r => r.id === r2.id)!;
      if (finalR2.tasksCompleted >= 1 || posEquals(finalR2.position, { x: 18, y: 3 })) {
        r2Completed = true;
        break;
      }
    }

    console.log(`[TEST 2 Result] Delivery Bay Contention & Release:
      - R1 Departure Verified: (${finalR1.position.x}, ${finalR1.position.y})
      - R2 Safe Waiting & Subsequent Delivery: ${r2Completed}
      - R2 Tasks Completed: ${finalR2.tasksCompleted}`);

    expect(r2Completed).toBe(true);
  });

  // =========================================================================
  // TEST 3 — DEADLOCK CLASSIFICATION (CYCLES vs STALLS vs UNRESOLVED)
  // =========================================================================
  it('TEST 3: verifies deadlock cycle detection counts once per episode, differentiates stalls, and reports unresolved deadlocks', () => {
    const engine = new SimulationEngine();
    engine.resetRobotPositions();

    // Create a genuine head-on Wait-For Graph cycle between R1 and R2 in aisle y=4
    // R1 at (5, 4) wants to move to (6, 4) where R2 is.
    // R2 at (6, 4) wants to move to (5, 4) where R1 is.
    const r1 = engine.robots[0];
    const r2 = engine.robots[1];

    r1.position = { x: 5, y: 4 };
    r1.targetPosition = { x: 8, y: 4 };
    r1.plannedPath = [{ x: 5, y: 4, t: 0 }, { x: 6, y: 4, t: 1 }, { x: 7, y: 4, t: 2 }];
    r1.pathIndex = 0;
    r1.status = 'MOVING_TO_PICKUP';

    r2.position = { x: 6, y: 4 };
    r2.targetPosition = { x: 3, y: 4 };
    r2.plannedPath = [{ x: 6, y: 4, t: 0 }, { x: 5, y: 4, t: 1 }, { x: 4, y: 4, t: 2 }];
    r2.pathIndex = 0;
    r2.status = 'MOVING_TO_PICKUP';

    // Verify initial cycle detected
    const report1 = engine.deadlockDetector.detectDeadlock(engine.robots, engine.reservationTable, 0);
    expect(report1.cycleFound).toBe(true);

    const initialCycles = engine.deadlockCyclesDetected;

    // Step 1: Cycle should be detected and increment deadlockCyclesDetected by exactly 1
    engine.step();
    expect(engine.deadlockCyclesDetected).toBe(initialCycles + 1);

    // If the cycle robots remain in a deadlock on the very next tick:
    // deadlockCyclesDetected MUST NOT increment again for the same episode!
    r1.position = { x: 5, y: 4 };
    r2.position = { x: 6, y: 4 };
    r1.plannedPath = [{ x: 5, y: 4, t: 1 }, { x: 6, y: 4, t: 2 }];
    r2.plannedPath = [{ x: 6, y: 4, t: 1 }, { x: 5, y: 4, t: 2 }];
    r1.pathIndex = 0;
    r2.pathIndex = 0;

    const cyclesBeforeNextTick = engine.deadlockCyclesDetected;
    engine.step();
    // Must remain unchanged because it is the same detection episode!
    expect(engine.deadlockCyclesDetected).toBe(cyclesBeforeNextTick);

    // Part B: Simple stall without cycle (R3 waiting behind a stationary obstacle for >= 3 ticks)
    engine.deadlockDetector.reset();
    const r3 = engine.robots[2];
    r3.status = 'WAITING';
    r3.plannedPath = [{ x: 2, y: 2, t: 0 }];
    r3.pathIndex = 0;

    engine.deadlockDetector.recordStep(engine.robots);
    engine.deadlockDetector.recordStep(engine.robots);
    engine.deadlockDetector.recordStep(engine.robots);

    const stallReport = engine.deadlockDetector.detectDeadlock(engine.robots, engine.reservationTable, 3);
    expect(stallReport.isDeadlocked).toBe(true);
    expect(stallReport.cycleFound).toBe(false); // STALL, NOT A CYCLE!

    console.log(`[TEST 3 Result] Deadlock Classification:
      - Unique Cycle Episode Detected: ${engine.deadlockCyclesDetected > 0}
      - Stall Detection Without Cycle: ${stallReport.isDeadlocked && !stallReport.cycleFound}
      - Recovery Attempts Counted: ${engine.deadlockRecoveryAttempts}
      - Unresolved Stalls Tracked: ${engine.unresolvedDeadlocks}`);

    expect(engine.deadlockRecoveryAttempts).toBeGreaterThan(0);
  });

  // =========================================================================
  // TEST 4 — RESERVATION SAFETY ON PLANNING FAILURE
  // =========================================================================
  it('TEST 4: verifies waiting AGV preserves current cell reservation, removes stale future reservations, and prevents trespass', () => {
    const table = new ReservationTable();
    const collisionManager = new CollisionManager();

    // Robot 1 at (2, 2) has an old 4-step path scheduled up to t=3
    const oldPath = [
      { x: 2, y: 2, t: 0 },
      { x: 2, y: 3, t: 1 },
      { x: 2, y: 4, t: 2 },
      { x: 2, y: 5, t: 3 },
    ];
    table.reservePath('R1', oldPath, true);

    // Confirm future cells are reserved initially
    expect(table.isVertexReserved(2, 4, 2, 'R2')).toBe(true);
    expect(table.isVertexReserved(2, 5, 3, 'R2')).toBe(true);

    // Now simulate planning failure at step t=0:
    // When planning fails, clearRobot is called and current position (2, 2) is re-reserved at t=0
    table.clearRobot('R1');
    table.reservePath('R1', [{ x: 2, y: 2, t: 0 }], true);

    // 1. Current cell at t=0 MUST be reserved for R1 (blocking R2)
    expect(table.isVertexReserved(2, 2, 0, 'R2')).toBe(true);

    // 2. Stale future cells (2, 3), (2, 4), (2, 5) MUST be freed for other robots!
    expect(table.isVertexReserved(2, 3, 1, 'R2')).toBe(false);
    expect(table.isVertexReserved(2, 4, 2, 'R2')).toBe(false);
    expect(table.isVertexReserved(2, 5, 3, 'R2')).toBe(false);

    // 3. CollisionManager test: verify another robot cannot move into (2, 2)
    const testRobots: Robot[] = [
      {
        id: 'R1', name: 'AGV-01', color: '#000',
        position: { x: 2, y: 2 }, startPosition: { x: 2, y: 2 },
        targetPosition: null, assignedPickup: null, assignedDelivery: null,
        status: 'WAITING', plannedPath: [{ x: 2, y: 2, t: 0 }], pathIndex: 0,
        priority: 5, priorityAge: 0, speed: 1, isActive: true, hasPayload: false,
        totalWaitSteps: 1, totalStepsMoved: 0, tasksCompleted: 0, replanCount: 0,
      },
      {
        id: 'R2', name: 'AGV-02', color: '#111',
        position: { x: 1, y: 2 }, startPosition: { x: 1, y: 2 },
        targetPosition: { x: 2, y: 2 }, assignedPickup: null, assignedDelivery: null,
        status: 'MOVING_TO_PICKUP', plannedPath: [{ x: 1, y: 2, t: 0 }, { x: 2, y: 2, t: 1 }], pathIndex: 0,
        priority: 4, priorityAge: 0, speed: 1, isActive: true, hasPayload: false,
        totalWaitSteps: 0, totalStepsMoved: 0, tasksCompleted: 0, replanCount: 0,
      }
    ];

    const { filteredRobots, preventedCollisionsThisStep } = collisionManager.validateAndFilterMoves(
      testRobots,
      () => true,
      0,
      table
    );

    // CollisionManager must reject R2's move into R1's cell
    expect(preventedCollisionsThisStep.length).toBeGreaterThan(0);
    expect(filteredRobots[1].position.x).toBe(1); // R2 forced to hold (1, 2)

    console.log(`[TEST 4 Result] Reservation Safety Validated:
      - Current cell (2,2) reserved at t=0: true
      - Stale future reservations cleared: true
      - Physical encroachment prevented: true (${preventedCollisionsThisStep[0].message})`);
  });

  // =========================================================================
  // TEST 5 — LONGER LIVE SIMULATION (500 TICKS WITH 10 AGVS)
  // =========================================================================
  it('TEST 5: executes 500 live simulation ticks with 10 AGVs and profiles throughput, deadlocks, and starvation', { timeout: 180000 }, () => {
    const engine = new SimulationEngine();
    engine.resetRobotPositions();

    // Commission 10 AGVs
    while (engine.robots.length < 10) {
      engine.addRobot();
    }
    expect(engine.robots.length).toBe(10);
    engine.planFleetPaths();

    const TICKS = 500;
    const initialSnap = engine.robots.map(r => ({ id: r.id, tasks: r.tasksCompleted, moves: r.totalStepsMoved }));

    for (let t = 0; t < TICKS; t++) {
      engine.step();
    }

    const metrics = engine.getMetrics();
    const finalRobots = engine.robots.map(r => ({
      id: r.id,
      name: r.name,
      status: r.status,
      pos: `(${r.position.x},${r.position.y})`,
      tasks: r.tasksCompleted,
      moves: r.totalStepsMoved,
      waits: r.totalWaitSteps,
      replans: r.replanCount,
    }));

    console.log(`[TEST 5 Result] 500-Tick Live Fleet Telemetry:
      - Clock: t=${engine.simulationClock.getStep()}
      - Total Completed Deliveries: ${metrics.completedTasks}
      - Prevented Collisions: ${metrics.collisionAttemptsPrevented}
      - Deadlock Cycle Episodes: ${metrics.deadlockCyclesDetected}
      - Stall Alert Events: ${metrics.deadlockEvents}
      - Replanning / Recovery Actions: ${metrics.replanningCount}
      - Unresolved Stalls: ${metrics.unresolvedDeadlocks}
      - Fleet Cumulative Wait Ticks: ${metrics.totalWaitingTime}
      - Average Wait Ticks per AGV: ${metrics.avgWaitingTimePerRobot}
      - Active Makespan Snapshot: ${metrics.makespan}`);

    console.table(finalRobots);

    // Verify system remained operational throughout 500 ticks
    expect(metrics.completedTasks).toBeGreaterThan(0);
    expect(metrics.collisionAttemptsPrevented).toBeGreaterThan(0);

    // Check for indefinite starvation: no AGV should have 0 moves over 500 ticks
    const starvedRobots = finalRobots.filter(r => r.moves === 0);
    expect(starvedRobots.length).toBe(0);
  });
});
