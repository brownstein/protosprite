declare module "marchingsquares" {
  export function isoContours(
    data: number[][],
    threshold: number,
    options?: {
      linearRing?: boolean;
      noQuadTree?: boolean;
      noFrame?: boolean;
    }
  ): number[][][];

  export function isoBands(
    data: number[][],
    minV: number,
    bandWidth: number,
    options?: {
      linearRing?: boolean;
      noQuadTree?: boolean;
      noFrame?: boolean;
    }
  ): number[][][];
}
