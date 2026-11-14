import { Robot } from '../types/robot';
import { Position } from '../types/grid';
import { TimePosition, PlanningResult } from '../types/path';
import { ReservationTable } from './reservationTable';
import { findPathCooperativeAStar, CooperativeAStarOptions } from './cooperativeAstar';
import { posEquals } from '../utils/heuristics';

export interface ReplanningEvent {
  robotId: string;
  reason: 'DYNAMIC_OBSTACLE' | 'DEADLOCK_RECOVERY' | 'PATH_BLOCKED';
  previousLength: number;
  newLength: number;
  success: boolean;
  blockedPosition?: Position;
  executionTimeMs: number;
}

/**
 * Checks all active robots to see if their remaining planned path intersects with any blocked cells.
 * Clears ALL affected robots' reservations first, then replans in prioritized order.
 */
export function handleDynamicObstaclePlacement(
  blockedCell: Position,
  robots: Robot[],
  options: Omit<CooperativeAStarOptions, 'startTime'>,
  currentTime: number
): {
  updatedRobots: Robot[];
  replanEvents: ReplanningEvent[];
} {
  const { reservationTable, isCellTraversable } = options;
  const updatedRobots: Robot[] = [...robots];
  const replanEvents: ReplanningEvent[] = [];

  // Identify affected robots whose upcoming path (from pathIndex to end) touches blockedCell
  const affectedRobotIndices: number[] = [];

  for (let i = 0; i < updatedRobots.length; i++) {
    const robot = updatedRobots[i];
    if (!robot.isActive || robot.plannedPath.length === 0) continue;

    // Check future steps from current step onward
    const futureSteps = robot.plannedPath.slice(robot.pathIndex);
    const touchesBlocked = futureSteps.some(step => posEquals(step, blockedCell));

    if (touchesBlocked) {
      affectedRobotIndices.push(i);
    }
  }

  // 1. Invalidate reservations for ALL affected robots FIRST to prevent ghost reservations
  for (const idx of affectedRobotIndices) {
    reservationTable.clearRobot(updatedRobots[idx].id);
  }

  // 2. Sort affected robots by effective priority with fairness-aware tie-breaking
  const sortedAffectedIndices = [...affectedRobotIndices].sort((a, b) => {
    const robA = updatedRobots[a];
    const robB = updatedRobots[b];
    const effA = robA.priority + (robA.priorityAge || 0);
    const effB = robB.priority + (robB.priorityAge || 0);
    if (effB !== effA) {
      return effB - effA;
    }
    const motionlessA = robA.longestDurationWithoutMovement ?? robA.consecutiveStepsWithoutMovement ?? 0;
    const motionlessB = robB.longestDurationWithoutMovement ?? robB.consecutiveStepsWithoutMovement ?? 0;
    if (motionlessB !== motionlessA) {
      return motionlessB - motionlessA;
    }
    if (robA.tasksCompleted !== robB.tasksCompleted) {
      return robA.tasksCompleted - robB.tasksCompleted;
    }
    return robA.id.localeCompare(robB.id);
  });

  // 3. Process each affected robot
  for (const idx of sortedAffectedIndices) {
    const robot = updatedRobots[idx];
    const prevLen = robot.plannedPath.length - robot.pathIndex;

    if (!robot.targetPosition) continue;

    // Recalculate valid path using Cooperative A* starting from currentTime
    const plan = findPathCooperativeAStar(
      robot.position,
      robot.targetPosition,
      robot.id,
      {
        ...options,
        startTime: currentTime,
      }
    );

    if (plan.success && plan.timeIndexedPath.length > 0) {
      // Reserve new path
      reservationTable.reservePath(robot.id, plan.timeIndexedPath, true);

      updatedRobots[idx] = {
        ...robot,
        plannedPath: plan.timeIndexedPath,
        pathIndex: 0,
        status: robot.hasPayload ? 'MOVING_TO_DELIVERY' : 'MOVING_TO_PICKUP',
        replanCount: robot.replanCount + 1,
      };

      replanEvents.push({
        robotId: robot.id,
        reason: 'DYNAMIC_OBSTACLE',
        previousLength: prevLen,
        newLength: plan.path.length,
        success: true,
        blockedPosition: blockedCell,
        executionTimeMs: plan.executionTimeMs,
      });
    } else {
      // Could not find route right now (e.g. temporary choke point), stop and wait
      updatedRobots[idx] = {
        ...robot,
        plannedPath: [{ x: robot.position.x, y: robot.position.y, t: currentTime }],
        pathIndex: 0,
        status: 'WAITING',
        priorityAge: (robot.priorityAge || 0) + 5,
        replanCount: robot.replanCount + 1,
      };

      replanEvents.push({
        robotId: robot.id,
        reason: 'DYNAMIC_OBSTACLE',
        previousLength: prevLen,
        newLength: 0,
        success: false,
        blockedPosition: blockedCell,
        executionTimeMs: plan.executionTimeMs,
      });
    }
  }

  return { updatedRobots, replanEvents };
}

/**
 * Deadlock Recovery Strategy:
 * 1. Clear reservations for all deadlocked robots.
 * 2. Invert / adjust priorities among the deadlocked cycle so the yielding robot gets right of way.
 * 3. Replan in new priority order.
 */
