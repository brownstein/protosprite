# protosprite-geom

Polygon geometry tracing and encoding for `protosprite`, a protobuf-based sprite sheet encoding format. This package traces sprite images into vector polygon geometry, performs convex decomposition for physics/collision use, and serializes the results using Protocol Buffers.

Check out the Three.js-based demo [here](https://brownstein.github.io/protosprite/).

## Installation

```
npm install protosprite-geom
```

## Main Exports

- `ProtoSpriteGeometry`: top-level container for sprite geometry data. Handles serialization to/from binary protobuf (`.prsg` files) and provides accessor methods for resolved geometry.
- `Protos`: protobuf types and schemas under a single key.
- `Data`: all data classes under a single key.

### Data Classes

- `SpriteGeometryData` - top-level geometry container for multiple sprites.
- `SpriteGeometryEntryData` - geometry for a single sprite across all frames, including the de-duplicated shape pool.
- `ShapePoolEntryData` - a de-duplicated (polygon, convex decomposition) pair stored in the shape pool.
- `FrameGeometryData` - geometry for a single frame, with per-layer and composite data.
- `FrameLayerGeometryData` - shape indices for a single layer within a frame.
- `CompositeFrameGeometryData` - shape indices from all layers of a frame composited together.
- `PolygonData` - a closed polygon (ordered ring of vertices).
- `ConvexDecompositionData` - convex decomposition of a polygon into convex components.
- `Vec2Data` - a 2D vector with sub-pixel precision.

### Shape Pool

Geometry data is de-duplicated using a **shape pool** on each `SpriteGeometryEntryData`. Instead of storing full polygon vertex data on every frame, each frame stores integer indices into `entry.shapePool`. Identical shapes across frames (common in animations where layers don't change between frames) are stored only once.

The `ShapePoolEntryData` pairs a `PolygonData` with its corresponding `ConvexDecompositionData`.

### Resolved Geometry Types

For convenience, `ProtoSpriteGeometry` provides methods that resolve shape pool indices into concrete polygon data:

- `ResolvedFrameGeometry` - resolved geometry for a frame, with layers and optional composite.
- `ResolvedLayerGeometry` - resolved polygons and convex decompositions for a single layer.
- `ResolvedCompositeGeometry` - resolved polygons and convex decompositions for the composite frame.

### Trace Utilities

This package provides geometry tracing utilities under the `protosprite-geom/trace` subpath:

- `traceSpriteSheet(sheet, options)` - traces polygon geometry from a `ProtoSpriteSheet`. Supports per-layer and composite tracing modes. Automatically de-duplicates shapes into the shape pool.
- `traceContours(imageData, alphaThreshold?)` - traces polygon contours from image data using the marching squares algorithm.
- `simplifyPolygon(polygon, tolerance, highQuality?)` - reduces polygon vertex count using the Ramer-Douglas-Peucker algorithm.
- `decomposeConvex(polygon)` - decomposes a polygon into convex components.

#### TraceSpriteSheetOptions

| Option | Type | Default | Description |
|---|---|---|---|
| `tolerance` | `number` | required | Simplification tolerance (higher = fewer vertices) |
| `alphaThreshold` | `number` | `1` | Alpha value threshold for contour detection |
| `highQuality` | `boolean` | `true` | Use higher quality simplification |
| `composite` | `boolean` | `true` | Generate composite frame geometry |
| `perLayer` | `boolean` | `false` | Generate per-layer geometry |

## Usage

### Tracing geometry from a sprite sheet

```typescript
import { ProtoSpriteGeometry } from "protosprite-geom";
import { traceSpriteSheet } from "protosprite-geom/trace";

const geomData = await traceSpriteSheet(spriteSheet, {
  tolerance: 0.5,
  composite: true,
  perLayer: false,
});

const geom = new ProtoSpriteGeometry(geomData);
geom.embedSpriteSheet(spriteSheet);

const bytes = geom.toArray(); // Uint8Array
```

### Loading and reading geometry

```typescript
import { ProtoSpriteGeometry } from "protosprite-geom";

const bytes = new Uint8Array(buffer);
const geom = ProtoSpriteGeometry.fromArray(bytes);

// Use the accessor API to get resolved geometry for a frame
const frame = geom.getFrameGeometry("my-sprite", 0);
if (frame) {
  for (const layer of frame.layers) {
    console.log(layer.polygons);            // PolygonData[]
    console.log(layer.convexDecompositions); // ConvexDecompositionData[]
  }
  if (frame.composite) {
    console.log(frame.composite.polygons);
  }
}

// Or access the raw shape pool directly
const entry = geom.getEntry("my-sprite");
if (entry) {
  console.log(`${entry.shapePool.length} unique shapes`);
}
```

### Low-level contour tracing

```typescript
import { traceContours, simplifyPolygon, decomposeConvex } from "protosprite-geom/trace";

const contours = traceContours({ width, height, data: rgbaBuffer });

for (const contour of contours) {
  const simplified = simplifyPolygon(contour, 1.0);
  const convexParts = decomposeConvex(simplified);
}
```
