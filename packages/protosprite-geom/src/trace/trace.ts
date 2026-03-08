import { contours } from "d3-contour";

import { Vec2Data } from "../core/data.js";

export interface ImageDataLike {
  width: number;
  height: number;
  data: Uint8Array | Buffer;
}

export function traceContours(
  imageData: ImageDataLike,
  alphaThreshold: number = 1
): Vec2Data[][] {
  const { width, height, data } = imageData;

  // Build a 1D flat array of alpha values with 1px of zero-padding on all sides.
  // This ensures marching squares can properly close contours when opaque
  // pixels touch the image edge, without producing a spurious outer loop.
  const paddedW = width + 2;
  const paddedH = height + 2;
  const grid = new Array<number>(paddedW * paddedH).fill(0);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      // d3-contour indexes as values[i + j * width] where i=col, j=row
      const dstIdx = (x + 1) + (y + 1) * paddedW;
      grid[dstIdx] = data[srcIdx + 3]; // alpha channel
    }
  }

  // Run marching squares via d3-contour on the padded grid.
  // smooth(false) produces staircase edges matching the original behavior.
  const generator = contours()
    .size([paddedW, paddedH])
    .smooth(false);

  const multiPolygon = generator.contour(grid, alphaThreshold);

  // Extract rings from the GeoJSON MultiPolygon, subtracting the 1px padding offset.
  const result: Vec2Data[][] = [];
  for (const polygon of multiPolygon.coordinates) {
    for (const ring of polygon) {
      if (ring.length < 3) continue;
      const polyVerts: Vec2Data[] = [];
      for (const [px, py] of ring) {
        const v = new Vec2Data();
        v.x = px - 1;
        v.y = py - 1;
        polyVerts.push(v);
      }
      result.push(polyVerts);
    }
  }

  return result;
}
