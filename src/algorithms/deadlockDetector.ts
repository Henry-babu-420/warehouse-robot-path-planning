import { Robot } from '../types/robot';
import { Position } from '../types/grid';
import { posEquals, posKey } from '../utils/heuristics';
import { ReservationTable } from './reservationTable';

export interface DeadlockReport {
  isDeadlocked: boolean;
  isStalled: boolean;
  cycleFound: boolean;
  involvedRobotIds: string[];
  reason: string;
  suggestedAction: 'NONE' | 'WAIT_AND_RETRY' | 'REPRIORITIZE_AND_REPLAN' | 'YIELD_STEP' | 'UNRECOVERABLE';
  recoveryAttempted?: boolean;
  recoverySucceeded?: boolean;
  unresolvedStall?: boolean;
}

/**
 * Deadlock Detection System for Multi-Robot Fleet
 */
export class DeadlockDetector {
  private consecutiveWaitCounts: Map<string, number> = new Map();
  private waitThreshold = 3; // Steps of consecutive waiting before triggering deadlock alert

  recordStep(robots: Robot[]) {
    for (const robot of robots) {
      if (robot.status === 'WAITING' || robot.status === 'BLOCKED') {
        const count = (this.consecutiveWaitCounts.get(robot.id) || 0) + 1;
        this.consecutiveWaitCounts.set(robot.id, count);
      } else {
        this.consecutiveWaitCounts.set(robot.id, 0);
      }
    }
  }

  reset() {
    this.consecutiveWaitCounts.clear();
  }

  /**
   * Check for wait-for graph cycles and starvation deadlocks
   */
  detectDeadlock(
    robots: Robot[],
    reservationTable: ReservationTable,
    currentTime: number
  ): DeadlockReport {
    // 1. Build a "Wait-For" graph: Robot A waits for cell occupied by Robot B
    // Position -> RobotId mapping
    const robotAtPos = new Map<string, string>();
    for (const r of robots) {
      if (r.isActive) {
        robotAtPos.set(posKey(r.position), r.id);
      }
    }

    // Graph: robotId -> Set of robotIds it is waiting for
    const waitForGraph = new Map<string, Set<string>>();

    for (const robot of robots) {
      if (!robot.isActive || robot.plannedPath.length === 0) continue;

      // Find next intended step
      const nextStep = robot.plannedPath[robot.pathIndex + 1];
      if (nextStep && !posEquals(robot.position, nextStep)) {
        // Robot wants to move to nextStep
        const blockerId = robotAtPos.get(posKey(nextStep));
        if (blockerId && blockerId !== robot.id) {
          if (!waitForGraph.has(robot.id)) {
            waitForGraph.set(robot.id, new Set());
          }
          waitForGraph.get(robot.id)!.add(blockerId);
        }
      }
    }

    // 2. Detect cycles in Wait-For graph using DFS
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const cycleRobots: string[] = [];

    const hasCycle = (node: string, path: string[]): boolean => {
      visited.add(node);
      recStack.add(node);
      path.push(node);

      const neighbors = waitForGraph.get(node) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (hasCycle(neighbor, path)) return true;
        } else if (recStack.has(neighbor)) {
          // Cycle found!
          const cycleStartIdx = path.indexOf(neighbor);
          cycleRobots.push(...path.slice(cycleStartIdx));
          return true;
        }
      }

      recStack.delete(node);
      path.pop();
      return false;
    };

    for (const robot of robots) {
      if (!visited.has(robot.id)) {
        if (hasCycle(robot.id, [])) {
          return {
            isDeadlocked: true,
            isStalled: true,
            cycleFound: true,
            involvedRobotIds: Array.from(new Set(cycleRobots)),
            reason: `Circular wait-for dependency detected among robots [${cycleRobots.join(', ')}]`,
            suggestedAction: 'REPRIORITIZE_AND_REPLAN',
          };
        }
      }
    }

    // 3. Detect persistent waiting / stalling
    const stalledRobots: string[] = [];
    for (const robot of robots) {
      if (!robot.isActive) continue;
      const waits = this.consecutiveWaitCounts.get(robot.id) || 0;
      if (waits >= this.waitThreshold) {
        stalledRobots.push(robot.id);
      }
    }

    if (stalledRobots.length > 0) {
      return {
        isDeadlocked: true,
        isStalled: true,
        cycleFound: false,
        involvedRobotIds: stalledRobots,
        reason: `Robots [${stalledRobots.join(', ')}] stalled for >= ${this.waitThreshold} consecutive time steps`,
        suggestedAction: 'REPRIORITIZE_AND_REPLAN',
      };
    }

    return {
      isDeadlocked: false,
      isStalled: false,
      cycleFound: false,
      involvedRobotIds: [],
      reason: 'No deadlock detected',
      suggestedAction: 'NONE',
    };
  }
}
