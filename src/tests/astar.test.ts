import { describe, it, expect } from 'vitest';
import { findPathAStar } from '../algorithms/astar';
import { Position } from '../types/grid';

describe('Single Robot A* Algorithm', () => {
  const width = 10;
  const height = 10;

  it('finds the straight line shortest path in an empty grid', () => {
    const start: Position = { x: 1, y: 1 };
    const goal: Position = { x: 5, y: 1 };

    const result = findPathAStar(start, goal, {
      width,
      height,
      isCellTraversable: () => true,
    });

    expect(result.success).toBe(true);
    expect(result.path.length).toBe(5); // (1,1), (2,1), (3,1), (4,1), (5,1)
    expect(result.cost).toBe(4);
    expect(result.path[0]).toEqual(start);
    expect(result.path[result.path.length - 1]).toEqual(goal);
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.exploredNodesCount).toBeGreaterThan(0);
  });

  it('avoids obstacles and navigates around a wall', () => {
    const start: Position = { x: 1, y: 3 };
    const goal: Position = { x: 5, y: 3 };

    // Wall at x=3, y=1..4
    const isTraversable = (pos: Position) => {
      if (pos.x === 3 && pos.y >= 1 && pos.y <= 4) return false;
      return true;
    };

    const result = findPathAStar(start, goal, {
      width,
      height,
      isCellTraversable: isTraversable,
    });

    expect(result.success).toBe(true);
    // Path should avoid wall cells
    for (const step of result.path) {
      expect(isTraversable(step)).toBe(true);
    }
    expect(result.path[0]).toEqual(start);
    expect(result.path[result.path.length - 1]).toEqual(goal);
  });

  it('correctly handles unreachable destinations completely enclosed by obstacles', () => {
    const start: Position = { x: 0, y: 0 };
    const goal: Position = { x: 2, y: 2 };

    // Box around (2,2)
    const isTraversable = (pos: Position) => {
      if (
        (pos.x === 1 && pos.y >= 1 && pos.y <= 3) ||
        (pos.x === 3 && pos.y >= 1 && pos.y <= 3) ||
        (pos.y === 1 && pos.x >= 1 && pos.x <= 3) ||
        (pos.y === 3 && pos.x >= 1 && pos.x <= 3)
      ) {
        return false;
      }
      return true;
    };

    const result = findPathAStar(start, goal, {
      width,
      height,
      isCellTraversable: isTraversable,
    });

    expect(result.success).toBe(false);
    expect(result.path).toEqual([]);
    expect(result.failureReason).toContain('unreachable');
  });

  it('handles start point being identical to destination', () => {
    const start: Position = { x: 4, y: 4 };
    const goal: Position = { x: 4, y: 4 };

    const result = findPathAStar(start, goal, {
      width,
      height,
      isCellTraversable: () => true,
    });

    expect(result.success).toBe(true);
    expect(result.path.length).toBe(1);
    expect(result.cost).toBe(0);
  });

  it('fails safely when start or goal is blocked', () => {
    const start: Position = { x: 1, y: 1 };
    const goal: Position = { x: 8, y: 8 };

    const result = findPathAStar(start, goal, {
      width,
      height,
      isCellTraversable: (pos) => !(pos.x === 1 && pos.y === 1), // start blocked
    });

    expect(result.success).toBe(false);
    expect(result.failureReason).toContain('blocked');
  });
});
