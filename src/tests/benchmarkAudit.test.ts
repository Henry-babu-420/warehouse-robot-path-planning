import { describe, it } from 'vitest';
import { SimulationEngine } from '../simulation/simulationEngine';
import { planFleetCooperativePaths } from '../algorithms/cooperativeAstar';
import { ReservationTable } from '../algorithms/reservationTable';
import { Robot } from '../types/robot';
import { ROBOT_PALETTE } from '../simulation/simulationEngine';

describe('Audit Phase 4 - Empirical Benchmarks', () => {
  it('runs empirical benchmark across 1, 2, 4, 6, 8, 10 robots and records exact metrics', () => {
    const counts = [1, 2, 4, 6, 8, 10];
    const benchmarkMetrics: Array<{
      robotCount: number;
      planningTimeMs: number;
      expandedNodes: number;
      avgPathLength: number;
      makespan: number;
      waitingTime: number;
      replanningCount: number;
      completedMissions: number;
    }> = [];

    for (const count of counts) {
      const engine = new SimulationEngine();
      engine.robots = [];
      engine.reservationTable.clear();
      engine.collisionManager.reset();
      engine.deadlockDetector.reset();

      // Deploy `count` robots
      for (let i = 0; i < count; i++) {
        const x = 1 + (i % (engine.warehouse.width - 2));
        const y = 1;
        const pickups = engine.warehouse.stations.filter(s => s.type === 'PICKUP');
        const deliveries = engine.warehouse.stations.filter(s => s.type === 'DELIVERY');
        const p = pickups[i % Math.max(1, pickups.length)]?.position || { x: 1, y: 3 };
        const d = deliveries[i % Math.max(1, deliveries.length)]?.position || { x: engine.warehouse.width - 2, y: 3 };

        engine.robots.push({
          id: `R${i + 1}`,
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
          priority: 20 - i,
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

      // Initial Fleet Plan
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

      engine.robots = initialPlan.plannedRobots;
      engine.recentPlanningResults = initialPlan.planningResults;

      const planningTimeMs = parseFloat(initialPlan.totalPlanningTimeMs.toFixed(2));
      const expandedNodes = initialPlan.planningResults.reduce((sum, r) => sum + r.exploredNodesCount, 0);

      const paths = initialPlan.planningResults.filter(p => p.success).map(p => p.path.length);
      const avgPathLength = paths.length > 0
        ? parseFloat((paths.reduce((a, b) => a + b, 0) / paths.length).toFixed(2))
        : 0;

      // Simulate 35 discrete steps to observe makespan, waiting time, replans, and completed tasks
      for (let step = 0; step < 35; step++) {
        engine.step();
      }

      const metrics = engine.getMetrics();

      benchmarkMetrics.push({
        robotCount: count,
        planningTimeMs,
        expandedNodes,
        avgPathLength,
        makespan: metrics.makespan,
        waitingTime: metrics.totalWaitingTime,
        replanningCount: metrics.replanningCount,
        completedMissions: metrics.completedTasks,
      });
    }

    console.log('--- EMPIRICAL BENCHMARK AUDIT DATA ---');
    console.table(benchmarkMetrics);
  }, 30000);
});
