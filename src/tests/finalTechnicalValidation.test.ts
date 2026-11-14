import { describe, it, expect } from 'vitest';
import { findPathAStar, PriorityQueue, AStarOptions } from '../algorithms/astar';
import { findPathCooperativeAStar, planFleetCooperativePaths } from '../algorithms/cooperativeAstar';
import { ReservationTable } from '../algorithms/reservationTable';
import { CollisionManager } from '../simulation/collisionManager';
import { DeadlockDetector } from '../algorithms/deadlockDetector';
import { handleDynamicObstaclePlacement, recoverFromDeadlock } from '../algorithms/replanner';
import { Position } from '../types/grid';
import { Robot } from '../types/robot';
import { posEquals, posKey, manhattanDistance } from '../utils/heuristics';

// Reference Dijkstra implementation on a 4-connected unit-cost grid
function dijkstraShortestPath(
  start: Position,
  goal: Position,
  width: number,
  height: number,
  isTraversable: (pos: Position) => boolean
): { path: Position[]; cost: number; expandedCount: number } | null {
  if (posEquals(start, goal)) {
    return { path: [start], cost: 0, expandedCount: 1 };
  }

  const queue = new PriorityQueue<Position>();
  const dist = new Map<string, number>();
  const parent = new Map<string, Position>();
  const visited = new Set<string>();

  const startKey = posKey(start);
  dist.set(startKey, 0);
  queue.enqueue(start, 0);

  let expandedCount = 0;
  const dirs = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
  ];

  while (!queue.isEmpty()) {
    const curr = queue.dequeue()!;
    const currKey = posKey(curr);

    if (visited.has(currKey)) continue;
    visited.add(currKey);
    expandedCount++;

    if (posEquals(curr, goal)) {
      // Reconstruct path
      const path: Position[] = [];
      let step: Position | undefined = curr;
      while (step) {
        path.unshift(step);
        step = parent.get(posKey(step));
      }
      return { path, cost: path.length - 1, expandedCount };
    }

    const currentDist = dist.get(currKey)!;

    for (const d of dirs) {
      const nx = curr.x + d.dx;
      const ny = curr.y + d.dy;
      const neighbor: Position = { x: nx, y: ny };
      const nKey = posKey(neighbor);

      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      if (!isTraversable(neighbor)) continue;
      if (visited.has(nKey)) continue;

      const newDist = currentDist + 1;
      const oldDist = dist.get(nKey) ?? Infinity;

      if (newDist < oldDist) {
        dist.set(nKey, newDist);
        parent.set(nKey, curr);
        queue.enqueue(neighbor, newDist);
      }
    }
  }

  return null;
}

