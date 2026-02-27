declare module "poly-decomp" {
  type Polygon = number[][];

  export function decomp(polygon: Polygon): Polygon[] | false;
  export function quickDecomp(polygon: Polygon): Polygon[];
  export function isSimple(polygon: Polygon): boolean;
  export function removeCollinearPoints(polygon: Polygon, precision?: number): void;
  export function removeDuplicatePoints(polygon: Polygon, precision?: number): void;
  export function makeCCW(polygon: Polygon): void;
}
