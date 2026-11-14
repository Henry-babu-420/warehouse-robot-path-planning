import { Position } from '../types/grid';
import { TimePosition, PlanningResult, PathNode } from '../types/path';
import { Robot } from '../types/robot';
import { ReservationTable } from './reservationTable';
import { PriorityQueue } from './astar';
import { manhattanDistance, posEquals, DIRECTIONS_4 } from '../utils/heuristics';

export interface CooperativeAStarOptions {
  width: number;
  height: number;
  isCellTraversable: (pos: Position) => boolean;
  reservationTable: ReservationTable;
  maxTimeHorizon?: number;
  maxExpandedNodes?: number;
  startTime?: number;
  goalDwellSteps?: number; // Steps the robot must stay safely at goal
  isMoveAllowed?: (from: Position, to: Position) => boolean;
}

/**
 * Cooperative A* search in space-time (x, y, t)
 */
export function findPathCooperativeAStar(
  start: Position,
  goal: Position,
  robotId: string,
  options: CooperativeAStarOptions
): PlanningResult {
  const startTime = performance.now();
  const {
    width,
    height,
    isCellTraversable,
    reservationTable,
    maxTimeHorizon = 120,
    maxExpandedNodes = 8000,
    startTime: initialTime = 0,
    goalDwellSteps = 3,
  } = options;

  // Boundary & basic traversability
  if (
    start.x < 0 || start.x >= width || start.y < 0 || start.y >= height ||
    goal.x < 0 || goal.x >= width || goal.y < 0 || goal.y >= height
  ) {
    return {
      robotId,
      success: false,
      path: [],
      timeIndexedPath: [],
      exploredNodes: [],
      visitedNodesCount: 0,
      exploredNodesCount: 0,
      executionTimeMs: performance.now() - startTime,
      cost: 0,
      failureReason: 'Start or goal is outside warehouse boundaries',
      timestamp: Date.now(),
    };
  }

  if (!isCellTraversable(start) || !isCellTraversable(goal)) {
    return {
      robotId,
      success: false,
      path: [],
      timeIndexedPath: [],
      exploredNodes: [],
      visitedNodesCount: 0,
      exploredNodesCount: 0,
      executionTimeMs: performance.now() - startTime,
      cost: 0,
      failureReason: 'Start or goal position is blocked by an obstacle/shelf',
      timestamp: Date.now(),
    };
  }

  // Check if start position is already reserved by someone else at initialTime
  if (reservationTable.isVertexReserved(start.x, start.y, initialTime, robotId)) {
    return {
      robotId,
      success: false,
      path: [],
      timeIndexedPath: [],
      exploredNodes: [],
      visitedNodesCount: 0,
      exploredNodesCount: 0,
      executionTimeMs: performance.now() - startTime,
      cost: 0,
      failureReason: `Starting cell is reserved by another robot at time t=${initialTime}`,
      timestamp: Date.now(),
    };
  }

  // Trivial case: already at goal and goal is free
  if (posEquals(start, goal)) {
    const singleStep: TimePosition = { x: start.x, y: start.y, t: initialTime };
    return {
      robotId,
      success: true,
      path: [{ x: start.x, y: start.y }],
      timeIndexedPath: [singleStep],
      exploredNodes: [{ x: start.x, y: start.y }],
      visitedNodesCount: 1,
      exploredNodesCount: 1,
      executionTimeMs: performance.now() - startTime,
      cost: 0,
      timestamp: Date.now(),
    };
  }

  const openQueue = new PriorityQueue<PathNode>();
  const openSet = new Map<string, PathNode>();
  const closedSet = new Set<string>();
  const exploredPositions: Position[] = [];

  const startH = manhattanDistance(start, goal);
  const startNode: PathNode = {
    x: start.x,
    y: start.y,
    t: initialTime,
    g: 0,
    h: startH,
    f: startH,
    parent: null,
  };

  const startKey = `${start.x},${start.y}@${initialTime}`;
  openQueue.enqueue(startNode, startNode.f);
  openSet.set(startKey, startNode);

  let targetNode: PathNode | null = null;
  let exploredCount = 0;

  while (!openQueue.isEmpty()) {
    const current = openQueue.dequeue()!;
    const currentTime = current.t ?? initialTime;
    const currentKey = `${current.x},${current.y}@${currentTime}`;

    if (closedSet.has(currentKey)) {
      continue;
    }

    openSet.delete(currentKey);
    closedSet.add(currentKey);
    exploredPositions.push({ x: current.x, y: current.y });
    exploredCount++;

    if (exploredCount > maxExpandedNodes) {
      return {
        robotId,
        success: false,
        path: [],
        timeIndexedPath: [],
        exploredNodes: exploredPositions,
        visitedNodesCount: closedSet.size + openSet.size,
        exploredNodesCount: exploredCount,
        executionTimeMs: performance.now() - startTime,
        cost: 0,
        failureReason: `Exceeded expansion limit (${maxExpandedNodes}) in space-time`,
        timestamp: Date.now(),
      };
    }

    // Check goal condition:
    // If we reached the goal position, verify we can dwell there safely without being hit
    if (current.x === goal.x && current.y === goal.y) {
      let canDwell = true;
      for (let dt = 1; dt <= goalDwellSteps; dt++) {
        if (reservationTable.isVertexReserved(goal.x, goal.y, currentTime + dt, robotId)) {
          canDwell = false;
          break;
        }
      }

      if (canDwell) {
        targetNode = current;
        break;
      }
    }

    // Don't expand beyond time horizon
    if (currentTime >= initialTime + maxTimeHorizon) {
      continue;
    }

    const nextTime = currentTime + 1;

    // Candidate actions: 4-directional moves + Wait action
    const actions: Array<{ dx: number; dy: number; isWait: boolean }> = [
      ...DIRECTIONS_4.map(d => ({ dx: d.dx, dy: d.dy, isWait: false })),
      { dx: 0, dy: 0, isWait: true }, // WAIT ACTION
    ];

    for (const action of actions) {
      const nx = current.x + action.dx;
      const ny = current.y + action.dy;
      const nKey = `${nx},${ny}@${nextTime}`;

      // Check boundary
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      // Static obstacle check
      if (!isCellTraversable({ x: nx, y: ny })) continue;
      // Closed in space-time
      if (closedSet.has(nKey)) continue;

      // Reservation table transition check (Vertex collision & Edge-swap collision)
      if (reservationTable.isTransitionReserved(current.x, current.y, nx, ny, currentTime, robotId)) {
        continue;
      }

      // Warehouse traffic direction rules check (if move is not a wait)
      if (!action.isWait && options.isMoveAllowed) {
        if (!options.isMoveAllowed({ x: current.x, y: current.y }, { x: nx, y: ny })) {
          continue;
        }
      }

      // Small tie-break: slight penalty for waiting so the robot prefers moving forward
      const stepCost = action.isWait ? 1.002 : 1.0;
      const tentativeG = current.g + stepCost;

      const existingInOpen = openSet.get(nKey);
      if (!existingInOpen || tentativeG < existingInOpen.g) {
        const h = manhattanDistance({ x: nx, y: ny }, goal);
        const neighborNode: PathNode = {
          x: nx,
          y: ny,
          t: nextTime,
          g: tentativeG,
          h,
          f: tentativeG + h,
          parent: current,
        };

        openSet.set(nKey, neighborNode);
        openQueue.enqueue(neighborNode, neighborNode.f);
      }
    }
  }

  const executionTimeMs = performance.now() - startTime;

  if (!targetNode) {
    return {
      robotId,
      success: false,
      path: [],
      timeIndexedPath: [],
      exploredNodes: exploredPositions,
      visitedNodesCount: closedSet.size + openSet.size,
      exploredNodesCount: exploredCount,
      executionTimeMs,
      cost: 0,
      failureReason: 'No conflict-free path found within time horizon',
      timestamp: Date.now(),
    };
  }

  // Reconstruct time-indexed path
  const timePath: TimePosition[] = [];
  let curr: PathNode | null = targetNode;
  while (curr !== null) {
    timePath.unshift({
      x: curr.x,
      y: curr.y,
      t: curr.t ?? 0,
    });
    curr = curr.parent;
  }

  const plainPath: Position[] = timePath.map(tp => ({ x: tp.x, y: tp.y }));

  return {
    robotId,
    success: true,
    path: plainPath,
    timeIndexedPath: timePath,
    exploredNodes: exploredPositions,
    visitedNodesCount: closedSet.size + openSet.size,
    exploredNodesCount: exploredCount,
    executionTimeMs,
    cost: timePath.length - 1,
    timestamp: Date.now(),
  };
}

