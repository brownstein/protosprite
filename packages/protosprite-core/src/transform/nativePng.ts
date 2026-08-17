/**
 * PNG encoding through Jimp, for callers who want the platform's own encoder
 * rather than the built-in one.
 *
 * The built-in encoder in `png.ts` is the default everywhere, and is what CLI
 * tooling should use. Jimp always writes truecolour, which on sprite art is
 * about five times larger: measured on the starter enemy sheet, Jimp 473 KB
 * against the built-in encoder's 90 KB. The gap closes only if the caller then
 * runs pngquant, which is a native binary and lossy, where the built-in
 * encoder gets there losslessly and in-process.
 *
 * This exists for the cases where Jimp's output is specifically what you want:
 * a consumer that cannot read indexed PNG, a pipeline already standardised on
 * it, or simply a second encoder to check the first against.
 *
 * Jimp only. Anything importing this pulls an image library in behind it, so
 * it lives under `./transform` and must never be reachable from
 * `./transform/raw`.
 */
import { Jimp } from "jimp";

import { RawImage } from "./png.js";

/**
 * Encode a straight-RGBA buffer as PNG using Jimp.
 *
 * Asynchronous, because Jimp's encoder is. That is the reason
 * `packSpriteSheetRaw` cannot take this directly and `packSpriteSheet` applies
 * it after packing instead.
 */
export async function encodePngRgbaNative(
  image: RawImage
): Promise<Uint8Array> {
  const { width, height, rgba } = image;
  if (width <= 0 || height <= 0) {
    throw new Error(
      `[ProtoSprite] Cannot encode a ${width}x${height} PNG; both dimensions must be positive.`
    );
  }
  const expected = width * height * 4;
  if (rgba.length < expected) {
    throw new Error(
      `[ProtoSprite] RGBA buffer holds ${rgba.length} bytes; a ${width}x${height} image needs ${expected}.`
    );
  }

  const img = new Jimp({ width, height });
  img.bitmap.data.set(rgba.subarray(0, expected));
  return new Uint8Array(await img.getBuffer("image/png"));
}