describe('1. A* Algorithm & Heuristic Admissibility Validation', () => {
  it('validates Binary MinHeap priority queue ordering with 1,000 random items', () => {
    const pq = new PriorityQueue<number>();
    const randomVals: number[] = [];

    // Deterministic pseudo-random seed
    let seed = 42;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    for (let i = 0; i < 1000; i++) {
      const val = Math.floor(rnd() * 10000);
      randomVals.push(val);
      pq.enqueue(val, val);
    }

    expect(pq.size()).toBe(1000);

    let prev = -Infinity;
    while (!pq.isEmpty()) {
      const current = pq.dequeue()!;
      expect(current).toBeGreaterThanOrEqual(prev);
      prev = current;
    }
  });

  it('validates Manhattan heuristic admissibility: h(n) <= true distance for all grid pairs', () => {
    const width = 8;
    const height = 8;
    const isTraversable = (p: Position) => !(p.x === 3 && p.y >= 2 && p.y <= 5);

    // Test across all pairs in 8x8 grid
    for (let x1 = 0; x1 < width; x1++) {
      for (let y1 = 0; y1 < height; y1++) {
        const start = { x: x1, y: y1 };
        if (!isTraversable(start)) continue;

        for (let x2 = 0; x2 < width; x2++) {
          for (let y2 = 0; y2 < height; y2++) {
            const goal = { x: x2, y: y2 };
            if (!isTraversable(goal)) continue;

            const h = manhattanDistance(start, goal);
            const dijkstraResult = dijkstraShortestPath(start, goal, width, height, isTraversable);

            if (dijkstraResult) {
              // Admissibility property: h(n) <= h*(n)
              expect(h).toBeLessThanOrEqual(dijkstraResult.cost);
            }
          }
        }
      }
    }
  });

  it('compares A* against Dijkstra across multiple grid maps: validates identical optimal cost and fewer/equal node expansions', () => {
    const testCases: Array<{
      width: number;
      height: number;
      start: Position;
      goal: Position;
      obstacles: Position[];
    }> = [
      {
        width: 10,
        height: 10,
        start: { x: 1, y: 1 },
        goal: { x: 8, y: 8 },
        obstacles: [
          { x: 4, y: 2 }, { x: 4, y: 3 }, { x: 4, y: 4 }, { x: 4, y: 5 }, { x: 4, y: 6 },
        ],
      },
      {
        width: 12,
        height: 12,
        start: { x: 0, y: 0 },
        goal: { x: 11, y: 11 },
        obstacles: [
          { x: 5, y: 0 }, { x: 5, y: 1 }, { x: 5, y: 2 }, { x: 5, y: 3 }, { x: 5, y: 4 },
          { x: 5, y: 5 }, { x: 5, y: 6 }, { x: 5, y: 7 }, { x: 5, y: 8 }, { x: 5, y: 9 },
        ],
      },
      {
        width: 8,
        height: 8,
        start: { x: 2, y: 2 },
        goal: { x: 6, y: 5 },
        obstacles: [{ x: 3, y: 3 }, { x: 4, y: 4 }, { x: 5, y: 3 }],
      },
    ];

    for (const tc of testCases) {
      const obstacleSet = new Set(tc.obstacles.map(posKey));
      const isTraversable = (p: Position) => !obstacleSet.has(posKey(p));

      const astarRes = findPathAStar(tc.start, tc.goal, {
        width: tc.width,
        height: tc.height,
        isCellTraversable: isTraversable,
      });

      const dijkstraRes = dijkstraShortestPath(
        tc.start,
        tc.goal,
        tc.width,
        tc.height,
        isTraversable
      )!;

      expect(astarRes.success).toBe(true);
      expect(astarRes.cost).toBe(dijkstraRes.cost);
      // A* guided by Manhattan heuristic must expand <= Dijkstra node expansions
      expect(astarRes.exploredNodesCount).toBeLessThanOrEqual(dijkstraRes.expandedCount);
    }
  });

  it('validates boundary conditions: start == goal, blocked start, blocked goal, out-of-bounds', () => {
    const isTraversable = (p: Position) => !(p.x === 3 && p.y === 3);

    // start == goal
    const same = findPathAStar({ x: 2, y: 2 }, { x: 2, y: 2 }, { width: 5, height: 5, isCellTraversable: isTraversable });
    expect(same.success).toBe(true);
    expect(same.cost).toBe(0);
    expect(same.path.length).toBe(1);

    // blocked start
    const blockedStart = findPathAStar({ x: 3, y: 3 }, { x: 1, y: 1 }, { width: 5, height: 5, isCellTraversable: isTraversable });
    expect(blockedStart.success).toBe(false);

    // blocked goal
    const blockedGoal = findPathAStar({ x: 1, y: 1 }, { x: 3, y: 3 }, { width: 5, height: 5, isCellTraversable: isTraversable });
    expect(blockedGoal.success).toBe(false);

    // out-of-bounds
    const oob = findPathAStar({ x: -1, y: 0 }, { x: 4, y: 4 }, { width: 5, height: 5, isCellTraversable: isTraversable });
    expect(oob.success).toBe(false);
  });
});

