/**
 * The jimp-free half of `transform`.
 *
 * Everything reachable from here is pure: no image library, no fs, no DOM. It
 * is the entry a browser or a headless service imports, and the reason
 * `./transform` and `./transform/raw` are separate export paths rather than
 * one module with an optional dependency.
 */
export {
  packSpriteSheetRaw,
  type PngEncoder,
  type RawImage,
  type RawPackOptions,
  type RawPackResult,
  type RawTile,
  type RawTileResolver
} from "./packRaw.js";
export { encodePngRgba, type PngEncodeOptions } from "./png.js";
