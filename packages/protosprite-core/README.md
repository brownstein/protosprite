# protosprite-core

This package is the TypeScript implementation for `protosprite`, a protobuf-based sprite sheet encoding format. It contains protos, serialization utilities, encapsulation objects, and various utilities for transforming files into this format.

Check out the Three.js-based demo [here](https://brownstein.github.io/protosprite/).

## Main Exports
- `ProtoSpite` (default): a sprite within a `ProtoSpriteSheet`.
- `ProtoSpriteSheet`: a sprite sheet.
- `ProtoSpriteInstance`: an instance of a `ProtoSprite` suitable for rendering.
- `Protos`: protobuf types and schemas under a single key.
- `Data`: file data types and schemas under a single key.

### Utilities

This package provides the following file transformation under the `transform` subdirectory:
- `packSpriteSheet` packs multiple `protosprite` sheet files into a single sheet.
- `render` renders preview PNGs, and is intended for use in node.

### Importers

This package provides an aseprite importer utility under the `importers/aseprite` subdirectory, which can convert an exported Aseprite JSON and PNG file into `protosprite` format.