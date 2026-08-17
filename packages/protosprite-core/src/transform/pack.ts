/**
 * Sprite sheet packing for pixel sources that need decoding — PNG files, URLs,
 * embedded PNG data.
 *
 * The packing itself lives in `packRaw.ts` and is shared. This file is the
 * Jimp front door: decode whatever the sheet points at into RGBA, hand it over,
 * done. Jimp is a decoder here by default, which is why the pure entry point
 * exists and why nothing in this file may leak into it.
 *
 * It can also be the encoder, via `encoder: "native"`. The built-in encoder is
 * the default and the one CLI tooling should stay on: it is pure, and it
 * writes palette-indexed PNG for pixel art where Jimp always writes truecolour
 * — 90 KB against 473 KB on the starter enemy sheet. Jimp is there for
 * consumers that need its exact output.
 */
import { EmbeddedSpriteSheetData, SpriteSheetData } from "src/core/data.js";

import { encodePngRgbaNative } from "./nativePng.js";
import { RawImage, RawTileResolver, packSpriteSheetRaw } from "./packRaw.js";
import { PngEncodeOptions } from "./png.js";
import { SupportedPixelSource, readPixelSourceToJimp } from "./util.js";

export type PackSpriteSheetOptions = {
  /** Transparent margin around each packed tile. */
  padding?: number;
  /**
   * Pixels the caller already holds, consulted before a sprite's own pixel
   * source is decoded. Returning undefined falls through to Jimp, so a sheet
   * can mix sprites imported straight from `.aseprite` — which arrive as raw
   * bitmaps with no pixel source — with sprites that point at a PNG.
   */
  tiles?: RawTileResolver;
  /**
   * Which encoder writes the atlas.
   *
   * - `"builtin"` (default) — the pure encoder in `png.js`. Palette-indexed
   *   for pixel art, so roughly five times smaller on sprite sheets.
   * - `"native"` — Jimp's. Always truecolour; expects a pngquant pass after.
   */
  encoder?: "builtin" | "native";
  /** Tuning for the built-in encoder. Ignored when `encoder` is `"native"`. */
  png?: PngEncodeOptions;
};

export async function packSpriteSheet(
  sheet: SpriteSheetData,
  opt?: PackSpriteSheetOptions
): Promise<SpriteSheetData> {
  // Packing rewrites sheet positions, so work on a copy and leave the caller's
  // sheet as they handed it over.
  const result = sheet.clone();

  const decodedBySource = new Map<SupportedPixelSource, RawImage>();
  const decode = async (pixelSource: SupportedPixelSource | undefined) => {
    if (pixelSource === undefined || decodedBySource.has(pixelSource)) return;
    const img = await readPixelSourceToJimp(pixelSource);
    if (!img) return;
    decodedBySource.set(pixelSource, {
      width: img.bitmap.width,
      height: img.bitmap.height,
      rgba: new Uint8ClampedArray(
        img.bitmap.data.buffer,
        img.bitmap.data.byteOffset,
        img.bitmap.data.byteLength
      )
    });
  };
  for (const sprite of result.sprites) await decode(sprite.pixelSource);
  await decode(result.pixelSource);

  const useNativeEncoder = opt?.encoder === "native";
  const packed = packSpriteSheetRaw(
    result,
    (spriteIndex, frameIndex, frameLayer) => {
      const supplied = opt?.tiles?.(spriteIndex, frameIndex, frameLayer);
      if (supplied !== undefined) return supplied;
      const sprite = result.sprites[spriteIndex];
      const source = sprite?.pixelSource ?? result.pixelSource;
      const image = source ? decodedBySource.get(source) : undefined;
      if (image === undefined) return undefined;
      // The frame layer's current sheet position is where its pixels are in
      // the source image; packRaw decides where they end up.
      return cropToTile(
        image,
        frameLayer.sheetPosition.x,
        frameLayer.sheetPosition.y,
        frameLayer.size.width,
        frameLayer.size.height
      );
    },
    {
      padding: opt?.padding ?? 2,
      // Jimp's encoder is async, so packing leaves the atlas unencoded and it
      // is applied here instead.
      encodePng: useNativeEncoder ? null : undefined,
      png: opt?.png
    }
  );

  if (useNativeEncoder) {
    const pixelSource = new EmbeddedSpriteSheetData();
    pixelSource.pngData = await encodePngRgbaNative(packed.atlas);
    packed.sheet.pixelSource = pixelSource;
  }

  return packed.sheet;
}

/** Copy a rect out of a decoded image. Out-of-bounds rows and columns read as transparent. */
function cropToTile(
  image: RawImage,
  x: number,
  y: number,
  width: number,
  height: number
): RawImage {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const rowBytes = width * 4;
  // Clamp the span to the image; anything outside stays transparent.
  const startX = Math.max(0, x);
  const endX = Math.min(image.width, x + width);
  if (endX > startX) {
    const count = (endX - startX) * 4;
    for (let row = 0; row < height; row++) {
      const sourceY = y + row;
      if (sourceY < 0 || sourceY >= image.height) continue;
      const from = (sourceY * image.width + startX) * 4;
      rgba.set(
        image.rgba.subarray(from, from + count),
        row * rowBytes + (startX - x) * 4
      );
    }
  }
  return { width, height, rgba };
}