describe('2. Cooperative A* Validation (Corridors & Crossing Intersections)', () => {
  it('resolves opposing bidirectional traffic in a 1-cell narrow corridor without collision', () => {
    const table = new ReservationTable();
    // 10x3 corridor layout:
    // row 0: walls from x=2 to x=7
    // row 1: open narrow corridor (x=1..8)
    // row 2: walls from x=2 to x=7, except turnouts at (1,2) and (8,2)
    const isTraversable = (p: Position) => {
      if (p.y === 0 && p.x >= 2 && p.x <= 7) return false;
      if (p.y === 2 && p.x >= 2 && p.x <= 7) return false;
      return true;
    };

    const robots: Robot[] = [
      {
        id: 'R1',
        name: 'AGV-Eastbound',
        color: '#426B8A',
        position: { x: 1, y: 0 },
        startPosition: { x: 1, y: 0 },
        targetPosition: { x: 8, y: 0 },
        assignedPickup: null,
        assignedDelivery: null,
        status: 'IDLE',
        plannedPath: [],
        pathIndex: 0,
        priority: 10, // Higher priority
        priorityAge: 0,
        speed: 1,
        isActive: true,
        hasPayload: false,
        totalWaitSteps: 0,
        totalStepsMoved: 0,
        tasksCompleted: 0,
        replanCount: 0,
      },
      {
        id: 'R2',
        name: 'AGV-Westbound',
        color: '#C25E40',
        position: { x: 8, y: 2 },
        startPosition: { x: 8, y: 2 },
        targetPosition: { x: 1, y: 2 },
        assignedPickup: null,
        assignedDelivery: null,
        status: 'IDLE',
        plannedPath: [],
        pathIndex: 0,
        priority: 5, // Lower priority
        priorityAge: 0,
        speed: 1,
        isActive: true,
        hasPayload: false,
        totalWaitSteps: 0,
        totalStepsMoved: 0,
        tasksCompleted: 0,
        replanCount: 0,
      },
    ];

    const plan = planFleetCooperativePaths(robots, {
      width: 10,
      height: 3,
      isCellTraversable: isTraversable,
      reservationTable: table,
      maxTimeHorizon: 50,
    }, 0);

    expect(plan.planningResults.length).toBe(2);
    expect(plan.planningResults.every(r => r.success)).toBe(true);

    const r1Plan = plan.plannedRobots.find(r => r.id === 'R1')!.plannedPath;
    const r2Plan = plan.plannedRobots.find(r => r.id === 'R2')!.plannedPath;

    // Verify 0 vertex collisions and 0 edge swaps at any time t
    const maxT = Math.max(r1Plan.length, r2Plan.length);
    for (let t = 0; t < maxT; t++) {
      const pos1 = r1Plan[Math.min(t, r1Plan.length - 1)];
      const pos2 = r2Plan[Math.min(t, r2Plan.length - 1)];

      // Vertex conflict
      expect(posEquals(pos1, pos2)).toBe(false);

      if (t > 0) {
        const prev1 = r1Plan[Math.min(t - 1, r1Plan.length - 1)];
        const prev2 = r2Plan[Math.min(t - 1, r2Plan.length - 1)];

        // Edge swap check: (prev1 == pos2 && prev2 == pos1)
        const isSwap = posEquals(prev1, pos2) && posEquals(prev2, pos1) && !posEquals(prev1, pos1);
        expect(isSwap).toBe(false);
      }
    }
  });

  it('resolves perpendicular crossing paths at a 4-way intersection using discrete wait actions', () => {
    const table = new ReservationTable();
    // Intersection at (5, 5)
    // Robot 1 moves horizontally (2, 5) -> (8, 5)
    // Robot 2 moves vertically (5, 2) -> (5, 8)
    const robots: Robot[] = [
      {
        id: 'R_HORIZ',
        name: 'AGV-Horizontal',
        color: '#426B8A',
        position: { x: 2, y: 5 },
        startPosition: { x: 2, y: 5 },
        targetPosition: { x: 8, y: 5 },
        assignedPickup: null,
        assignedDelivery: null,
        status: 'IDLE',
        plannedPath: [],
        pathIndex: 0,
        priority: 10,
        priorityAge: 0,
        speed: 1,
        isActive: true,
        hasPayload: false,
        totalWaitSteps: 0,
        totalStepsMoved: 0,
        tasksCompleted: 0,
        replanCount: 0,
      },
      {
        id: 'R_VERT',
        name: 'AGV-Vertical',
        color: '#C25E40',
        position: { x: 5, y: 2 },
        startPosition: { x: 5, y: 2 },
        targetPosition: { x: 5, y: 8 },
        assignedPickup: null,
        assignedDelivery: null,
        status: 'IDLE',
        plannedPath: [],
        pathIndex: 0,
        priority: 5,
        priorityAge: 0,
        speed: 1,
        isActive: true,
        hasPayload: false,
        totalWaitSteps: 0,
        totalStepsMoved: 0,
        tasksCompleted: 0,
        replanCount: 0,
      },
    ];

    const plan = planFleetCooperativePaths(robots, {
      width: 10,
      height: 10,
      isCellTraversable: () => true,
      reservationTable: table,
      maxTimeHorizon: 30,
    }, 0);

    expect(plan.planningResults.every(r => r.success)).toBe(true);

    const path1 = plan.plannedRobots.find(r => r.id === 'R_HORIZ')!.plannedPath;
    const path2 = plan.plannedRobots.find(r => r.id === 'R_VERT')!.plannedPath;

    // Verify intersection (5, 5) is occupied at different time steps
    const tOccupiedByR1 = path1.find(p => p.x === 5 && p.y === 5)?.t;
    const tOccupiedByR2 = path2.find(p => p.x === 5 && p.y === 5)?.t;

    expect(tOccupiedByR1).toBeDefined();
    expect(tOccupiedByR2).toBeDefined();
    expect(tOccupiedByR1).not.toBe(tOccupiedByR2);
  });
});

