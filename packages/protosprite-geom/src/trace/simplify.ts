import simplify from "simplify-js";

import { Vec2Data } from "../core/data.js";

export function simplifyPolygon(
  polygon: Vec2Data[],
  tolerance: number,
  highQuality: boolean = true
): Vec2Data[] {
  if (polygon.length < 3) return polygon;

  const points = polygon.map((v) => ({ x: v.x, y: v.y }));
  const simplified = simplify(points, tolerance, highQuality);

  return simplified.map((p) => {
    const v = new Vec2Data();
    v.x = p.x;
    v.y = p.y;
    return v;
  });
}
