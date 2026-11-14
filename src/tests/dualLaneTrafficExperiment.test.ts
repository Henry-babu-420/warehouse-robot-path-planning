import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SimulationEngine } from '../simulation/simulationEngine';
import { createDefaultWarehouse, createImprovedWarehouse, createDualLaneWarehouse, isTraversable } from '../utils/warehousePresets';
import { findPathCooperativeAStar } from '../algorithms/cooperativeAstar';
import { ReservationTable } from '../algorithms/reservationTable';
import { posEquals, posKey } from '../utils/heuristics';
import { Robot } from '../types/robot';

describe('DUAL-LANE CORRIDORS & STATION BYPASS EXPERIMENT', () => {
  it('TEST 1: verifies passing bay traversability, entry, exit, and identifies corridor-blocking vs off-lane bays', () => {
    // 1. Check improved warehouse passing bays (original 12)
    const improvedLayout = createImprovedWarehouse(20, 14);
    const origPassingBays = [
      { x: 5, y: 6 }, { x: 7, y: 6 }, { x: 12, y: 6 }, { x: 14, y: 6 },
      { x: 6, y: 7 }, { x: 13, y: 7 },
      { x: 5, y: 2 }, { x: 9, y: 2 }, { x: 14, y: 2 },
      { x: 5, y: 11 }, { x: 9, y: 11 }, { x: 14, y: 11 },
    ];

    for (const pos of origPassingBays) {
      expect(improvedLayout.cells[pos.y][pos.x]).toBe('PASSING_BAY');
      expect(isTraversable(improvedLayout.cells[pos.y][pos.x])).toBe(true);
    }

    // Architectural analysis: (5, 6) is in the single-width row 6 transit aisle.
    // If a robot dwells in (5, 6), through-travel across row 6 is blocked!
    // 2. Check dual-lane warehouse passing bays (off-corridor turnout bays)
    const dualLaneLayout = createDualLaneWarehouse(20, 14);
    const turnoutBays = [
      { x: 4, y: 3 }, { x: 15, y: 3 },
      { x: 4, y: 10 }, { x: 15, y: 10 },
      { x: 7, y: 6 }, { x: 8, y: 7 },
      { x: 11, y: 6 }, { x: 12, y: 7 },
    ];

    for (const pos of turnoutBays) {
      expect(dualLaneLayout.cells[pos.y][pos.x]).toBe('PASSING_BAY');
      expect(isTraversable(dualLaneLayout.cells[pos.y][pos.x])).toBe(true);
    }

    // Test entry, dwell, and exit from an off-lane turnout bay at (4, 3)
    const table = new ReservationTable();
    const entryPlan = findPathCooperativeAStar(
      { x: 3, y: 3 }, // Inbound bypass lane
      { x: 4, y: 3 }, // Turnout passing bay
      'R1',
      {
        width: dualLaneLayout.width,
        height: dualLaneLayout.height,
        isCellTraversable: (p) => isTraversable(dualLaneLayout.cells[p.y][p.x]),
        reservationTable: table,
        maxTimeHorizon: 10,
      }
    );
    expect(entryPlan.success).toBe(true);
    expect(entryPlan.path[entryPlan.path.length - 1]).toEqual({ x: 4, y: 3 });

    // Reserve dwell in passing bay
    table.reservePath('R1', entryPlan.timeIndexedPath, true);

    // Verify exit back to travel lane
    const exitPlan = findPathCooperativeAStar(
      { x: 4, y: 3 },
      { x: 3, y: 3 },
      'R1',
      {
        width: dualLaneLayout.width,
        height: dualLaneLayout.height,
        isCellTraversable: (p) => isTraversable(dualLaneLayout.cells[p.y][p.x]),
        reservationTable: table,
        startTime: 2,
        maxTimeHorizon: 10,
      }
    );
    expect(exitPlan.success).toBe(true);
  });

  it('TEST 2: verifies station bypass lanes prevent dwell blockage during loading and unloading', () => {
    const dualLane = createDualLaneWarehouse(20, 14);
    const table = new ReservationTable();

    // Robot R1 is parked and dwelling at Inbound Bay P1 (1, 3)
    table.reservePath('R1', [{ x: 1, y: 3, t: 0 }, { x: 1, y: 3, t: 1 }, { x: 1, y: 3, t: 2 }, { x: 1, y: 3, t: 3 }], true);

    // Robot R2 travels South from (2, 1) down to (2, 5)
    // Thanks to the parallel bypass lane at x=2 and x=3, R2 is NOT blocked by R1 at (1, 3)!
    const bypassPlan = findPathCooperativeAStar(
      { x: 2, y: 1 },
      { x: 2, y: 5 },
      'R2',
      {
        width: dualLane.width,
        height: dualLane.height,
        isCellTraversable: (p) => isTraversable(dualLane.cells[p.y][p.x]),
        reservationTable: table,
        maxTimeHorizon: 15,
      }
    );

    expect(bypassPlan.success).toBe(true);
    // Verified that R2 passed through y=3 via column 2 while R1 was at column 1
    const stepAtY3 = bypassPlan.path.find(p => p.y === 3);
    expect(stepAtY3).toBeDefined();
    expect(stepAtY3?.x).toBe(2); // Passed unobstructed!
  });

  it('TEST 3: verifies safe dynamic overtaking in 2-cell-wide corridors without collision', () => {
    const dualLane = createDualLaneWarehouse(20, 14);
    const table = new ReservationTable();

    // In central Eastbound corridor (rows 6 and 7), Robot R1 is stopped at (9, 7)
    table.reservePath('R1', [{ x: 9, y: 7, t: 0 }, { x: 9, y: 7, t: 1 }, { x: 9, y: 7, t: 2 }, { x: 9, y: 7, t: 3 }], true);

    // Robot R2 starts at (8, 7) and wants to travel to (11, 7)
    // In a single-width aisle, R2 would be blocked. In 2-cell corridor, R2 branches to row 6 to overtake!
    const overtakePlan = findPathCooperativeAStar(
      { x: 8, y: 7 },
      { x: 11, y: 7 },
      'R2',
      {
        width: dualLane.width,
        height: dualLane.height,
        isCellTraversable: (p) => isTraversable(dualLane.cells[p.y][p.x]),
        reservationTable: table,
        maxTimeHorizon: 15,
      }
    );

    expect(overtakePlan.success).toBe(true);
    // Verify R2 safely bypassed R1 without stepping on (9, 7)
    const touchesR1Cell = overtakePlan.path.some(p => p.x === 9 && p.y === 7);
    expect(touchesR1Cell).toBe(false);
  });

  it('TEST 4: executes 500-tick comparative experiment across Configuration A, B, and C', () => {
    const ticks = 500;
    const starvationThreshold = 60;

    // Helper runner for a configuration
    const runSimulation = (configType: 'BASELINE' | 'IMPROVED' | 'DUAL_LANE') => {
      const engine = new SimulationEngine();
      while (engine.robots.length < 10) {
        engine.addRobot();
      }

      if (configType === 'BASELINE') {
        engine.setTrafficManagementConfig({
          trafficMode: 'BIDIRECTIONAL',
          backoffEnabled: false,
          useImprovedLayout: false,
          useDualLaneLayout: false,
        });
      } else if (configType === 'IMPROVED') {
        engine.setTrafficManagementConfig({
          trafficMode: 'ONE_WAY_AISLES',
          backoffEnabled: true,
          initialBackoffTicks: 2,
          maxBackoffTicks: 16,
          useImprovedLayout: true,
          useDualLaneLayout: false,
        });
      } else {
        engine.setTrafficManagementConfig({
          trafficMode: 'DUAL_LANE_DIRECTIONS',
          backoffEnabled: true,
          initialBackoffTicks: 2,
          maxBackoffTicks: 16,
          useImprovedLayout: false,
          useDualLaneLayout: true,
        });
      }

      let collisions = 0;
      let edgeSwaps = 0;
      let prevPos = new Map<string, { x: number; y: number }>();
      for (const r of engine.robots) {
        prevPos.set(r.id, { x: r.position.x, y: r.position.y });
      }

      for (let step = 0; step < ticks; step++) {
        engine.step();

        // Check vertex collisions
        const occMap = new Map<string, string[]>();
        for (const r of engine.robots) {
          if (!r.isActive) continue;
          const key = posKey(r.position);
          if (!occMap.has(key)) occMap.set(key, []);
          occMap.get(key)!.push(r.id);
        }
        for (const occupants of occMap.values()) {
          if (occupants.length > 1) collisions++;
        }

        // Check edge swaps
        for (let i = 0; i < engine.robots.length; i++) {
          for (let j = i + 1; j < engine.robots.length; j++) {
            const r1 = engine.robots[i];
            const r2 = engine.robots[j];
            const p1 = prevPos.get(r1.id);
            const p2 = prevPos.get(r2.id);
            if (p1 && p2 && !posEquals(p1, r1.position) && !posEquals(p2, r2.position)) {
              if (posEquals(p1, r2.position) && posEquals(p2, r1.position)) {
                edgeSwaps++;
              }
            }
          }
        }
        for (const r of engine.robots) {
          prevPos.set(r.id, { x: r.position.x, y: r.position.y });
        }
      }

      const totalDeliveries = engine.robots.reduce((sum, r) => sum + r.tasksCompleted, 0);
      const totalWaitTicks = engine.robots.reduce((sum, r) => sum + r.totalWaitSteps, 0);
      const maxMotionless = Math.max(...engine.robots.map(r => r.longestDurationWithoutMovement ?? 0));
      const starvedCount = engine.robots.filter(r => (r.longestDurationWithoutMovement ?? 0) >= starvationThreshold).length;
      const succReplans = engine.robots.reduce((sum, r) => sum + (r.successfulReplans ?? 0), 0);
      const failReplans = engine.robots.reduce((sum, r) => sum + (r.failedReplans ?? 0), 0);
      const avgPathLength = engine.getMetrics().averagePathLength;

      return {
        deliveries: totalDeliveries,
        waitingTicks: totalWaitTicks,
        maxMotionless,
        starvedCount,
        failedReplans: failReplans,
        successfulReplans: succReplans,
        totalReplans: engine.replanCount,
        deadlockCycles: engine.deadlockCyclesDetected,
        unresolvedStalls: engine.unresolvedDeadlocks,
        avgPathLength,
        collisions,
        edgeSwaps,
      };
    };

    console.log('\nExecuting 3-Configuration Benchmark (500 ticks each)...');
    const resA = runSimulation('BASELINE');
    const resB = runSimulation('IMPROVED');
    const resC = runSimulation('DUAL_LANE');

    // Verify SAFETY INVARIANTS in ALL THREE
    expect(resA.collisions).toBe(0);
    expect(resA.edgeSwaps).toBe(0);
    expect(resB.collisions).toBe(0);
    expect(resB.edgeSwaps).toBe(0);
    expect(resC.collisions).toBe(0);
    expect(resC.edgeSwaps).toBe(0);

    // Prepare CSV Data
    const csvHeaders = [
      'Metric',
      'Config_A_Baseline',
      'Config_B_OneWay',
      'Config_C_DualLane_Bypass',
      'Change_C_vs_A',
      'Change_C_vs_B',
    ];

    const metricsData = [
      {
        name: 'Completed Deliveries',
        a: resA.deliveries,
        b: resB.deliveries,
        c: resC.deliveries,
      },
      {
        name: 'Fleet Cumulative Waiting Ticks',
        a: resA.waitingTicks,
        b: resB.waitingTicks,
        c: resC.waitingTicks,
      },
      {
        name: 'Max Consecutive Motionless Ticks',
        a: resA.maxMotionless,
        b: resB.maxMotionless,
        c: resC.maxMotionless,
      },
      {
        name: 'Confirmed Starved AGVs (>= 60 ticks)',
        a: resA.starvedCount,
        b: resB.starvedCount,
        c: resC.starvedCount,
      },
      {
        name: 'Failed Replanning Attempts',
        a: resA.failedReplans,
        b: resB.failedReplans,
        c: resC.failedReplans,
      },
      {
        name: 'Successful Replanning Attempts',
        a: resA.successfulReplans,
        b: resB.successfulReplans,
        c: resC.successfulReplans,
      },
      {
        name: 'Total Replanning Actions',
        a: resA.totalReplans,
        b: resB.totalReplans,
        c: resC.totalReplans,
      },
      {
        name: 'Unique Deadlock Cycle Episodes',
        a: resA.deadlockCycles,
        b: resB.deadlockCycles,
        c: resC.deadlockCycles,
      },
      {
        name: 'Unresolved Stalls',
        a: resA.unresolvedStalls,
        b: resB.unresolvedStalls,
        c: resC.unresolvedStalls,
      },
      {
        name: 'Average Path Length Snapshot',
        a: resA.avgPathLength,
        b: resB.avgPathLength,
        c: resC.avgPathLength,
      },
      {
        name: 'Physical Collision Violations',
        a: resA.collisions + resA.edgeSwaps,
        b: resB.collisions + resB.edgeSwaps,
        c: resC.collisions + resC.edgeSwaps,
      },
    ];

    const csvRows = metricsData.map(m => {
      const diffCA = (m.c - m.a).toFixed(1);
      const diffCB = (m.c - m.b).toFixed(1);
      return `"${m.name}",${m.a},${m.b},${m.c},${diffCA},${diffCB}`;
    });

    const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');
    const outputPath = path.resolve(process.cwd(), 'THREE_CONFIGURATION_COMPARISON.csv');
    fs.writeFileSync(outputPath, csvContent, 'utf-8');

    console.log('\n========================================================================');
    console.log('   THREE-CONFIGURATION COMPARATIVE BENCHMARK (A vs. B vs. C)             ');
    console.log('========================================================================');
    console.table(
      metricsData.map(m => ({
        Metric: m.name,
        'Config A (Baseline)': m.a,
        'Config B (One-Way)': m.b,
        'Config C (Dual-Lane Bypass)': m.c,
        'C vs. A': (m.c - m.a),
        'C vs. B': (m.c - m.b),
      }))
    );
    console.log(`Successfully generated comparison dataset at: ${outputPath}\n`);

    expect(fs.existsSync(outputPath)).toBe(true);
  }, 300000);
});
