import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SimulationEngine } from '../simulation/simulationEngine';
import { posEquals, posKey } from '../utils/heuristics';
import {
  classifyAGVStarvation,
  generatePerAGVTelemetry,
  calculateFleetFairnessAnalysis,
  formatTelemetryCSV,
  DEFAULT_STARVATION_CONFIG,
  StarvationConfig,
} from '../utils/fairnessStarvation';
import { Robot } from '../types/robot';

describe('FAIRNESS, STARVATION, AND TRAFFIC-EFFICIENCY AUDIT', () => {
  it('TEST 1: verifies starvation classification boundaries and invalidates movement-at-least-once criterion', () => {
    const config: StarvationConfig = {
      temporaryCongestionMaxTicks: 15,
      prolongedWaitingMaxTicks: 30,
      starvationThresholdTicks: 60,
    };

    const baseRobot: Robot = {
      id: 'R_TEST',
      name: 'AGV-TEST',
      color: '#fff',
      position: { x: 5, y: 5 },
      startPosition: { x: 5, y: 5 },
      targetPosition: { x: 10, y: 10 },
      assignedPickup: { x: 5, y: 5 },
      assignedDelivery: { x: 10, y: 10 },
      status: 'WAITING',
      plannedPath: [],
      pathIndex: 0,
      priority: 5,
      priorityAge: 0,
      speed: 1,
      isActive: true,
      hasPayload: false,
      totalWaitSteps: 100,
      totalStepsMoved: 8, // Moved 8 times previously!
      tasksCompleted: 0,
      replanCount: 15,
      longestDurationWithoutMovement: 75, // But has been motionless for 75 ticks!
    };

    // Case A: Motionless duration 75 >= 60 -> CONFIRMED_STARVATION (even though it moved 8 times!)
    const classA = classifyAGVStarvation(baseRobot, config, false);
    expect(classA).toBe('CONFIRMED_STARVATION');

    // Case B: Motionless duration 45 (between 30 and 60) -> PROLONGED_WAITING
    const classB = classifyAGVStarvation(
      { ...baseRobot, longestDurationWithoutMovement: 45 },
      config,
      false
    );
    expect(classB).toBe('PROLONGED_WAITING');

    // Case C: Motionless duration 20 (between 15 and 30) -> TEMPORARY_CONGESTION
    const classC = classifyAGVStarvation(
      { ...baseRobot, longestDurationWithoutMovement: 20 },
      config,
      false
    );
    expect(classC).toBe('TEMPORARY_CONGESTION');

    // Case D: Motionless duration 5 (< 15) -> PROGRESSING
    const classD = classifyAGVStarvation(
      { ...baseRobot, longestDurationWithoutMovement: 5 },
      config,
      false
    );
    expect(classD).toBe('PROGRESSING');

    // Case E: Involves unresolvable deadlock cycle -> UNRESOLVED_DEADLOCK_CYCLE
    const classE = classifyAGVStarvation(baseRobot, config, true);
    expect(classE).toBe('UNRESOLVED_DEADLOCK_CYCLE');

    // Case F: Completed robot with no target -> PROGRESSING
    const classF = classifyAGVStarvation(
      { ...baseRobot, targetPosition: null, status: 'COMPLETED' },
      config,
      false
    );
    expect(classF).toBe('PROGRESSING');
  });

  it('TEST 2: verifies deadlock vs. stall distinction and separate telemetry fields', () => {
    const engine = new SimulationEngine();

    // Setup an isolated 2-robot reciprocal cycle
    engine.robots.splice(2); // keep 2 robots
    const r1 = engine.robots[0];
    const r2 = engine.robots[1];

    r1.position = { x: 5, y: 4 };
    r2.position = { x: 6, y: 4 };
    r1.plannedPath = [{ x: 5, y: 4, t: 0 }, { x: 6, y: 4, t: 1 }];
    r2.plannedPath = [{ x: 6, y: 4, t: 0 }, { x: 5, y: 4, t: 1 }];
    r1.pathIndex = 0;
    r2.pathIndex = 0;

    const cycleReport = engine.deadlockDetector.detectDeadlock(engine.robots, engine.reservationTable, 0);
    expect(cycleReport.cycleFound).toBe(true);
    expect(cycleReport.isStalled).toBe(true);

    // Setup isolated stall without cycle
    engine.deadlockDetector.reset();
    const rSingle = engine.robots[0];
    rSingle.status = 'WAITING';
    rSingle.plannedPath = [{ x: 5, y: 4, t: 0 }];
    rSingle.pathIndex = 0;

    // Simulate 3 ticks of waiting
    engine.deadlockDetector.recordStep(engine.robots);
    engine.deadlockDetector.recordStep(engine.robots);
    engine.deadlockDetector.recordStep(engine.robots);

    const stallReport = engine.deadlockDetector.detectDeadlock(engine.robots, engine.reservationTable, 3);
    expect(stallReport.cycleFound).toBe(false); // MUST NOT be classified as cycle!
    expect(stallReport.isStalled).toBe(true);   // Classified as stall alert!
  });

  it('TEST 3: executes 500-tick live simulation, performs per-tick safety validation, generates per-AGV fairness telemetry, and exports CSV', () => {
    const engine = new SimulationEngine();

    // Initialize full 10-robot fleet
    while (engine.robots.length < 10) {
      engine.addRobot();
    }
    expect(engine.robots.length).toBe(10);

    const simulationTicks = 500;
    let actualVertexCollisions = 0;
    let actualEdgeSwaps = 0;
    let obstaclePenetrations = 0;

    let previousStepPositions = new Map<string, { x: number; y: number }>();
    for (const r of engine.robots) {
      previousStepPositions.set(r.id, { x: r.position.x, y: r.position.y });
    }

    // Step loop with strict safety verification
    for (let step = 0; step < simulationTicks; step++) {
      engine.step();

      // SAFETY CHECK 1: Vertex Conflicts (No two robots occupy the same (x,y) cell at step t)
      const currentOccupancy = new Map<string, string[]>();
      for (const robot of engine.robots) {
        if (!robot.isActive) continue;
        const key = posKey(robot.position);
        if (!currentOccupancy.has(key)) {
          currentOccupancy.set(key, []);
        }
        currentOccupancy.get(key)!.push(robot.id);

        // SAFETY CHECK 2: Traversability (No robot enters an obstacle or shelf cell)
        if (!engine.isCellTraversable(robot.position)) {
          obstaclePenetrations++;
        }
      }

      for (const [pos, occupants] of currentOccupancy.entries()) {
        if (occupants.length > 1) {
          actualVertexCollisions++;
        }
      }

      // SAFETY CHECK 3: Edge-Swap Conflicts
      const robotList = engine.robots;
      for (let i = 0; i < robotList.length; i++) {
        for (let j = i + 1; j < robotList.length; j++) {
          const r1Id = robotList[i].id;
          const r2Id = robotList[j].id;
          const prev1 = previousStepPositions.get(r1Id);
          const prev2 = previousStepPositions.get(r2Id);
          const curr1 = robotList[i].position;
          const curr2 = robotList[j].position;

          if (prev1 && prev2) {
            if (
              !posEquals(prev1, curr1) &&
              !posEquals(prev2, curr2) &&
              posEquals(prev1, curr2) &&
              posEquals(prev2, curr1)
            ) {
              actualEdgeSwaps++;
            }
          }
        }
      }

      // Update previous positions
      for (const r of engine.robots) {
        previousStepPositions.set(r.id, { x: r.position.x, y: r.position.y });
      }
    }

    // Verify SAFETY INVARIANTS
    expect(actualVertexCollisions).toBe(0);
    expect(actualEdgeSwaps).toBe(0);
    expect(obstaclePenetrations).toBe(0);

    // Generate Per-AGV Telemetry
    const telemetryReports = generatePerAGVTelemetry(
      engine.robots,
      DEFAULT_STARVATION_CONFIG,
      []
    );

    // Generate Fleet Fairness & Traffic Efficiency Analysis
    const fleetAnalysis = calculateFleetFairnessAnalysis(
      engine.robots,
      telemetryReports,
      simulationTicks,
      engine.deadlockCount,
      engine.deadlockCyclesDetected,
      engine.replanCount,
      engine.unresolvedDeadlocks
    );

    // Export CSV
    const csvContent = formatTelemetryCSV(telemetryReports);
    const outputPath = path.resolve(process.cwd(), 'FAIRNESS_TELEMETRY.csv');
    fs.writeFileSync(outputPath, csvContent, 'utf-8');

    console.log('\n--- PER-AGV FAIRNESS & TRAFFIC TELEMETRY (500 TICKS) ---');
    console.table(
      telemetryReports.map(r => ({
        id: r.id,
        name: r.name,
        moves: r.totalMovements,
        deliveries: r.completedDeliveries,
        waitTicks: r.totalWaitingTicks,
        maxConsecWait: r.maxConsecutiveWaitTicks,
        longestMotionless: r.longestDurationWithoutMovement,
        succReplans: r.successfulReplans,
        failReplans: r.failedReplans,
        stallAlerts: r.stallAlertCount,
        status: r.currentStatus,
        starvationClass: r.starvationClassification,
      }))
    );

    console.log('\n--- FLEET-LEVEL FAIRNESS & TRAFFIC EFFICIENCY ANALYSIS ---');
    console.log(`Simulation Horizon:           ${fleetAnalysis.simulationTicks} ticks`);
    console.log(`Total Robots:                 ${fleetAnalysis.totalRobots}`);
    console.log(`Total Completed Deliveries:   ${fleetAnalysis.totalDeliveries}`);
    console.log(`Fleet Delivery Throughput:    ${fleetAnalysis.fleetThroughputDeliveriesPerTick} deliveries/tick`);
    console.log(`Total Replanning Actions:     ${fleetAnalysis.totalReplans}`);
    console.log(`Replanning Intensity:         ${fleetAnalysis.replansPerTick} replans/tick`);
    console.log(`Total Stall Alerts:           ${fleetAnalysis.totalStallAlerts}`);
    console.log(`Total Deadlock Cycle Episodes:${fleetAnalysis.totalCycleEpisodes}`);
    console.log(`Unresolved Stalls / Deadlocks:${fleetAnalysis.unresolvedDeadlocks}`);
    console.log(`Jain's Index (Deliveries):    ${fleetAnalysis.jainIndexDeliveries}`);
    console.log(`Jain's Index (Movements):     ${fleetAnalysis.jainIndexMovements}`);
    console.log(`Jain's Index (Wait Ticks):    ${fleetAnalysis.jainIndexWaiting}`);
    console.log(`Waiting Time Range:           [${fleetAnalysis.waitingDistribution.min}, ${fleetAnalysis.waitingDistribution.max}] ticks`);
    console.log(`Waiting Time Median:          ${fleetAnalysis.waitingDistribution.median} ticks`);
    console.log(`Waiting Time Mean ± StdDev:   ${fleetAnalysis.waitingDistribution.mean} ± ${fleetAnalysis.waitingDistribution.stdDev} ticks`);
    console.log('Starvation Class Counts:      ', fleetAnalysis.classificationCounts);

    // Verify CSV file exists and is populated
    expect(fs.existsSync(outputPath)).toBe(true);
    const savedCsv = fs.readFileSync(outputPath, 'utf-8');
    expect(savedCsv.split('\n').length).toBe(11); // header + 10 robots

    // Basic validity assertions
    expect(fleetAnalysis.totalDeliveries).toBeGreaterThanOrEqual(0);
    expect(fleetAnalysis.totalReplans).toBeGreaterThan(0);
  }, 180000);
});
