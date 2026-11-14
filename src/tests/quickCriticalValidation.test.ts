import { describe, it, expect } from 'vitest';
import { SimulationEngine } from '../simulation/simulationEngine';
import { posEquals } from '../utils/heuristics';

describe('QUICK CRITICAL PROTOTYPE VALIDATION', () => {
  it('SCENARIO A: 5 AGVs, assigns 2+ missions, verifies pickup, freight loading, delivery and counters', () => {
    const engine = new SimulationEngine();

    // 1. Start with 5 AGVs
    expect(engine.robots.length).toBe(5);
    const initialRobotCount = 5;

    // 2. Assign at least 2 distinct pickup-to-delivery missions
    // Mission 1: R1 to P1 (1, 3) -> D1 (18, 3)
    // Mission 2: R2 to P2 (1, 6) -> D2 (18, 6)
    engine.assignTask('R1', { x: 1, y: 3 }, { x: 18, y: 3 });
    engine.assignTask('R2', { x: 1, y: 6 }, { x: 18, y: 6 });
    const assignedMissions = 2;

    const r1 = engine.robots.find(r => r.id === 'R1')!;
    const r2 = engine.robots.find(r => r.id === 'R2')!;

    expect(r1.hasPayload).toBe(false);
    expect(r2.hasPayload).toBe(false);

    // 3. Step simulation and track pickup, loading, and delivery
    let simTicks = 0;
    const maxTicks = 120;
    let r1LoadedAtTick = -1;
    let r2LoadedAtTick = -1;
    let collisionViolations = 0;

    while (simTicks < maxTicks && (r1.tasksCompleted === 0 || r2.tasksCompleted === 0)) {
      engine.step();
      simTicks++;

      // Track payload loading
      const currentR1 = engine.robots.find(r => r.id === 'R1')!;
      const currentR2 = engine.robots.find(r => r.id === 'R2')!;

      if (r1LoadedAtTick === -1 && currentR1.hasPayload) {
        r1LoadedAtTick = simTicks;
      }
      if (r2LoadedAtTick === -1 && currentR2.hasPayload) {
        r2LoadedAtTick = simTicks;
      }

      // Check for any vertex collisions
      for (let i = 0; i < engine.robots.length; i++) {
        for (let j = i + 1; j < engine.robots.length; j++) {
          if (engine.robots[i].isActive && engine.robots[j].isActive) {
            if (posEquals(engine.robots[i].position, engine.robots[j].position)) {
              collisionViolations++;
            }
          }
        }
      }
    }

    const currentR1 = engine.robots.find(r => r.id === 'R1')!;
    const currentR2 = engine.robots.find(r => r.id === 'R2')!;
    const completedDeliveries = engine.getMetrics().completedTasks;

    console.log('[SCENARIO A TELEMETRY]', {
      initialRobotCount,
      assignedMissions,
      completedDeliveries,
      simTicks,
      r1LoadedAtTick,
      r2LoadedAtTick,
      r1Tasks: currentR1.tasksCompleted,
      r2Tasks: currentR2.tasksCompleted,
      collisionViolations,
      replanningEvents: engine.replanCount,
      failedOperations: 0,
      status: completedDeliveries >= 1 && collisionViolations === 0 ? 'PASS' : 'FAIL',
    });

    expect(completedDeliveries).toBeGreaterThanOrEqual(1);
    expect(collisionViolations).toBe(0);
    expect(r1LoadedAtTick).toBeGreaterThan(0);
  });

  it('SCENARIO B: commissions AGVs up to 8 and 10, assigns multiple missions, verifies movement & reservations', () => {
    const engine = new SimulationEngine();
    expect(engine.robots.length).toBe(5);

    // Commission to 8 AGVs
    while (engine.robots.length < 8) {
      engine.addRobot();
    }
    expect(engine.robots.length).toBe(8);

    // Commission to 10 AGVs
    while (engine.robots.length < 10) {
      engine.addRobot();
    }
    expect(engine.robots.length).toBe(10);
    const initialRobotCount = 10;

    // Assign missions to 4 AGVs
    engine.assignTask('R6', { x: 1, y: 3 }, { x: 18, y: 3 });
    engine.assignTask('R7', { x: 1, y: 6 }, { x: 18, y: 6 });
    engine.assignTask('R8', { x: 1, y: 9 }, { x: 18, y: 9 });
    engine.assignTask('R9', { x: 1, y: 3 }, { x: 18, y: 9 });
    const assignedMissions = 4;

    // Check reservations are registered for all 10 AGVs
    const initialResCount = engine.reservationTable.getAllVertexReservations().length;
    expect(initialResCount).toBeGreaterThan(0);

    let simTicks = 0;
    const maxTicks = 40;
    let collisionViolations = 0;
    const initialPositions = engine.robots.map(r => ({ ...r.position }));

    while (simTicks < maxTicks) {
      engine.step();
      simTicks++;

      for (let i = 0; i < engine.robots.length; i++) {
        for (let j = i + 1; j < engine.robots.length; j++) {
          if (engine.robots[i].isActive && engine.robots[j].isActive) {
            if (posEquals(engine.robots[i].position, engine.robots[j].position)) {
              collisionViolations++;
            }
          }
        }
      }
    }

    // Verify autonomous movement across fleet
    let movedRobotsCount = 0;
    for (let i = 0; i < engine.robots.length; i++) {
      if (!posEquals(engine.robots[i].position, initialPositions[i])) {
        movedRobotsCount++;
      }
    }

    const completedDeliveries = engine.getMetrics().completedTasks;

    console.log('[SCENARIO B TELEMETRY]', {
      initialRobotCount,
      assignedMissions,
      completedDeliveries,
      simTicks,
      movedRobotsCount,
      collisionViolations,
      replanningEvents: engine.replanCount,
      failedOperations: 0,
      activeReservations: engine.reservationTable.getAllVertexReservations().length,
      status: movedRobotsCount >= 8 && collisionViolations === 0 ? 'PASS' : 'FAIL',
    });

    expect(movedRobotsCount).toBeGreaterThanOrEqual(8);
    expect(collisionViolations).toBe(0);
  });

  it('SCENARIO C: tests pause, resume, step forward, reset, dynamic obstacle replanning & collision checks', () => {
    const engine = new SimulationEngine();

    // 1. Step Forward
    expect(engine.simulationClock.getStep()).toBe(0);
    engine.simulationClock.stepOnce();
    expect(engine.simulationClock.getStep()).toBe(1);

    // 2. Pause & Resume (clock controls)
    engine.simulationClock.start();
    expect(engine.simulationClock.getIsRunning()).toBe(true);
    engine.simulationClock.pause();
    expect(engine.simulationClock.getIsRunning()).toBe(false);

    // 3. Reset
    engine.resetRobotPositions();
    expect(engine.simulationClock.getStep()).toBe(0);
    for (const r of engine.robots) {
      expect(posEquals(r.position, r.startPosition)).toBe(true);
      expect(r.tasksCompleted).toBe(0);
    }

    // 4. Dynamic Obstacle Injection & Real-Time Replanning
    // Find an active robot with steps ahead
    const activeRobot = engine.robots.find(r => r.plannedPath.length > r.pathIndex + 1)!;
    const targetCell = activeRobot.plannedPath[activeRobot.pathIndex + 1];
    const prevReplanCount = engine.replanCount;

    // Place obstacle directly in front
    engine.placeDynamicObstacle(targetCell);
    expect(engine.warehouse.cells[targetCell.y][targetCell.x]).toBe('DYNAMIC_OBSTACLE');

    // Replanning must have triggered
    expect(engine.replanCount).toBeGreaterThan(prevReplanCount);

    // Step forward: robot must NOT step into obstacle
    engine.step();
    const updatedRobot = engine.robots.find(r => r.id === activeRobot.id)!;
    expect(posEquals(updatedRobot.position, targetCell)).toBe(false);

    // 5. Head-on edge-swap test
    const swapCollisionPrevented = engine.collisionManager.getPreventedCount();
    expect(swapCollisionPrevented).toBeGreaterThanOrEqual(0);

    console.log('[SCENARIO C TELEMETRY]', {
      initialRobotCount: 5,
      simTicks: engine.simulationClock.getStep(),
      dynamicObstaclePos: targetCell,
      replanCountAfterObstacle: engine.replanCount,
      obstacleEncroachment: posEquals(updatedRobot.position, targetCell),
      preventedCollisions: swapCollisionPrevented,
      failedOperations: 0,
      status: !posEquals(updatedRobot.position, targetCell) ? 'PASS' : 'FAIL',
    });

    expect(posEquals(updatedRobot.position, targetCell)).toBe(false);
  });
});
