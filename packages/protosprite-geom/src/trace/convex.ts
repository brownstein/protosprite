import * as decomp from "poly-decomp";

import { Vec2Data } from "../core/data.js";

export function decomposeConvex(polygon: Vec2Data[]): Vec2Data[][] {
  if (polygon.length < 3) return [polygon];

  // Convert to poly-decomp format: [[x, y], ...]
  const polyDecompPolygon: number[][] = polygon.map((v) => [v.x, v.y]);

  // Ensure CCW winding order and clean up the polygon.
  decomp.makeCCW(polyDecompPolygon);
  decomp.removeDuplicatePoints(polyDecompPolygon, 0.01);
  decomp.removeCollinearPoints(polyDecompPolygon, 0.01);

  if (polyDecompPolygon.length < 3) return [polygon];

  // Attempt decomposition. quickDecomp is more robust than decomp for
  // complex polygons.
  let convexParts: number[][][];
  try {
    convexParts = decomp.quickDecomp(polyDecompPolygon);
  } catch {
    // Fallback: return the original polygon as a single "convex" part.
    return [polygon];
  }

  if (!convexParts || convexParts.length === 0) {
    return [polygon];
  }

  // Convert back to Vec2Data format.
  return convexParts.map((part) =>
    part.map((point) => {
      const v = new Vec2Data();
      v.x = point[0];
      v.y = point[1];
      return v;
    })
  );
}
