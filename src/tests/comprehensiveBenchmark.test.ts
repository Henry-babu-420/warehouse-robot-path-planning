import { describe, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SimulationEngine } from '../simulation/simulationEngine';
import { planFleetCooperativePaths } from '../algorithms/cooperativeAstar';
import { ReservationTable } from '../algorithms/reservationTable';
import { Robot } from '../types/robot';
import { ROBOT_PALETTE } from '../simulation/simulationEngine';

interface RunRecord {
  runIndex: number;
  robotCount: number;
  planningTimeMs: number;
  expandedNodes: number;
  avgPathLength: number;
  makespan: number;
  waitingTime: number;
  replanningCount: number;
  completedTasks: number;
  failedPlanningAttempts: number;
}

interface BenchmarkSummary {
  robotCount: number;
  meanPlanningTimeMs: number;
  medianPlanningTimeMs: number;
  maxPlanningTimeMs: number;
  meanExpandedNodes: number;
  meanPathLength: number;
  meanMakespan: number;
  meanWaitingTime: number;
  meanReplanningCount: number;
  totalCompletedTasks: number;
  totalFailedPlanningAttempts: number;
}

describe('6. Performance Benchmarking across 10 Independent Runs', () => {
  it('executes 10 reproducible runs for 1, 2, 4, 6, 8, and 10 robots and generates BENCHMARK_RESULTS.csv', () => {
    const robotCounts = [1, 2, 4, 6, 8, 10];
    const NUM_RUNS = 10;
    const SIM_STEPS = 30;

    const allRuns: RunRecord[] = [];
    const summaries: BenchmarkSummary[] = [];

    for (const count of robotCounts) {
      const runsForCount: RunRecord[] = [];

      for (let run = 1; run <= NUM_RUNS; run++) {
        const engine = new SimulationEngine();
        engine.robots = [];
        engine.reservationTable.clear();
        engine.collisionManager.reset();
        engine.deadlockDetector.reset();

        // Seeded setup for reproducibility across runs:
        // Adjust start positions and station assignments based on run index
        const pickups = engine.warehouse.stations.filter(s => s.type === 'PICKUP');
        const deliveries = engine.warehouse.stations.filter(s => s.type === 'DELIVERY');

        for (let i = 0; i < count; i++) {
          const x = 1 + ((i * 2 + run) % (engine.warehouse.width - 2));
          const y = 1 + ((i + Math.floor(run / 2)) % 2); // Vary rows slightly per run
          const p = pickups[(i + run) % pickups.length]?.position || { x: 1, y: 3 };
          const d = deliveries[(i + run + 1) % deliveries.length]?.position || { x: engine.warehouse.width - 2, y: 3 };

          engine.robots.push({
            id: `AGV-${i + 1}`,
            name: `AGV-${i + 1}`,
            color: ROBOT_PALETTE[i % ROBOT_PALETTE.length],
            position: { x, y },
            startPosition: { x, y },
            targetPosition: { ...p },
            assignedPickup: { ...p },
            assignedDelivery: { ...d },
            status: 'IDLE',
            plannedPath: [],
            pathIndex: 0,
            priority: 25 - i,
            priorityAge: 0,
            speed: 1,
            isActive: true,
            hasPayload: false,
            totalWaitSteps: 0,
            totalStepsMoved: 0,
            tasksCompleted: 0,
            replanCount: 0,
          });
        }

        // Measure algorithm execution strictly (excluding any rendering)
        const tStart = performance.now();
        const initialPlan = planFleetCooperativePaths(
          engine.robots,
          {
            width: engine.warehouse.width,
            height: engine.warehouse.height,
            isCellTraversable: (pos) => engine.isCellTraversable(pos),
            reservationTable: engine.reservationTable,
            maxTimeHorizon: 150,
          },
          0
        );
        const tEnd = performance.now();
        const planningTimeMs = tEnd - tStart;

        engine.robots = initialPlan.plannedRobots;
        engine.recentPlanningResults = initialPlan.planningResults;

        const expandedNodes = initialPlan.planningResults.reduce(
          (sum, r) => sum + r.exploredNodesCount,
          0
        );
        const successfulPlans = initialPlan.planningResults.filter(p => p.success);
        const failedPlanningAttempts = initialPlan.planningResults.filter(p => !p.success).length;
        const avgPathLength = successfulPlans.length > 0
          ? successfulPlans.reduce((sum, p) => sum + p.path.length, 0) / successfulPlans.length
          : 0;

        // Step discrete simulation forward
        for (let step = 0; step < SIM_STEPS; step++) {
          engine.step();
        }

        const metrics = engine.getMetrics();

        runsForCount.push({
          runIndex: run,
          robotCount: count,
          planningTimeMs: parseFloat(planningTimeMs.toFixed(3)),
          expandedNodes,
          avgPathLength: parseFloat(avgPathLength.toFixed(2)),
          makespan: metrics.makespan,
          waitingTime: metrics.totalWaitingTime,
          replanningCount: metrics.replanningCount,
          completedTasks: metrics.completedTasks,
          failedPlanningAttempts,
        });
      }

      allRuns.push(...runsForCount);

      // Aggregate statistics for this robot count
      const times = runsForCount.map(r => r.planningTimeMs).sort((a, b) => a - b);
      const meanTime = times.reduce((a, b) => a + b, 0) / times.length;
      const medianTime = (times[4] + times[5]) / 2;
      const maxTime = times[times.length - 1];

      const meanExp = runsForCount.reduce((a, b) => a + b.expandedNodes, 0) / NUM_RUNS;
      const meanLen = runsForCount.reduce((a, b) => a + b.avgPathLength, 0) / NUM_RUNS;
      const meanMake = runsForCount.reduce((a, b) => a + b.makespan, 0) / NUM_RUNS;
      const meanWait = runsForCount.reduce((a, b) => a + b.waitingTime, 0) / NUM_RUNS;
      const meanReplan = runsForCount.reduce((a, b) => a + b.replanningCount, 0) / NUM_RUNS;
      const totalCompleted = runsForCount.reduce((a, b) => a + b.completedTasks, 0);
      const totalFailed = runsForCount.reduce((a, b) => a + b.failedPlanningAttempts, 0);

      summaries.push({
        robotCount: count,
        meanPlanningTimeMs: parseFloat(meanTime.toFixed(2)),
        medianPlanningTimeMs: parseFloat(medianTime.toFixed(2)),
        maxPlanningTimeMs: parseFloat(maxTime.toFixed(2)),
        meanExpandedNodes: Math.round(meanExp),
        meanPathLength: parseFloat(meanLen.toFixed(1)),
        meanMakespan: parseFloat(meanMake.toFixed(1)),
        meanWaitingTime: parseFloat(meanWait.toFixed(1)),
        meanReplanningCount: parseFloat(meanReplan.toFixed(1)),
        totalCompletedTasks: totalCompleted,
        totalFailedPlanningAttempts: totalFailed,
      });
    }

    // Output console table for auditing
    console.log('\n================ EMPIRICAL BENCHMARK SUMMARY (10 RUNS PER CONFIG) ================');
    console.table(summaries);

    // Generate BENCHMARK_RESULTS.csv
    let csvContent = 'RobotCount,RunIndex,PlanningTimeMs,ExpandedNodes,AvgPathLength,Makespan,WaitingTime,ReplanningCount,CompletedTasks,FailedPlanningAttempts\n';
    for (const r of allRuns) {
      csvContent += `${r.robotCount},${r.runIndex},${r.planningTimeMs},${r.expandedNodes},${r.avgPathLength},${r.makespan},${r.waitingTime},${r.replanningCount},${r.completedTasks},${r.failedPlanningAttempts}\n`;
    }

    csvContent += '\n# SUMMARY AGGREGATE (10-RUN AVERAGES)\n';
    csvContent += 'RobotCount,MeanPlanningTimeMs,MedianPlanningTimeMs,MaxPlanningTimeMs,MeanExpandedNodes,MeanPathLength,MeanMakespan,MeanWaitingTime,MeanReplanningCount,TotalCompletedTasks,TotalFailedAttempts\n';
    for (const s of summaries) {
      csvContent += `${s.robotCount},${s.meanPlanningTimeMs},${s.medianPlanningTimeMs},${s.maxPlanningTimeMs},${s.meanExpandedNodes},${s.meanPathLength},${s.meanMakespan},${s.meanWaitingTime},${s.meanReplanningCount},${s.totalCompletedTasks},${s.totalFailedPlanningAttempts}\n`;
    }

    const csvPath = path.resolve(process.cwd(), 'BENCHMARK_RESULTS.csv');
    fs.writeFileSync(csvPath, csvContent, 'utf-8');
    console.log(`\nSuccessfully wrote benchmark dataset to ${csvPath}`);
  }, 180000); // 180s timeout for 60 full simulations
});
