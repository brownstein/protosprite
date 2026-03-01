# protosprite-core

Core TypeScript implementation for `protosprite`, a protobuf-based sprite sheet encoding format. Contains protobuf types, serialization, data model classes, and utilities for building and transforming sprite sheets.

Check out the Three.js-based demo [here](https://brownstein.github.io/protosprite/).

## Installation

```bash
npm install protosprite-core
```

## Main Exports

- `ProtoSprite` (default) — a sprite within a `ProtoSpriteSheet`
- `ProtoSpriteSheet` — a sprite sheet container
- `ProtoSpriteInstance` — an instance of a `ProtoSprite` with animation state
- `Protos` — protobuf types and schemas
- `Data` — data model classes and type guards

## Usage

### Loading a `.prs` file

```ts
import { ProtoSpriteSheet } from "protosprite-core";

const response = await fetch("sprite.prs");
const bytes = new Uint8Array(await response.arrayBuffer());

const sheet = ProtoSpriteSheet.fromArray(bytes);
```

### Serialization

```ts
// Serialize to binary
const bytes: Uint8Array = sheet.toArray();

// Serialize to JSON
const json = sheet.toJsonObject();
```

### Working with sprites

```ts
const sprite = sheet.sprites[0];

console.log(sprite.data.name);
console.log(sprite.data.size);          // SizeData { width, height }
console.log(sprite.data.frames);        // FrameData[]
console.log(sprite.data.layers);        // LayerData[]
console.log(sprite.data.animations);    // AnimationData[]

console.log(sprite.countLayers());      // number of non-group layers
console.log(sprite.countGroups());      // number of group layers
```

### Creating an instance with animation

```ts
import { ProtoSpriteInstance } from "protosprite-core";

const instance = new ProtoSpriteInstance(sprite);
const { animationState } = instance;

// Start an animation by name
animationState.startAnimation("walk");

// Advance time (in milliseconds)
animationState.advance(16);

// Jump to a specific frame
animationState.gotoFrame(5);
animationState.gotoAnimationFrame(0); // first frame of current animation

// Control playback
animationState.speed = 1.5;
animationState.loop = false;

// Listen for events
animationState.events.on("FrameSwapped", () => { /* ... */ });
animationState.events.on("LoopComplete", () => { /* ... */ });
```

## Data Model

The `Data` namespace exports typed classes wrapping the protobuf messages. Each class has `fromProto()`, `toProto()`, and `clone()` methods.

| Class | Description |
|-------|-------------|
| `SpriteSheetData` | Top-level container with `sprites[]` and `pixelSource` |
| `SpriteData` | Name, size, frames, layers, animations, pixelSource |
| `FrameData` | Index, duration, and per-frame layers |
| `FrameLayerData` | Layer index, size, sheetPosition, spritePosition, zIndex |
| `LayerData` | Name, index, isGroup, parentIndex, opacity |
| `AnimationData` | Name, indexStart, indexEnd |
| `EmbeddedSpriteSheetData` | Inline PNG bytes |
| `ExternalSpriteSheetData` | External file/URL reference |

### Type Guards

```ts
import { Data } from "protosprite-core";

if (Data.isEmbeddedSpriteSheetData(sprite.data.pixelSource)) {
  // pixelSource.pngData contains the PNG bytes
}

if (Data.isExternalSpriteSheetData(sprite.data.pixelSource)) {
  // pixelSource.fileName or pixelSource.url
}
```

## Transform Utilities

Available under the `transform` subdirectory:

### `packSpriteSheet`

Bin-packs sprite cels into an optimized atlas, consolidating duplicate regions.

```ts
import { packSpriteSheet } from "protosprite-core/transform";

const packedSheet = await packSpriteSheet(sheet);
```

### `renderSpriteInstance`

Renders a sprite instance to a canvas/image buffer (Node.js).

```ts
import { renderSpriteInstance } from "protosprite-core/transform";
```

## Importers

### Aseprite

Converts an exported Aseprite JSON + PNG into protosprite format.

```ts
import { importAsepriteSheetExport } from "protosprite-core/importers/aseprite";

const sheet = await importAsepriteSheetExport(jsonData, pngBuffer);
```