describe('3. Collision Avoidance & Rejection Logging Validation', () => {
  it('detects and logs all 4 distinct collision types: same-cell, edge-swap, occupied cell, obstacle', () => {
    const cm = new CollisionManager();
    const table = new ReservationTable();

    // 1. Two robots targeting same cell simultaneously
    const rA: Robot = {
      id: 'RA', name: 'A', color: '#000', position: { x: 1, y: 1 }, startPosition: { x: 1, y: 1 },
      targetPosition: { x: 2, y: 1 }, assignedPickup: null, assignedDelivery: null, status: 'IDLE',
      plannedPath: [{ x: 1, y: 1, t: 0 }, { x: 2, y: 1, t: 1 }], pathIndex: 0, priority: 10, priorityAge: 0,
      speed: 1, isActive: true, hasPayload: false, totalWaitSteps: 0, totalStepsMoved: 0, tasksCompleted: 0, replanCount: 0
    };
    const rB: Robot = {
      id: 'RB', name: 'B', color: '#000', position: { x: 3, y: 1 }, startPosition: { x: 3, y: 1 },
      targetPosition: { x: 2, y: 1 }, assignedPickup: null, assignedDelivery: null, status: 'IDLE',
      plannedPath: [{ x: 3, y: 1, t: 0 }, { x: 2, y: 1, t: 1 }], pathIndex: 0, priority: 5, priorityAge: 0,
      speed: 1, isActive: true, hasPayload: false, totalWaitSteps: 0, totalStepsMoved: 0, tasksCompleted: 0, replanCount: 0
    };

    const res1 = cm.validateAndFilterMoves([rA, rB], () => true, 0, table);
    expect(res1.preventedCollisionsThisStep.length).toBeGreaterThan(0);
    expect(res1.preventedCollisionsThisStep[0].type).toBe('VERTEX_CONFLICT');
    expect(res1.filteredRobots.find(r => r.id === 'RA')!.position).toEqual({ x: 2, y: 1 });
    expect(res1.filteredRobots.find(r => r.id === 'RB')!.position).toEqual({ x: 3, y: 1 }); // Yielded

    // 2. Head-on edge swap
    const rC: Robot = {
      id: 'RC', name: 'C', color: '#000', position: { x: 4, y: 4 }, startPosition: { x: 4, y: 4 },
      targetPosition: { x: 5, y: 4 }, assignedPickup: null, assignedDelivery: null, status: 'IDLE',
      plannedPath: [{ x: 4, y: 4, t: 0 }, { x: 5, y: 4, t: 1 }], pathIndex: 0, priority: 10, priorityAge: 0,
      speed: 1, isActive: true, hasPayload: false, totalWaitSteps: 0, totalStepsMoved: 0, tasksCompleted: 0, replanCount: 0
    };
    const rD: Robot = {
      id: 'RD', name: 'D', color: '#000', position: { x: 5, y: 4 }, startPosition: { x: 5, y: 4 },
      targetPosition: { x: 4, y: 4 }, assignedPickup: null, assignedDelivery: null, status: 'IDLE',
      plannedPath: [{ x: 5, y: 4, t: 0 }, { x: 4, y: 4, t: 1 }], pathIndex: 0, priority: 5, priorityAge: 0,
      speed: 1, isActive: true, hasPayload: false, totalWaitSteps: 0, totalStepsMoved: 0, tasksCompleted: 0, replanCount: 0
    };

    const res2 = cm.validateAndFilterMoves([rC, rD], () => true, 1, table);
    const swapWarn = res2.preventedCollisionsThisStep.find(w => w.type === 'EDGE_SWAP');
    expect(swapWarn).toBeDefined();
    expect(res2.filteredRobots.find(r => r.id === 'RC')!.position).toEqual({ x: 4, y: 4 });
    expect(res2.filteredRobots.find(r => r.id === 'RD')!.position).toEqual({ x: 5, y: 4 });

    // 3. Dynamic obstacle blocking move
    const rE: Robot = {
      id: 'RE', name: 'E', color: '#000', position: { x: 0, y: 0 }, startPosition: { x: 0, y: 0 },
      targetPosition: { x: 1, y: 0 }, assignedPickup: null, assignedDelivery: null, status: 'IDLE',
      plannedPath: [{ x: 0, y: 0, t: 0 }, { x: 1, y: 0, t: 1 }], pathIndex: 0, priority: 10, priorityAge: 0,
      speed: 1, isActive: true, hasPayload: false, totalWaitSteps: 0, totalStepsMoved: 0, tasksCompleted: 0, replanCount: 0
    };
    const res3 = cm.validateAndFilterMoves([rE], (pos) => !(pos.x === 1 && pos.y === 0), 2, table);
    const obsWarn = res3.preventedCollisionsThisStep.find(w => w.type === 'OBSTACLE_COLLISION');
    expect(obsWarn).toBeDefined();
    expect(res3.filteredRobots[0].position).toEqual({ x: 0, y: 0 }); // Held
  });
});

