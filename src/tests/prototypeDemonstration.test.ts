import { describe, it, expect } from 'vitest';
import { SimulationEngine } from '../simulation/simulationEngine';
import { posEquals } from '../utils/heuristics';
import { isTraversable } from '../utils/warehousePresets';

describe('Prototype Demonstration & Working Prototype Verification', () => {
  it('MODULE 1 (Overview) & FLEET INITIALIZATION: starts with 5 AGVs on 20x14 grid with live metrics matching actual state', () => {
    const engine = new SimulationEngine();

    // Verify grid dimensions
    expect(engine.warehouse.width).toBe(20);
    expect(engine.warehouse.height).toBe(14);

    // Verify initial fleet count is 5 AGVs
    expect(engine.robots.length).toBe(5);
    const expectedIds = ['R1', 'R2', 'R3', 'R4', 'R5'];
    expect(engine.robots.map(r => r.id)).toEqual(expectedIds);

    // Verify all 5 robots have planned paths and space-time reservations
    for (const robot of engine.robots) {
      expect(robot.isActive).toBe(true);
      expect(robot.plannedPath.length).toBeGreaterThan(0);
      expect(robot.targetPosition).not.toBeNull();
      expect(robot.assignedPickup).not.toBeNull();
      expect(robot.assignedDelivery).not.toBeNull();
    }

    // Verify space-time reservations exist for all 5 robots
    const allVertexRes = engine.reservationTable.getAllVertexReservations();
    expect(allVertexRes.length).toBeGreaterThan(0);
    for (const id of expectedIds) {
      const robotRes = allVertexRes.filter(r => r.robotId === id);
      expect(robotRes.length).toBeGreaterThan(0);
    }

    // Verify live overview metrics reflect true initial state
    const metrics = engine.getMetrics();
    expect(metrics.totalRobots).toBe(5);
    expect(metrics.activeRobots).toBe(5);
    expect(metrics.completedTasks).toBe(0);
    expect(metrics.collisionAttemptsPrevented).toBe(0);
    expect(engine.simulationClock.getStep()).toBe(0);
  });

  it('MODULE 2 (Warehouse Layout): supports layout presets, dimension updates, and passing bay traversal', () => {
    const engine = new SimulationEngine();

    // 1. Switch to Improved Layout (Configuration B)
    engine.setTrafficManagementConfig({ useImprovedLayout: true });
    expect(engine.warehouse.cells[6][5]).toBe('PASSING_BAY');
    expect(engine.warehouse.cells[6][7]).toBe('PASSING_BAY');
    expect(isTraversable(engine.warehouse.cells[6][5])).toBe(true);

    // 2. Switch to Dual-Lane Layout (Configuration C)
    engine.setTrafficManagementConfig({ useDualLaneLayout: true });
    expect(engine.warehouse.width).toBe(20);
    expect(engine.warehouse.height).toBe(14);
    // In dual-lane layout, columns 2 and 3 are open travel corridors
    expect(engine.warehouse.cells[4][2]).toBe('EMPTY');
    expect(engine.warehouse.cells[4][3]).toBe('EMPTY');

    // 3. Restore Standard Baseline
    engine.resetWarehouse();
    expect(engine.warehouse.cells[6][5]).toBe('EMPTY');
    expect(engine.robots.length).toBe(5);
  });

  it('MODULE 3 (Robot Fleet): commissions up to 10 AGVs with uniform naming, allows toggling, and resets cleanly', () => {
    const engine = new SimulationEngine();
    expect(engine.robots.length).toBe(5);

    // Commission AGVs up to 10
    while (engine.robots.length < 10) {
      const newRobot = engine.addRobot();
      expect(newRobot).not.toBeNull();
    }
    expect(engine.robots.length).toBe(10);
    expect(engine.robots.map(r => r.name)).toEqual([
      'AGV-01', 'AGV-02', 'AGV-03', 'AGV-04', 'AGV-05',
      'AGV-06', 'AGV-07', 'AGV-08', 'AGV-09', 'AGV-10'
    ]);

    // Safety limit: 11th robot must be rejected
    const extraRobot = engine.addRobot();
    expect(extraRobot).toBeNull();
    expect(engine.robots.length).toBe(10);

    // Toggle active state on AGV-10
    const agv10 = engine.robots.find(r => r.name === 'AGV-10')!;
    engine.toggleRobotActive(agv10.id);
    expect(agv10.isActive).toBe(false);
    expect(agv10.plannedPath.length).toBe(0);

    // Reactivate AGV-10 and replan
    engine.toggleRobotActive(agv10.id);
    engine.planFleetPaths();
    const reactivatedAgv10 = engine.robots.find(r => r.name === 'AGV-10')!;
    expect(reactivatedAgv10.isActive).toBe(true);
    expect(reactivatedAgv10.plannedPath.length).toBeGreaterThan(0);

    // Reset fleet positions and verify complete state restoration
    engine.resetRobotPositions();
    expect(engine.simulationClock.getStep()).toBe(0);
    for (const r of engine.robots) {
      expect(posEquals(r.position, r.startPosition)).toBe(true);
      expect(r.tasksCompleted).toBe(0);
      expect(r.totalWaitSteps).toBe(0);
    }
  });

  it('MODULE 4 (Task Dispatcher): assigns and completes custom pickup and delivery transport missions end to end', () => {
    const engine = new SimulationEngine();

    // Assign custom task to R1: Pickup at P1 (1, 3), Delivery at D1 (18, 3)
    const p1Pos = { x: 1, y: 3 };
    const d1Pos = { x: 18, y: 3 };
    engine.assignTask('R1', p1Pos, d1Pos);

    const r1 = engine.robots.find(r => r.id === 'R1')!;
    expect(posEquals(r1.assignedPickup!, p1Pos)).toBe(true);
    expect(posEquals(r1.assignedDelivery!, d1Pos)).toBe(true);
    expect(posEquals(r1.targetPosition!, p1Pos)).toBe(true);
    expect(r1.hasPayload).toBe(false);

    // Step simulation until at least 1 mission is completed by the fleet
    let ticks = 0;
    const maxTicks = 150;
    while (ticks < maxTicks && engine.getMetrics().completedTasks === 0) {
      engine.step();
      ticks++;
    }

    expect(engine.getMetrics().completedTasks).toBeGreaterThanOrEqual(1);
  });

  it('MODULE 5 & 6 (Path Planning & Collision Avoidance): maintains 100% collision-free execution and replans on dynamic obstacle', () => {
    const engine = new SimulationEngine();

    // Run 5-AGV simulation for 60 ticks and verify zero physical collision violations
    for (let t = 0; t < 60; t++) {
      engine.step();

      // Check vertex collisions between any two robots
      for (let i = 0; i < engine.robots.length; i++) {
        for (let j = i + 1; j < engine.robots.length; j++) {
          const rA = engine.robots[i];
          const rB = engine.robots[j];
          if (rA.isActive && rB.isActive) {
            expect(posEquals(rA.position, rB.position)).toBe(false);
          }
        }
      }
    }

    // Dynamic Obstacle Test: Drop dynamic obstacle in front of an active robot's next step
    const activeRobot = engine.robots.find(r => r.plannedPath.length > r.pathIndex + 1)!;
    const obstacleCell = activeRobot.plannedPath[activeRobot.pathIndex + 1];

    // Place dynamic obstacle
    engine.placeDynamicObstacle(obstacleCell);
    expect(engine.warehouse.cells[obstacleCell.y][obstacleCell.x]).toBe('DYNAMIC_OBSTACLE');

    // Robot must immediately replan without stepping into the obstacle cell
    engine.step();
    const updatedRobot = engine.robots.find(r => r.id === activeRobot.id)!;
    expect(posEquals(updatedRobot.position, obstacleCell)).toBe(false);
  });

  it('MODULE 7 (Performance Analysis): benchmark experiment generates valid data separate from live metrics', () => {
    const engine = new SimulationEngine();

    // Verify live metrics initial state
    expect(engine.simulationClock.getStep()).toBe(0);

    // Run benchmark experiment suite (fleet sizes 1, 2, 4, 6, 8, 10)
    const benchmarkResults = engine.runBenchmarkExperiment();
    expect(benchmarkResults.length).toBe(6);
    expect(benchmarkResults.map(b => b.robotCount)).toEqual([1, 2, 4, 6, 8, 10]);

    for (const pt of benchmarkResults) {
      expect(pt.planningTimeMs).toBeGreaterThanOrEqual(0);
      expect(pt.expandedNodes).toBeGreaterThanOrEqual(0);
      expect(pt.taskCompletionSteps).toBeGreaterThanOrEqual(0);
    }

    // Verify live engine state was restored cleanly after benchmark run
    const liveMetricsAfter = engine.getMetrics();
    expect(liveMetricsAfter.totalRobots).toBe(5);
    expect(engine.simulationClock.getStep()).toBe(0);
  });

  it('MODULE 8 (Settings & Playback Controls): controls simulation clock and toggles traffic policies', () => {
    const engine = new SimulationEngine();

    // Simulation Clock playback controls
    expect(engine.simulationClock.getIsRunning()).toBe(false);
    expect(engine.simulationClock.getStep()).toBe(0);

    // Step once
    engine.simulationClock.stepOnce();
    expect(engine.simulationClock.getStep()).toBe(1);

    // Set speed to 200ms
    engine.simulationClock.setSpeed(200);
    expect(engine.simulationClock.getIntervalMs()).toBe(200);

    // Toggle Traffic Policies
    engine.setTrafficManagementConfig({
      trafficMode: 'ONE_WAY_AISLES',
      backoffEnabled: true,
      initialBackoffTicks: 2,
      maxBackoffTicks: 16,
    });

    expect(engine.trafficMode).toBe('ONE_WAY_AISLES');
    expect(engine.backoffEnabled).toBe(true);

    // Reset clock and positions
    engine.simulationClock.reset();
    expect(engine.simulationClock.getStep()).toBe(0);
  });
});
