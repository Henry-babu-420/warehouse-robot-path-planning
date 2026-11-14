import { Position } from '../types/grid';
import { PathNode, PlanningResult } from '../types/path';
import { manhattanDistance, posEquals, posKey, DIRECTIONS_4 } from '../utils/heuristics';
import { isTraversable } from '../utils/warehousePresets';

export interface AStarOptions {
  width: number;
  height: number;
  isCellTraversable: (pos: Position) => boolean;
  maxExpandedNodes?: number;
}

export class PriorityQueue<T> {
  private items: Array<{ item: T; priority: number }> = [];

  enqueue(item: T, priority: number) {
    this.items.push({ item, priority });
    this.bubbleUp(this.items.length - 1);
  }

  dequeue(): T | undefined {
    if (this.isEmpty()) return undefined;
    const min = this.items[0];
    const end = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = end;
      this.sinkDown(0);
    }
    return min.item;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  size(): number {
    return this.items.length;
  }

  private bubbleUp(n: number) {
    const element = this.items[n];
    while (n > 0) {
      const parentN = Math.floor((n - 1) / 2);
      const parent = this.items[parentN];
      if (element.priority >= parent.priority) break;
      this.items[parentN] = element;
      this.items[n] = parent;
      n = parentN;
    }
  }

  private sinkDown(n: number) {
    const length = this.items.length;
    const element = this.items[n];
    while (true) {
      let leftChildN = 2 * n + 1;
      let rightChildN = 2 * n + 2;
      let swap = -1;

      if (leftChildN < length) {
        if (this.items[leftChildN].priority < element.priority) {
          swap = leftChildN;
        }
      }

      if (rightChildN < length) {
        if (
          (swap === -1 && this.items[rightChildN].priority < element.priority) ||
          (swap !== -1 && this.items[rightChildN].priority < this.items[leftChildN].priority)
        ) {
          swap = rightChildN;
        }
      }

      if (swap === -1) break;
      this.items[n] = this.items[swap];
      this.items[swap] = element;
      n = swap;
    }
  }
}

/**
 * Standard A* algorithm for single-robot shortest path planning.
 * Uses Manhattan distance heuristic and 4-directional movement.
 */
export function findPathAStar(
  start: Position,
  goal: Position,
  options: AStarOptions,
  robotId: string = 'R_SINGLE'
): PlanningResult {
  const startTime = performance.now();
  const { width, height, isCellTraversable, maxExpandedNodes = 5000 } = options;

  // Validation: start or goal out of bounds or non-traversable
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
      failureReason: 'Start or goal position is out of grid bounds',
      timestamp: Date.now(),
    };
  }

  if (!isCellTraversable(start)) {
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
      failureReason: 'Start position is blocked or non-traversable',
      timestamp: Date.now(),
    };
  }

  if (!isCellTraversable(goal)) {
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
      failureReason: 'Goal destination is blocked or non-traversable',
      timestamp: Date.now(),
    };
  }

  // Trivial case: already at goal
  if (posEquals(start, goal)) {
    return {
      robotId,
      success: true,
      path: [{ x: start.x, y: start.y }],
      timeIndexedPath: [{ x: start.x, y: start.y, t: 0 }],
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
    g: 0,
    h: startH,
    f: startH,
    parent: null,
  };

  const startKey = posKey(start);
  openQueue.enqueue(startNode, startNode.f);
  openSet.set(startKey, startNode);

  let targetNode: PathNode | null = null;
  let exploredCount = 0;

  while (!openQueue.isEmpty()) {
    const current = openQueue.dequeue()!;
    const currentKey = posKey(current);

    // If node was replaced by better one in openSet, skip
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
        failureReason: `Exceeded maximum expansion limit (${maxExpandedNodes})`,
        timestamp: Date.now(),
      };
    }

    // Check goal condition
    if (current.x === goal.x && current.y === goal.y) {
      targetNode = current;
      break;
    }

    // Explore 4-directional neighbors
    for (const dir of DIRECTIONS_4) {
      const nx = current.x + dir.dx;
      const ny = current.y + dir.dy;
      const neighborPos: Position = { x: nx, y: ny };
      const nKey = posKey(neighborPos);

      // Boundary check
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      // Closed check
      if (closedSet.has(nKey)) continue;
      // Traversability check
      if (!isCellTraversable(neighborPos)) continue;

      const tentativeG = current.g + 1; // Unit step cost
      const existingInOpen = openSet.get(nKey);

      if (!existingInOpen || tentativeG < existingInOpen.g) {
        const h = manhattanDistance(neighborPos, goal);
        const neighborNode: PathNode = {
          x: nx,
          y: ny,
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
      failureReason: 'No valid path found (destination is blocked or unreachable)',
      timestamp: Date.now(),
    };
  }

  // Reconstruct path
  const path: Position[] = [];
  let curr: PathNode | null = targetNode;
  while (curr !== null) {
    path.unshift({ x: curr.x, y: curr.y });
    curr = curr.parent;
  }

  const timeIndexedPath = path.map((pos, idx) => ({
    x: pos.x,
    y: pos.y,
    t: idx,
  }));

  return {
    robotId,
    success: true,
    path,
    timeIndexedPath,
    exploredNodes: exploredPositions,
    visitedNodesCount: closedSet.size + openSet.size,
    exploredNodesCount: exploredCount,
    executionTimeMs,
    cost: path.length - 1,
    timestamp: Date.now(),
  };
}