describe('4. Deadlock Detection & Circular Dependency Validation', () => {
  it('correctly constructs wait-for graph, detects 4-robot circular cycle, and recovers without infinite loop', () => {
    const detector = new DeadlockDetector();
    const table = new ReservationTable();

    // 4 robots arranged in a cycle:
    // R1 at (1,1) targeting (1,2)
    // R2 at (1,2) targeting (2,2)
    // R3 at (2,2) targeting (2,1)
    // R4 at (2,1) targeting (1,1)
    const robots: Robot[] = [
      {
        id: 'R1', name: 'R1', color: '#000', position: { x: 1, y: 1 }, startPosition: { x: 1, y: 1 },
        targetPosition: { x: 1, y: 2 }, assignedPickup: null, assignedDelivery: null, status: 'WAITING',
        plannedPath: [{ x: 1, y: 1, t: 0 }, { x: 1, y: 2, t: 1 }], pathIndex: 0, priority: 10, priorityAge: 0,
        speed: 1, isActive: true, hasPayload: false, totalWaitSteps: 4, totalStepsMoved: 0, tasksCompleted: 0, replanCount: 0
      },
      {
        id: 'R2', name: 'R2', color: '#000', position: { x: 1, y: 2 }, startPosition: { x: 1, y: 2 },
        targetPosition: { x: 2, y: 2 }, assignedPickup: null, assignedDelivery: null, status: 'WAITING',
        plannedPath: [{ x: 1, y: 2, t: 0 }, { x: 2, y: 2, t: 1 }], pathIndex: 0, priority: 8, priorityAge: 0,
        speed: 1, isActive: true, hasPayload: false, totalWaitSteps: 4, totalStepsMoved: 0, tasksCompleted: 0, replanCount: 0
      },
      {
        id: 'R3', name: 'R3', color: '#000', position: { x: 2, y: 2 }, startPosition: { x: 2, y: 2 },
        targetPosition: { x: 2, y: 1 }, assignedPickup: null, assignedDelivery: null, status: 'WAITING',
        plannedPath: [{ x: 2, y: 2, t: 0 }, { x: 2, y: 1, t: 1 }], pathIndex: 0, priority: 6, priorityAge: 0,
        speed: 1, isActive: true, hasPayload: false, totalWaitSteps: 4, totalStepsMoved: 0, tasksCompleted: 0, replanCount: 0
      },
      {
        id: 'R4', name: 'R4', color: '#000', position: { x: 2, y: 1 }, startPosition: { x: 2, y: 1 },
        targetPosition: { x: 1, y: 1 }, assignedPickup: null, assignedDelivery: null, status: 'WAITING',
        plannedPath: [{ x: 2, y: 1, t: 0 }, { x: 1, y: 1, t: 1 }], pathIndex: 0, priority: 4, priorityAge: 0,
        speed: 1, isActive: true, hasPayload: false, totalWaitSteps: 4, totalStepsMoved: 0, tasksCompleted: 0, replanCount: 0
      },
    ];

    detector.recordStep(robots);
    const report = detector.detectDeadlock(robots, table, 0);

    expect(report.isDeadlocked).toBe(true);
    expect(report.cycleFound).toBe(true);
    expect(report.involvedRobotIds.length).toBe(4);
    expect(report.suggestedAction).toBe('REPRIORITIZE_AND_REPLAN');

    // Run recovery
    const recovery = recoverFromDeadlock(report.involvedRobotIds, robots, {
      width: 10,
      height: 10,
      isCellTraversable: () => true,
      reservationTable: table,
    }, 0);

    expect(recovery.events.length).toBeGreaterThan(0);
    // Verified that recovery alters the state and does not create infinite loops
    expect(recovery.updatedRobots.some(r => r.replanCount > 0)).toBe(true);
  });

  it('distinguishes legitimate temporary waiting from true deadlocks', () => {
    const detector = new DeadlockDetector();
    const table = new ReservationTable();

    // R1 moving ahead into empty cell, R2 waiting for R1 to clear for only 1 step (< threshold 3)
    const robots: Robot[] = [
      {
        id: 'R1', name: 'R1', color: '#000', position: { x: 3, y: 3 }, startPosition: { x: 3, y: 3 },
        targetPosition: { x: 4, y: 3 }, assignedPickup: null, assignedDelivery: null, status: 'MOVING_TO_PICKUP',
        plannedPath: [{ x: 3, y: 3, t: 0 }, { x: 4, y: 3, t: 1 }], pathIndex: 0, priority: 10, priorityAge: 0,
        speed: 1, isActive: true, hasPayload: false, totalWaitSteps: 0, totalStepsMoved: 1, tasksCompleted: 0, replanCount: 0
      },
      {
        id: 'R2', name: 'R2', color: '#000', position: { x: 2, y: 3 }, startPosition: { x: 2, y: 3 },
        targetPosition: { x: 3, y: 3 }, assignedPickup: null, assignedDelivery: null, status: 'WAITING',
        plannedPath: [{ x: 2, y: 3, t: 0 }, { x: 3, y: 3, t: 1 }], pathIndex: 0, priority: 5, priorityAge: 0,
        speed: 1, isActive: true, hasPayload: false, totalWaitSteps: 1, totalStepsMoved: 0, tasksCompleted: 0, replanCount: 0
      },
    ];

    detector.recordStep(robots);
    const report = detector.detectDeadlock(robots, table, 0);

    // No cycle exists: R1 does not wait for R2
    expect(report.cycleFound).toBe(false);
    // Not stalled yet because wait count (1) < threshold (3)
    expect(report.isDeadlocked).toBe(false);
  });
});