export function recoverFromDeadlock(
  deadlockedRobotIds: string[],
  robots: Robot[],
  options: Omit<CooperativeAStarOptions, 'startTime'>,
  currentTime: number
): {
  updatedRobots: Robot[];
  recovered: boolean;
  events: ReplanningEvent[];
  message: string;
} {
  const { reservationTable } = options;
  const updatedRobots = [...robots];
  const events: ReplanningEvent[] = [];

  // Clear reservations for all deadlocked robots
  for (const rId of deadlockedRobotIds) {
    reservationTable.clearRobot(rId);
  }

  // Find the deadlocked robot with the lowest current effective priority
  const deadlockedSubset = updatedRobots.filter(r => deadlockedRobotIds.includes(r.id));
  if (deadlockedSubset.length === 0) {
    return { updatedRobots, recovered: false, events, message: 'No valid deadlocked robots found' };
  }

  const sortedByEff = [...deadlockedSubset].sort(
    (a, b) => (a.priority + a.priorityAge) - (b.priority + b.priorityAge)
  );
  const minEffRobot = sortedByEff[0];
  const maxEff = Math.max(...deadlockedSubset.map(r => r.priority + r.priorityAge));

  // Elevate priority of the starved/yielding robot so it actually reverses the cycle
  for (let i = 0; i < updatedRobots.length; i++) {
    if (deadlockedRobotIds.includes(updatedRobots[i].id)) {
      if (updatedRobots[i].id === minEffRobot.id) {
        // Boost to exceed the maximum effective priority by +15
        const boost = Math.max(15, (maxEff - updatedRobots[i].priority) + 15);
        updatedRobots[i] = {
          ...updatedRobots[i],
          priorityAge: boost,
          replanCount: updatedRobots[i].replanCount + 1,
        };
      } else {
        updatedRobots[i] = {
          ...updatedRobots[i],
          priorityAge: updatedRobots[i].priorityAge + 2,
          replanCount: updatedRobots[i].replanCount + 1,
        };
      }
    }
  }

  // Sort deadlocked robots by new effective priority with fairness-aware tie-breaking
  const reOrderedDeadlockedSubset = updatedRobots
    .filter(r => deadlockedRobotIds.includes(r.id))
    .sort((a, b) => {
      const effA = a.priority + (a.priorityAge || 0);
      const effB = b.priority + (b.priorityAge || 0);
      if (effB !== effA) {
        return effB - effA;
      }
      const motionlessA = a.longestDurationWithoutMovement ?? a.consecutiveStepsWithoutMovement ?? 0;
      const motionlessB = b.longestDurationWithoutMovement ?? b.consecutiveStepsWithoutMovement ?? 0;
      if (motionlessB !== motionlessA) {
        return motionlessB - motionlessA;
      }
      if (a.tasksCompleted !== b.tasksCompleted) {
        return a.tasksCompleted - b.tasksCompleted;
      }
      return a.id.localeCompare(b.id);
    });

  let successfulReplans = 0;

  for (const robot of reOrderedDeadlockedSubset) {
    const idx = updatedRobots.findIndex(r => r.id === robot.id);
    if (!robot.targetPosition) continue;

    const plan = findPathCooperativeAStar(
      robot.position,
      robot.targetPosition,
      robot.id,
      {
        ...options,
        startTime: currentTime,
      }
    );

    if (plan.success && plan.timeIndexedPath.length > 0) {
      reservationTable.reservePath(robot.id, plan.timeIndexedPath, true);
      updatedRobots[idx] = {
        ...robot,
        plannedPath: plan.timeIndexedPath,
        pathIndex: 0,
        status: robot.hasPayload ? 'MOVING_TO_DELIVERY' : 'MOVING_TO_PICKUP',
        priorityAge: 0, // Reset on successful resolution
      };
      successfulReplans++;
      events.push({
        robotId: robot.id,
        reason: 'DEADLOCK_RECOVERY',
        previousLength: robot.plannedPath.length,
        newLength: plan.path.length,
        success: true,
        executionTimeMs: plan.executionTimeMs,
      });
    } else {
      // Must wait: re-reserve current position at currentTime (vertex reservation only, NOT indefinite goal lock)
      reservationTable.reservePath(
        robot.id,
        [{ x: robot.position.x, y: robot.position.y, t: currentTime }],
        false
      );
      updatedRobots[idx] = {
        ...robot,
        plannedPath: [{ x: robot.position.x, y: robot.position.y, t: currentTime }],
        pathIndex: 0,
        status: 'WAITING',
      };
      events.push({
        robotId: robot.id,
        reason: 'DEADLOCK_RECOVERY',
        previousLength: robot.plannedPath.length,
        newLength: 0,
        success: false,
        executionTimeMs: plan.executionTimeMs,
      });
    }
  }

  const allRecovered = successfulReplans === deadlockedRobotIds.length;
  const message = allRecovered
    ? `Deadlock successfully recovered: inverted priorities and replanned [${deadlockedRobotIds.join(', ')}]`
    : `Partial deadlock recovery (${successfulReplans}/${deadlockedRobotIds.length} resolved). Remaining robots waiting.`;

  return {
    updatedRobots,
    recovered: successfulReplans > 0,
    events,
    message,
  };
}
