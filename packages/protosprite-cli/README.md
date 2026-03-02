# protosprite-cli

Command line tooling for protosprite.

## Installation

```
npm install protosprite-cli
```

## Commands

### `build`

Build and convert sprite files. Accepts Aseprite (`.ase`/`.aseprite`), ProtoSprite (`.prs`), and ProtoSprite Geometry (`.prsg`) files as input.

```
Usage: protosprite-cli build [options]

Options:
  --name [name...]               Provide names for the imported sprites.
  -i, --input [input...]         Process an input file.
  --output [output]              Output a ProtoSprite (.prs) file.
  --external-sheet               Output an external sprite sheet PNG.
  --write-types [types-file]     Write a TypeScript types file for sprite animations and layers.
  --preview [preview-output]     Output a preview image.
  --json                         Output in JSON format.
  --debug                        Enable debug logging.
  --trace-geometry               Enable polygon tracing on the input sprites.
  --simplify-tolerance <number>  Simplification tolerance for polygon tracing (default: 0.5).
  --per-layer-geometry           Include per-layer polygons in addition to composite-frame polygons.
  --no-composite-geometry        Disable composite-frame polygons (only useful with --per-layer-geometry).
  --output-prsg [file]           Output a .prsg geometry file.
  --output-geom-json [file]      Output traced geometry as a human-readable JSON file.
  --prsg-embed-prs               Embed the .prs data inside the .prsg file.
  --export-frames [dir]          Export each frame of each animation as a separate PNG.
  --overlay-polygons             When exporting frames, overlay traced polygons on the output images.
  --compression <level>          PNG compression max colors (2-256, default: 256). Compression is enabled by default.
  --uncompressed                 Disable PNG compression.
```

#### Examples

Build a `.prsg` with embedded sprite data:

```bash
protosprite-cli build -i sprite.ase --output sprite.prs --output-prsg sprite.prsg --prsg-embed-prs
```

Build with per-layer geometry and a geometry JSON dump:

```bash
protosprite-cli build -i sprite.prs --output-prsg sprite.prsg --per-layer-geometry --output-geom-json sprite-geom.json
```

Export frames with polygon overlays:

```bash
protosprite-cli build -i sprite.prsg --export-frames ./frames --overlay-polygons
```

### `edit`

Make targeted edits to an existing `.prs` file. Can remove animations, remove layers, and adjust frame durations. When layers or animations are removed, the sprite sheet is automatically re-packed.

```
Usage: protosprite-cli edit [options]

Options:
  -i, --input <input>                  Input .prs file.
  -o, --output <output>                Output .prs file.
  --remove-animation <names...>        Remove animations by name.
  --remove-layer <names...>            Remove layers by name (children of removed groups are also removed).
  --set-duration <ms>                  Set duration for all frames (ms).
  --set-animation-duration <spec...>   Set duration for all frames in an animation: name:ms.
  --set-frame-duration <spec...>       Set duration for a specific frame in an animation: name:frameIndex:ms.
  --json                               Output in JSON format.
  --compress                           Compress the output PNG.
  --compression <level>                Compression level (max colors, 2-256, default: 256).
```

#### Examples

Remove an animation:

```bash
protosprite-cli edit -i sprite.prs -o sprite-edited.prs --remove-animation idle
```

Remove a layer:

```bash
protosprite-cli edit -i sprite.prs -o sprite-edited.prs --remove-layer sword
```

Set all frame durations to 50ms:

```bash
protosprite-cli edit -i sprite.prs -o sprite-edited.prs --set-duration 50
```

Set duration for all frames in a specific animation:

```bash
protosprite-cli edit -i sprite.prs -o sprite-edited.prs --set-animation-duration idle:200
```

Set duration for individual frames within an animation (frame index is relative to the animation):

```bash
protosprite-cli edit -i sprite.prs -o sprite-edited.prs --set-frame-duration idle:0:200 --set-frame-duration idle:2:300
```

### `analyze`

Analyze `.prs` and `.prsg` files and print structural information.

```
Usage: protosprite-cli analyze [options]

Options:
  -i, --input [input...]  Input files to analyze.
  --json                  Output in JSON format.
```

For `.prsg` files, the analysis includes shape pool statistics showing the number of unique shapes, total shape references across frames, and polygon/vertex counts.

#### Example

```bash
protosprite-cli analyze -i sprite.prsg

# Output:
# File: sprite.prsg (113,571 bytes)
#   Sprite source: external file: sprite.prs
#
#   Geometry entries: 1
#     Entry: "door" (simplify tolerance: 0.5)
#       Frames with geometry: 63
#       Has per-layer geometry: no
#       Has composite geometry: yes
#       Unique shapes: 185
#       Total shape references: 644
#       Total polygons: 185, total vertices: 3782
```
