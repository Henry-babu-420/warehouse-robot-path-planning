import { Robot } from '../types/robot';
import { PlanningResult } from '../types/path';
import { SimulationMetrics } from '../types/simulation';
import { CollisionManager } from '../simulation/collisionManager';

export function calculateMetrics(
  robots: Robot[],
  recentPlanningResults: PlanningResult[],
  collisionManager: CollisionManager,
  deadlockCount: number,
  totalReplans: number,
  deadlockCyclesDetected: number = 0,
  deadlockRecoveryAttempts: number = 0,
  unresolvedDeadlocks: number = 0,
  unresolvedDeadlockCycles: number = 0
): SimulationMetrics {
  const totalRobots = robots.length;
  const activeRobots = robots.filter(r => r.isActive).length;
  const completedTasks = robots.reduce((sum, r) => sum + r.tasksCompleted, 0);

  // Compute pending tasks (robots that have an active target and are not completed)
  const pendingTasks = robots.filter(r => r.isActive && r.targetPosition !== null && r.status !== 'COMPLETED').length;

  // Path lengths
  let totalPathLen = 0;
  let pathsCount = 0;
  for (const r of robots) {
    if (r.plannedPath.length > 0) {
      totalPathLen += r.plannedPath.length;
      pathsCount++;
    }
  }
  const averagePathLength = pathsCount > 0 ? parseFloat((totalPathLen / pathsCount).toFixed(2)) : 0;

  // Planning times and expanded nodes from recent planning results
  let totalPlanningTimeMs = 0;
  let totalExpandedNodes = 0;
  for (const res of recentPlanningResults) {
    totalPlanningTimeMs += res.executionTimeMs;
    totalExpandedNodes += res.exploredNodesCount;
  }
  const avgPlanningTimePerRobotMs = recentPlanningResults.length > 0
    ? parseFloat((totalPlanningTimeMs / recentPlanningResults.length).toFixed(3))
    : 0;

  // Waiting time
  const totalWaitingTime = robots.reduce((sum, r) => sum + r.totalWaitSteps, 0);
  const avgWaitingTimePerRobot = activeRobots > 0
    ? parseFloat((totalWaitingTime / activeRobots).toFixed(2))
    : (totalRobots > 0 ? parseFloat((totalWaitingTime / totalRobots).toFixed(2)) : 0);

  // Makespan: maximum remaining steps among active robots (snapshot of remaining path length)
  let makespan = 0;
  for (const r of robots) {
    if (r.isActive && r.plannedPath.length > 0) {
      const remaining = r.plannedPath.length - r.pathIndex;
      if (remaining > makespan) {
        makespan = remaining;
      }
    }
  }

  return {
    totalRobots,
    activeRobots,
    completedTasks,
    pendingTasks,
    averagePathLength,
    snapshotRemainingPathLength: averagePathLength,
    totalPlanningTimeMs: parseFloat(totalPlanningTimeMs.toFixed(2)),
    avgPlanningTimePerRobotMs,
    totalExpandedNodes,
    replanningCount: totalReplans,
    totalWaitingTime,
    avgWaitingTimePerRobot,
    makespan,
    collisionAttemptsPrevented: collisionManager.getPreventedCount(),
    deadlockEvents: deadlockCount,
    deadlockCyclesDetected,
    unresolvedDeadlockCycles,
    deadlockRecoveryAttempts,
    unresolvedDeadlocks,
    deferredStallRecoveries: unresolvedDeadlocks,
  };
}
