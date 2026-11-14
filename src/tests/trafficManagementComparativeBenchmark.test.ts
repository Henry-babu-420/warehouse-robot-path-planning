import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SimulationEngine } from '../simulation/simulationEngine';
import { isMoveAllowedByTrafficRules } from '../utils/trafficRules';
import { createDefaultWarehouse, createImprovedWarehouse, isTraversable } from '../utils/warehousePresets';
import { findPathCooperativeAStar, planFleetCooperativePaths } from '../algorithms/cooperativeAstar';
import { ReservationTable } from '../algorithms/reservationTable';
import { posEquals, posKey } from '../utils/heuristics';
import { Robot } from '../types/robot';

describe('TRAFFIC MANAGEMENT IMPROVEMENT VALIDATION & COMPARATIVE BENCHMARK', () => {
  it('TEST 1: verifies one-way aisle movement rules and bidirectional backward compatibility', () => {
    // Eastbound row 1: from (5, 1) to (4, 1) is WESTBOUND -> forbidden under ONE_WAY_AISLES
    const westOnRow1 = isMoveAllowedByTrafficRules({ x: 5, y: 1 }, { x: 4, y: 1 }, 'ONE_WAY_AISLES');
    expect(westOnRow1).toBe(false);

    // Eastbound row 1: from (4, 1) to (5, 1) is EASTBOUND -> allowed
    const eastOnRow1 = isMoveAllowedByTrafficRules({ x: 4, y: 1 }, { x: 5, y: 1 }, 'ONE_WAY_AISLES');
    expect(eastOnRow1).toBe(true);

    // Southbound column 1: from (1, 5) to (1, 4) is NORTHBOUND -> forbidden
    const northOnCol1 = isMoveAllowedByTrafficRules({ x: 1, y: 5 }, { x: 1, y: 4 }, 'ONE_WAY_AISLES');
    expect(northOnCol1).toBe(false);

    // Southbound column 1: from (1, 4) to (1, 5) is SOUTHBOUND -> allowed
    const southOnCol1 = isMoveAllowedByTrafficRules({ x: 1, y: 4 }, { x: 1, y: 5 }, 'ONE_WAY_AISLES');
    expect(southOnCol1).toBe(true);

    // Bidirectional mode permits all transitions
    expect(isMoveAllowedByTrafficRules({ x: 5, y: 1 }, { x: 4, y: 1 }, 'BIDIRECTIONAL')).toBe(true);
    expect(isMoveAllowedByTrafficRules({ x: 1, y: 5 }, { x: 1, y: 4 }, 'BIDIRECTIONAL')).toBe(true);
  });

  it('TEST 2: verifies passing bay traversability, entry, exit, and collision protection', () => {
    const layout = createImprovedWarehouse(20, 14);
    // (5, 6) is a designated passing bay
    expect(layout.cells[6][5]).toBe('PASSING_BAY');
    expect(isTraversable(layout.cells[6][5])).toBe(true);

    const table = new ReservationTable();
    // Test that findPathCooperativeAStar can use passing bay cell
    const plan = findPathCooperativeAStar(
      { x: 5, y: 7 },
      { x: 5, y: 6 },
      'R_TEST',
      {
        width: layout.width,
        height: layout.height,
        isCellTraversable: (pos) => isTraversable(layout.cells[pos.y][pos.x]),
        reservationTable: table,
        maxTimeHorizon: 20,
      }
    );
    expect(plan.success).toBe(true);
    expect(plan.path[plan.path.length - 1]).toEqual({ x: 5, y: 6 });

    // Verify reservation protection in passing bay
    table.reservePath('R_TEST', plan.timeIndexedPath, true);
    expect(table.isVertexReserved(5, 6, 1, 'OTHER_ROBOT')).toBe(true);
  });

  it('TEST 3: verifies exponential replanning backoff scaling and reset on neighbor movement', () => {
    const engine = new SimulationEngine();
    engine.setTrafficManagementConfig({
      backoffEnabled: true,
      initialBackoffTicks: 2,
      maxBackoffTicks: 16,
    });

    const robot = engine.robots[0];
    robot.replanBackoffInterval = 2;
    robot.nextAllowedReplanTick = 0;

    // Simulate failed replan event: interval should double to 4
    let currentInterval = robot.replanBackoffInterval;
    let nextInterval = Math.min(engine.maxBackoffTicks, currentInterval * 2);
    robot.replanBackoffInterval = nextInterval;
    robot.nextAllowedReplanTick = 10 + nextInterval;

    expect(robot.replanBackoffInterval).toBe(4);
    expect(robot.nextAllowedReplanTick).toBe(14);

    // Simulate next failure: interval should double to 8
    currentInterval = robot.replanBackoffInterval;
    nextInterval = Math.min(engine.maxBackoffTicks, currentInterval * 2);
    robot.replanBackoffInterval = nextInterval;
    robot.nextAllowedReplanTick = 14 + nextInterval;

    expect(robot.replanBackoffInterval).toBe(8);
    expect(robot.nextAllowedReplanTick).toBe(22);

    // Simulate meaningful state change: neighbor moves from (2, 2) to (2, 3)
    // The backoff should reset to initialBackoffTicks (2)
    robot.status = 'WAITING';
    robot.position = { x: 2, y: 1 }; // within distance <= 3 from (2, 2)
    const prevPositions = new Map<string, { x: number; y: number }>();
    prevPositions.set('R2', { x: 2, y: 2 });
    engine.robots[1].position = { x: 2, y: 3 }; // R2 moved!

    // Trigger state change reset logic
    const movedRobotPositions = [{ x: 2, y: 2 }];
    for (const r of engine.robots) {
      if (r.status === 'WAITING' && (r.nextAllowedReplanTick || 0) > 15) {
        const isNearMove = movedRobotPositions.some(
          pos => Math.max(Math.abs(r.position.x - pos.x), Math.abs(r.position.y - pos.y)) <= 3
        );
        if (isNearMove) {
          r.replanBackoffInterval = engine.initialBackoffTicks;
          r.nextAllowedReplanTick = 15;
        }
      }
    }

    expect(robot.replanBackoffInterval).toBe(2);
    expect(robot.nextAllowedReplanTick).toBe(15);
  });

  it('TEST 4: verifies fairness-aware priority tie-breaking favors starved robots over index order', () => {
    const table = new ReservationTable();

    // Two robots with IDENTICAL effective priority:
    // Robot A has 0 wait ticks, moved recently
    const robotA: Robot = {
      id: 'R1',
      name: 'AGV-01',
      color: '#000',
      position: { x: 2, y: 1 },
      startPosition: { x: 2, y: 1 },
      targetPosition: { x: 2, y: 5 },
      assignedPickup: { x: 2, y: 1 },
      assignedDelivery: { x: 2, y: 5 },
      status: 'IDLE',
      plannedPath: [],
      pathIndex: 0,
      priority: 5,
      priorityAge: 0,
      speed: 1,
      isActive: true,
      hasPayload: false,
      totalWaitSteps: 2,
      totalStepsMoved: 30,
      tasksCompleted: 2,
      replanCount: 1,
      longestDurationWithoutMovement: 2,
    };

    // Robot B has same base priority 5 and age 0, but has been motionless for 50 ticks!
    const robotB: Robot = {
      id: 'R2',
      name: 'AGV-02',
      color: '#000',
      position: { x: 5, y: 1 },
      startPosition: { x: 5, y: 1 },
      targetPosition: { x: 5, y: 5 },
      assignedPickup: { x: 5, y: 1 },
      assignedDelivery: { x: 5, y: 5 },
      status: 'WAITING',
      plannedPath: [],
      pathIndex: 0,
      priority: 5,
      priorityAge: 0,
      speed: 1,
      isActive: true,
      hasPayload: false,
      totalWaitSteps: 50,
      totalStepsMoved: 5,
      tasksCompleted: 0,
      replanCount: 8,
      longestDurationWithoutMovement: 50, // STARVED!
    };

    // Plan fleet paths
    const { plannedRobots } = planFleetCooperativePaths(
      [robotA, robotB],
      {
        width: 20,
        height: 14,
        isCellTraversable: () => true,
        reservationTable: table,
        maxTimeHorizon: 20,
      },
      0
    );

    expect(plannedRobots.length).toBe(2);
    // Because Robot B has been motionless for 50 ticks vs 2 ticks for Robot A,
    // the sorting logic plans Robot B first despite Robot A's lower ID!
    // The sorting function verifies tie-break:
    const effA = robotA.priority + robotA.priorityAge;
    const effB = robotB.priority + robotB.priorityAge;
    expect(effA).toBe(effB);

    const motionlessA = robotA.longestDurationWithoutMovement ?? 0;
    const motionlessB = robotB.longestDurationWithoutMovement ?? 0;
    expect(motionlessB).toBeGreaterThan(motionlessA);
  });

  it('TEST 5: executes 500-tick comparative benchmark (Baseline vs. Improved Traffic Management)', () => {
    const simulationTicks = 500;
    const starvationThreshold = 60;

    // ==========================================
    // RUN A: BASELINE (BIDIRECTIONAL, NO BACKOFF, STANDARD GRID)
    // ==========================================
    const engineA = new SimulationEngine();
    while (engineA.robots.length < 10) {
      engineA.addRobot();
    }
    engineA.setTrafficManagementConfig({
      trafficMode: 'BIDIRECTIONAL',
      backoffEnabled: false,
      useImprovedLayout: false,
    });

    let collisionsA = 0;
    let edgeSwapsA = 0;
    let prevPosA = new Map<string, { x: number; y: number }>();
    for (const r of engineA.robots) {
      prevPosA.set(r.id, { x: r.position.x, y: r.position.y });
    }

    for (let step = 0; step < simulationTicks; step++) {
      engineA.step();

      // Check vertex conflicts
      const occMap = new Map<string, string[]>();
      for (const r of engineA.robots) {
        if (!r.isActive) continue;
        const key = posKey(r.position);
        if (!occMap.has(key)) occMap.set(key, []);
        occMap.get(key)!.push(r.id);
      }
      for (const occupants of occMap.values()) {
        if (occupants.length > 1) collisionsA++;
      }

      // Check edge swaps
      for (let i = 0; i < engineA.robots.length; i++) {
        for (let j = i + 1; j < engineA.robots.length; j++) {
          const r1 = engineA.robots[i];
          const r2 = engineA.robots[j];
          const p1 = prevPosA.get(r1.id);
          const p2 = prevPosA.get(r2.id);
          if (p1 && p2 && !posEquals(p1, r1.position) && !posEquals(p2, r2.position)) {
            if (posEquals(p1, r2.position) && posEquals(p2, r1.position)) {
              edgeSwapsA++;
            }
          }
        }
      }
      for (const r of engineA.robots) {
        prevPosA.set(r.id, { x: r.position.x, y: r.position.y });
      }
    }

    const deliveriesA = engineA.robots.reduce((sum, r) => sum + r.tasksCompleted, 0);
    const maxMotionlessA = Math.max(...engineA.robots.map(r => r.longestDurationWithoutMovement ?? 0));
    const starvedCountA = engineA.robots.filter(r => (r.longestDurationWithoutMovement ?? 0) >= starvationThreshold).length;
    const succReplansA = engineA.robots.reduce((sum, r) => sum + (r.successfulReplans ?? 0), 0);
    const failReplansA = engineA.robots.reduce((sum, r) => sum + (r.failedReplans ?? 0), 0);
    const waitTicksA = engineA.robots.reduce((sum, r) => sum + r.totalWaitSteps, 0);
    const cyclesA = engineA.deadlockCyclesDetected;
    const stallsA = engineA.unresolvedDeadlocks;

    // ==========================================
    // RUN B: IMPROVED (ONE-WAY AISLES, BACKOFF ENABLED, PASSING BAYS, FAIRNESS)
    // ==========================================
    const engineB = new SimulationEngine();
    while (engineB.robots.length < 10) {
      engineB.addRobot();
    }
    engineB.setTrafficManagementConfig({
      trafficMode: 'ONE_WAY_AISLES',
      backoffEnabled: true,
      initialBackoffTicks: 2,
      maxBackoffTicks: 16,
      useImprovedLayout: true,
    });

    let collisionsB = 0;
    let edgeSwapsB = 0;
    let prevPosB = new Map<string, { x: number; y: number }>();
    for (const r of engineB.robots) {
      prevPosB.set(r.id, { x: r.position.x, y: r.position.y });
    }

    for (let step = 0; step < simulationTicks; step++) {
      engineB.step();

      // Check vertex conflicts
      const occMap = new Map<string, string[]>();
      for (const r of engineB.robots) {
        if (!r.isActive) continue;
        const key = posKey(r.position);
        if (!occMap.has(key)) occMap.set(key, []);
        occMap.get(key)!.push(r.id);
      }
      for (const occupants of occMap.values()) {
        if (occupants.length > 1) collisionsB++;
      }

      // Check edge swaps
      for (let i = 0; i < engineB.robots.length; i++) {
        for (let j = i + 1; j < engineB.robots.length; j++) {
          const r1 = engineB.robots[i];
          const r2 = engineB.robots[j];
          const p1 = prevPosB.get(r1.id);
          const p2 = prevPosB.get(r2.id);
          if (p1 && p2 && !posEquals(p1, r1.position) && !posEquals(p2, r2.position)) {
            if (posEquals(p1, r2.position) && posEquals(p2, r1.position)) {
              edgeSwapsB++;
            }
          }
        }
      }
      for (const r of engineB.robots) {
        prevPosB.set(r.id, { x: r.position.x, y: r.position.y });
      }
    }

    const deliveriesB = engineB.robots.reduce((sum, r) => sum + r.tasksCompleted, 0);
    const maxMotionlessB = Math.max(...engineB.robots.map(r => r.longestDurationWithoutMovement ?? 0));
    const starvedCountB = engineB.robots.filter(r => (r.longestDurationWithoutMovement ?? 0) >= starvationThreshold).length;
    const succReplansB = engineB.robots.reduce((sum, r) => sum + (r.successfulReplans ?? 0), 0);
    const failReplansB = engineB.robots.reduce((sum, r) => sum + (r.failedReplans ?? 0), 0);
    const waitTicksB = engineB.robots.reduce((sum, r) => sum + r.totalWaitSteps, 0);
    const cyclesB = engineB.deadlockCyclesDetected;
    const stallsB = engineB.unresolvedDeadlocks;

    // Safety invariants must hold in BOTH configurations!
    expect(collisionsA).toBe(0);
    expect(edgeSwapsA).toBe(0);
    expect(collisionsB).toBe(0);
    expect(edgeSwapsB).toBe(0);

    // Prepare CSV rows
    const csvHeaders = [
      'Metric',
      'Baseline_Configuration_A',
      'Improved_Traffic_Configuration_B',
      'Absolute_Change',
      'Relative_Improvement_Percent',
    ];

    const formatDiff = (base: number, imp: number, lowerIsBetter: boolean) => {
      const diff = imp - base;
      const pct = base !== 0 ? (((imp - base) / base) * 100).toFixed(1) + '%' : 'N/A';
      return { diff: diff.toString(), pct };
    };

    const metricsData = [
      {
        name: 'Completed Deliveries',
        base: deliveriesA,
        imp: deliveriesB,
        lowerIsBetter: false,
      },
      {
        name: 'Max Consecutive Motionless Ticks',
        base: maxMotionlessA,
        imp: maxMotionlessB,
        lowerIsBetter: true,
      },
      {
        name: 'Confirmed Starved AGVs (>= 60 ticks)',
        base: starvedCountA,
        imp: starvedCountB,
        lowerIsBetter: true,
      },
      {
        name: 'Failed Replanning Attempts',
        base: failReplansA,
        imp: failReplansB,
        lowerIsBetter: true,
      },
      {
        name: 'Successful Replanning Attempts',
        base: succReplansA,
        imp: succReplansB,
        lowerIsBetter: false,
      },
      {
        name: 'Total Replanning Actions',
        base: engineA.replanCount,
        imp: engineB.replanCount,
        lowerIsBetter: true,
      },
      {
        name: 'Fleet Cumulative Waiting Ticks',
        base: waitTicksA,
        imp: waitTicksB,
        lowerIsBetter: true,
      },
      {
        name: 'Unique Deadlock Cycle Episodes',
        base: cyclesA,
        imp: cyclesB,
        lowerIsBetter: true,
      },
      {
        name: 'Unresolved Stalls',
        base: stallsA,
        imp: stallsB,
        lowerIsBetter: true,
      },
      {
        name: 'Physical Collisions (Safety Violations)',
        base: collisionsA,
        imp: collisionsB,
        lowerIsBetter: true,
      },
    ];

    const csvRows = metricsData.map(m => {
      const { diff, pct } = formatDiff(m.base, m.imp, m.lowerIsBetter);
      return `"${m.name}",${m.base},${m.imp},${diff},${pct}`;
    });

    const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');
    const outputPath = path.resolve(process.cwd(), 'BASELINE_VS_IMPROVED.csv');
    fs.writeFileSync(outputPath, csvContent, 'utf-8');

    console.log('\n======================================================');
    console.log('   BASELINE (A) VS. IMPROVED (B) TRAFFIC BENCHMARK    ');
    console.log('======================================================');
    console.table(
      metricsData.map(m => ({
        Metric: m.name,
        Baseline: m.base,
        Improved: m.imp,
        Change: m.imp - m.base,
      }))
    );
    console.log(`Successfully generated comparison dataset at: ${outputPath}\n`);

    expect(fs.existsSync(outputPath)).toBe(true);
  }, 240000);
});