/**
 * Multi-Robot Prioritized Planning with Priority Aging
 */
export function planFleetCooperativePaths(
  robots: Robot[],
  options: Omit<CooperativeAStarOptions, 'startTime'>,
  currentTime: number = 0
): {
  plannedRobots: Robot[];
  planningResults: PlanningResult[];
  totalPlanningTimeMs: number;
} {
  const tStart = performance.now();
  const { reservationTable } = options;

  // Clear previous reservations for all robots being planned
  for (const robot of robots) {
    reservationTable.clearRobot(robot.id);
  }

  // Sort robots by effective priority with fairness-aware tie-breaking
  const sortedRobots = [...robots].sort((a, b) => {
    const effA = a.priority + (a.priorityAge || 0);
    const effB = b.priority + (b.priorityAge || 0);
    if (effB !== effA) {
      return effB - effA;
    }
    // Fairness-Aware Tie-Breaking:
    // 1. Prioritize robot with longest duration without movement (mitigate starvation)
    const motionlessA = a.longestDurationWithoutMovement ?? a.consecutiveStepsWithoutMovement ?? 0;
    const motionlessB = b.longestDurationWithoutMovement ?? b.consecutiveStepsWithoutMovement ?? 0;
    if (motionlessB !== motionlessA) {
      return motionlessB - motionlessA;
    }
    // 2. Prioritize robot with fewest completed tasks (balance fleet throughput)
    if (a.tasksCompleted !== b.tasksCompleted) {
      return a.tasksCompleted - b.tasksCompleted;
    }
    // 3. Prioritize robot with higher accumulated wait steps
    const waitA = a.totalWaitSteps ?? 0;
    const waitB = b.totalWaitSteps ?? 0;
    if (waitB !== waitA) {
      return waitB - waitA;
    }
    // 4. Deterministic stable ID
    return a.id.localeCompare(b.id);
  });

  const updatedRobots: Robot[] = [];
  const results: PlanningResult[] = [];

  for (const robot of sortedRobots) {
    if (!robot.isActive || !robot.targetPosition) {
      // Stationary/inactive robot: lock its current position in reservation table
      reservationTable.reservePath(
        robot.id,
        [{ x: robot.position.x, y: robot.position.y, t: currentTime }],
        true
      );
      updatedRobots.push(robot);
      continue;
    }

    const plan = findPathCooperativeAStar(
      robot.position,
      robot.targetPosition,
      robot.id,
      {
        ...options,
        startTime: currentTime,
      }
    );

    results.push(plan);

    if (plan.success && plan.timeIndexedPath.length > 0) {
      // Reserve future space-time path
      reservationTable.reservePath(robot.id, plan.timeIndexedPath, true);

      updatedRobots.push({
        ...robot,
        plannedPath: plan.timeIndexedPath,
        pathIndex: 0,
        status: robot.hasPayload ? 'MOVING_TO_DELIVERY' : 'MOVING_TO_PICKUP',
        priorityAge: 0, // Reset priority age upon successful plan
      });
    } else {
      // Failed to find path: age priority to prevent indefinite starvation!
      // Re-reserve current position at currentTime (vertex reservation only, NOT indefinite goal lock)
      reservationTable.reservePath(
        robot.id,
        [{ x: robot.position.x, y: robot.position.y, t: currentTime }],
        false
      );
      updatedRobots.push({
        ...robot,
        plannedPath: [{ x: robot.position.x, y: robot.position.y, t: currentTime }],
        pathIndex: 0,
        status: 'WAITING',
        priorityAge: (robot.priorityAge || 0) + 5,
        replanCount: robot.replanCount + 1,
      });
    }
  }

  // Re-sort updatedRobots by natural numeric ID order (R1..R10)
  updatedRobots.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

  return {
    plannedRobots: updatedRobots,
    planningResults: results,
    totalPlanningTimeMs: performance.now() - tStart,
  };
}
