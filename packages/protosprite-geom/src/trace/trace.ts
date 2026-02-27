import { isoContours } from "marchingsquares";

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

  // Build a 2D grid of alpha values with 1px of zero-padding on all sides.
  // This ensures marching squares can properly close contours when opaque
  // pixels touch the image edge, without producing a spurious outer loop
  // (which the library's built-in frame does).
  const paddedW = width + 2;
  const paddedH = height + 2;
  const grid: number[][] = [];

  // Top padding row.
  grid.push(new Array(paddedW).fill(0));

  for (let y = 0; y < height; y++) {
    const row: number[] = [0]; // left padding
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      row.push(data[idx + 3]); // alpha channel
    }
    row.push(0); // right padding
    grid.push(row);
  }

  // Bottom padding row.
  grid.push(new Array(paddedW).fill(0));

  // Run marching squares on the padded grid.
  // noFrame: true since we added our own padding.
  const contours = isoContours(grid, alphaThreshold, { noFrame: true });

  // Convert to Vec2Data arrays, subtracting the 1px padding offset.
  const result: Vec2Data[][] = [];
  for (const contour of contours) {
    if (contour.length < 3) continue;
    const polygon: Vec2Data[] = [];
    for (const point of contour) {
      const v = new Vec2Data();
      v.x = point[0] - 1;
      v.y = point[1] - 1;
      polygon.push(v);
    }
    result.push(polygon);
  }

  return result;
}