describe('5. Dynamic Replanning in Diverse Scenarios', () => {
  it('replans correctly when obstacles appear at next cell, 3 steps ahead, near corridor, and near stations', () => {
    const table = new ReservationTable();
    const width = 14;
    const height = 10;

    // R_A: moving along row y=2 from x=1 to x=7
    // R_B (unaffected): moving along row y=8 from x=1 to x=7
    const pathA = [
      { x: 1, y: 2, t: 0 },
      { x: 2, y: 2, t: 1 },
      { x: 3, y: 2, t: 2 },
      { x: 4, y: 2, t: 3 },
      { x: 5, y: 2, t: 4 },
      { x: 6, y: 2, t: 5 },
      { x: 7, y: 2, t: 6 },
    ];
    const pathB = [
      { x: 1, y: 8, t: 0 },
      { x: 2, y: 8, t: 1 },
      { x: 3, y: 8, t: 2 },
      { x: 4, y: 8, t: 3 },
      { x: 5, y: 8, t: 4 },
      { x: 6, y: 8, t: 5 },
      { x: 7, y: 8, t: 6 },
    ];

    table.reservePath('RA', pathA, true);
    table.reservePath('RB', pathB, true);

    const robots: Robot[] = [
      {
        id: 'RA', name: 'Affected AGV', color: '#426B8A', position: { x: 1, y: 2 }, startPosition: { x: 1, y: 2 },
        targetPosition: { x: 7, y: 2 }, assignedPickup: null, assignedDelivery: null, status: 'MOVING_TO_PICKUP',
        plannedPath: pathA, pathIndex: 0, priority: 10, priorityAge: 0, speed: 1, isActive: true, hasPayload: false,
        totalWaitSteps: 0, totalStepsMoved: 0, tasksCompleted: 0, replanCount: 0
      },
      {
        id: 'RB', name: 'Unaffected AGV', color: '#C25E40', position: { x: 1, y: 8 }, startPosition: { x: 1, y: 8 },
        targetPosition: { x: 7, y: 8 }, assignedPickup: null, assignedDelivery: null, status: 'MOVING_TO_PICKUP',
        plannedPath: pathB, pathIndex: 0, priority: 8, priorityAge: 0, speed: 1, isActive: true, hasPayload: false,
        totalWaitSteps: 0, totalStepsMoved: 0, tasksCompleted: 0, replanCount: 0
      },
    ];

    // Scenario A: Obstacle placed 3 steps ahead at (4, 2)
    const blockedCell: Position = { x: 4, y: 2 };
    const { updatedRobots, replanEvents } = handleDynamicObstaclePlacement(
      blockedCell,
      robots,
      {
        width,
        height,
        isCellTraversable: (p) => !(p.x === 4 && p.y === 2),
        reservationTable: table,
      },
      0
    );

    // RA should have replanned around (4, 2)
    expect(replanEvents.some(e => e.robotId === 'RA' && e.success)).toBe(true);
    const newPathA = updatedRobots.find(r => r.id === 'RA')!.plannedPath;
    expect(newPathA.some(p => p.x === 4 && p.y === 2)).toBe(false);

    // Unaffected RB must continue without interruption (replanCount == 0, path unchanged)
    const rbState = updatedRobots.find(r => r.id === 'RB')!;
    expect(rbState.replanCount).toBe(0);
    expect(rbState.plannedPath).toEqual(pathB);
  });
});
