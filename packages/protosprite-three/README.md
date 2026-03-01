# protosprite-three

Three.js rendering implementation for `protosprite`, a protobuf-based sprite sheet encoding format. Provides loading, rendering, animation, layer control, and visual effects for protosprite sheets in Three.js scenes.

Check out the demo [here](https://brownstein.github.io/protosprite/).

## Installation

```bash
npm install protosprite-three
```

Requires `three` as a peer dependency.

## Quick Start

```ts
import {
  ProtoSpriteSheetThreeLoader,
  ProtoSpriteSheetThree,
  ProtoSpriteThree,
} from "protosprite-three";

// Create a loader
const loader = new ProtoSpriteSheetThreeLoader();

// Load a .prs file
const sheet: ProtoSpriteSheetThree = await loader.loadAsync("sprite.prs");

// Create a sprite instance
const sprite: ProtoSpriteThree = sheet.getSprite("spriteName");

// Add to scene
scene.add(sprite.mesh);

// In your render loop
function animate(deltaMs: number) {
  sprite.advance(deltaMs);
  renderer.render(scene, camera);
}
```

## API

### `ProtoSpriteSheetThreeLoader`

Async resource loader with built-in caching.

```ts
const loader = new ProtoSpriteSheetThreeLoader(opts?: {
  textureLoader?: THREE.TextureLoader;
});

// Load from URL or from an existing ProtoSpriteSheet
const sheet = await loader.loadAsync(urlOrSheet: string | ProtoSpriteSheet);
```

Fetches the `.prs` binary, deserializes it, resolves the pixel source (embedded PNG or external file/URL), loads the texture with `NearestFilter` for pixel-art rendering, and caches results to prevent duplicate fetches.

### `ProtoSpriteSheetThree`

Wraps a loaded sprite sheet with Three.js resources.

```ts
sheet.sheetTexture;          // THREE.Texture — atlas texture
sheet.individualTextures;    // Map of per-sprite textures (if sprites have own pixel sources)
sheet.sheetMaterial;         // THREE.ShaderMaterial — custom vertex/fragment shader

// Create a sprite instance
const sprite = sheet.getSprite<TLayers, TAnimations>(indexOrName?: number | string);

// Clean up GPU resources
sheet.dispose();
```

### `ProtoSpriteThree<TLayers, TAnimations>`

Main sprite rendering class. Each sprite is a single `THREE.Mesh` with a `BufferGeometry` containing one quad per visible layer, driven by a custom shader pipeline.

The generic type parameters `TLayers` and `TAnimations` enable type-safe layer and animation names when used with generated types from `protosprite-cli --write-types`.

#### Properties

```ts
sprite.mesh;                 // THREE.Mesh — add this to your scene
sprite.protoSpriteInstance;  // ProtoSpriteInstance from protosprite-core
sprite.size;                 // { width, height } of the sprite
sprite.centerOffset;         // { x, y } offset after centering
sprite.data;                 // SpriteData from the core data model
```

#### Animation

```ts
// Navigate animations
sprite.gotoAnimation(name: TAnimations);
sprite.getAnimation(): TAnimations;

// Frame control
sprite.gotoFrame(frame: number);
sprite.getFrame(): number;
sprite.gotoAnimationFrame(frame: number);
sprite.getAnimationFrame(): number;

// Playback settings
sprite.setAnimationSpeed(speed: number);
sprite.getAnimationSpeed(): number;
sprite.setAnimationLooping(loop: boolean);
sprite.getAnimationLooping(): boolean;

// Advance animation by delta time (call each frame)
sprite.advance(deltaMs: number);
```

#### Layer Control

```ts
// Show/hide layers (expands group layers automatically)
sprite.hideLayers(...layers: TLayers[]);
sprite.showLayers(...layers: TLayers[]);

// Per-layer opacity
sprite.setLayerOpacity(layer: TLayers, opacity: number);
```

#### Visual Effects

```ts
// Global opacity
sprite.setOpacity(opacity: number);

// Color multiply tint (per-layer or all)
sprite.multiplyLayers(layers: TLayers[], color: THREE.Color, opacity: number);
sprite.multiplyAllLayers(color: THREE.Color, opacity: number);

// Color fade overlay (per-layer or all)
sprite.fadeLayers(layers: TLayers[], color: THREE.Color, opacity: number);
sprite.fadeAllLayers(color: THREE.Color, opacity: number);

// Outline (per-layer or all)
sprite.outlineLayers(layers: TLayers[], thickness: number, color: THREE.Color);
sprite.outlineAllLayers(thickness: number, color: THREE.Color);

// Reset all adjustments
sprite.clearLayerAdjustments();
```

#### Utilities

```ts
// Center the sprite's origin
sprite.center();

// Get layer bounding box
sprite.getLayerBounds(layer: TLayers): { x, y, width, height } | null;

// Clone the sprite instance
const copy = sprite.clone();

// Clean up
sprite.dispose();
```

#### Events

```ts
sprite.events.on("animationFrameSwapped", (frame: number) => { /* ... */ });
sprite.events.on("animationTagStarted", (tag: string) => { /* ... */ });
sprite.events.on("animationLooped", () => { /* ... */ });
```

## Type-Safe Usage

Generate TypeScript types with the CLI for type-safe layer and animation names:

```bash
protosprite-cli build -i sprite.ase --output sprite.prs --write-types sprite-types.ts
```

Then use the generated types:

```ts
import type { SpriteAnimations, SpriteLayers } from "./sprite-types";

const sprite = sheet.getSprite<SpriteLayers, SpriteAnimations>("mySprite");

sprite.gotoAnimation("walk");  // type-checked
sprite.hideLayers("hat");      // type-checked
```
