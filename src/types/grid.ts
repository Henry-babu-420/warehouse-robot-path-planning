export type CellType = 
  | 'EMPTY'
  | 'SHELF'
  | 'WALL'
  | 'STATIC_OBSTACLE'
  | 'DYNAMIC_OBSTACLE'
  | 'PICKUP'
  | 'DELIVERY'
  | 'PASSING_BAY';

export interface Position {
  x: number;
  y: number;
}

export interface GridCell {
  x: number;
  y: number;
  type: CellType;
  stationId?: string; // e.g. "P1", "D1"
}

export interface Station {
  id: string;
  name: string;
  type: 'PICKUP' | 'DELIVERY';
  position: Position;
  color?: string;
}

export interface WarehouseLayout {
  width: number;
  height: number;
  cells: CellType[][];
  stations: Station[];
}

export type ToolMode = 
  | 'SELECT'
  | 'OBSTACLE'
  | 'DYNAMIC_OBSTACLE'
  | 'SHELF'
  | 'PICKUP'
  | 'DELIVERY'
  | 'ERASE'
  | 'PLACE_ROBOT';
