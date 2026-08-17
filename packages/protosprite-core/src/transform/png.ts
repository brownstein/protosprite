/**
 * A PNG encoder for RGBA buffers, tuned for sprite atlases.
 *
 * `EmbeddedSpriteSheetData` can only hold PNG, so without an encoder the pure
 * path packs an atlas it cannot store — it would still need Jimp to write the
 * sheet, and a browser would still need a `<canvas>`. This closes that gap:
 * `fflate` provides the deflate half, and the rest of PNG is a header, a CRC
 * and a filter byte per row.
 *
 * Two choices here are worth more than everything else combined, because
 * sprite art is not photographic:
 *
 *  - **Palette output.** An atlas of pixel art almost always has under 256
 *    distinct colours, and one index byte per pixel beats four. On the
 *    starter enemy sheet this is the difference between 124 KB and 91 KB.
 *  - **Filtering.** The usual sum-of-absolute-differences heuristic is worse
 *    than useless here: flat runs of transparency and flat colour compress
 *    superbly unfiltered, and the heuristic scores them badly and picks Paeth,
 *    which breaks the long matches deflate was living on. Measured on the same
 *    sheet: no filtering 124 KB, adaptive filtering 217 KB. So candidates are
 *    compressed and compared rather than guessed at.
 *
 * Pure. No image library, no DOM.
 */
import { zlibSync } from "fflate";

export type RawImage = {
  width: number;
  height: number;
  /** Straight (un-premultiplied) RGBA, row major, `width * height * 4` bytes. */
  rgba: Uint8ClampedArray;
};

export type PngEncodeOptions = {
  /**
   * Write truecolour even when the image would fit in a palette. Costs about
   * 35% on typical pixel art; only useful if a consumer cannot read indexed
   * PNG.
   */
  forceTruecolor?: boolean;
  /**
   * Keep whatever RGB sits under fully transparent pixels. Off by default:
   * Aseprite leaves colour beneath erased pixels, which is invisible but
   * costs hundreds of palette entries — enough to push a sprite atlas out of
   * palette range entirely. Turn it on if a consumer samples the atlas with
   * bilinear filtering and needs the colour to bleed correctly.
   */
  preserveTransparentColor?: boolean;
  /** Deflate level, 0-9. */
  level?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
};

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const BYTES_PER_PIXEL = 4;
const MAX_PALETTE_SIZE = 256;

const ColorType = {
  Indexed: 3,
  TruecolorAlpha: 6
} as const;

let crcTable: Uint32Array | undefined;

function getCrcTable() {
  if (crcTable !== undefined) return crcTable;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  crcTable = table;
  return table;
}

function crc32(bytes: Uint8Array) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(data.length + 12);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length, false);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(out.length - 4, crc32(out.subarray(4, out.length - 4)), false);
  return out;
}

function concat(parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function ihdr(width: number, height: number, colorType: number) {
  const data = new Uint8Array(13);
  const view = new DataView(data.buffer);
  view.setUint32(0, width, false);
  view.setUint32(4, height, false);
  data[8] = 8; // bit depth
  data[9] = colorType;
  data[10] = 0; // compression: deflate
  data[11] = 0; // filter: adaptive
  data[12] = 0; // interlace: none
  return chunk("IHDR", data);
}

/** Paeth predictor, per the PNG specification. */
function paeth(a: number, b: number, c: number) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** Prefix every scanline with filter type 0 and leave the bytes alone. */
function filterNone(
  raw: Uint8Array | Uint8ClampedArray,
  rowBytes: number,
  height: number
) {
  const out = new Uint8Array((rowBytes + 1) * height);
  for (let y = 0; y < height; y++) {
    out.set(
      raw.subarray(y * rowBytes, (y + 1) * rowBytes),
      y * (rowBytes + 1) + 1
    );
  }
  return out;
}

/** Per scanline, keep whichever of the five filters produces the flattest row. */
function filterAdaptive(
  raw: Uint8ClampedArray,
  rowBytes: number,
  height: number
) {
  const out = new Uint8Array((rowBytes + 1) * height);
  const scratch = Array.from({ length: 5 }, () => new Uint8Array(rowBytes));
  for (let y = 0; y < height; y++) {
    const rowStart = y * rowBytes;
    const prevStart = rowStart - rowBytes;
    let bestType = 0;
    let bestScore = Infinity;
    for (let type = 0; type < 5; type++) {
      const line = scratch[type];
      let score = 0;
      for (let i = 0; i < rowBytes; i++) {
        const x = raw[rowStart + i];
        const a =
          i >= BYTES_PER_PIXEL ? raw[rowStart + i - BYTES_PER_PIXEL] : 0;
        const b = y > 0 ? raw[prevStart + i] : 0;
        const c =
          y > 0 && i >= BYTES_PER_PIXEL
            ? raw[prevStart + i - BYTES_PER_PIXEL]
            : 0;
        let value: number;
        switch (type) {
          case 0:
            value = x;
            break;
          case 1:
            value = x - a;
            break;
          case 2:
            value = x - b;
            break;
          case 3:
            value = x - ((a + b) >> 1);
            break;
          default:
            value = x - paeth(a, b, c);
            break;
        }
        value &= 0xff;
        line[i] = value;
        // Treat the byte as signed; values near zero are the cheap ones.
        score += value < 128 ? value : 256 - value;
      }
      if (score < bestScore) {
        bestScore = score;
        bestType = type;
      }
    }
    out[y * (rowBytes + 1)] = bestType;
    out.set(scratch[bestType], y * (rowBytes + 1) + 1);
  }
  return out;
}

type Palette = {
  /** RGBA entries, transparent first so tRNS can be truncated. */
  colors: number[];
  indexOf: Map<number, number>;
};

const rgbaKey = (r: number, g: number, b: number, a: number) =>
  ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;

/**
 * Collect the image's distinct colours, giving up as soon as there are too
 * many for a palette.
 */
function buildPalette(
  image: RawImage,
  preserveTransparentColor: boolean
): Palette | undefined {
  const seen = new Set<number>();
  const { rgba } = image;
  const pixelCount = image.width * image.height;
  for (let i = 0; i < pixelCount; i++) {
    const offset = i * BYTES_PER_PIXEL;
    const alpha = rgba[offset + 3];
    const key =
      alpha === 0 && !preserveTransparentColor
        ? 0
        : rgbaKey(rgba[offset], rgba[offset + 1], rgba[offset + 2], alpha);
    if (seen.has(key)) continue;
    seen.add(key);
    if (seen.size > MAX_PALETTE_SIZE) return undefined;
  }
  // Ascending alpha, so every entry needing a tRNS byte sorts to the front and
  // the chunk can stop early.
  const colors = [...seen].sort((a, b) => (a & 0xff) - (b & 0xff));
  const indexOf = new Map<number, number>();
  colors.forEach((color, index) => indexOf.set(color, index));
  return { colors, indexOf };
}

function encodeIndexed(
  image: RawImage,
  palette: Palette,
  preserveTransparentColor: boolean,
  level: PngEncodeOptions["level"]
) {
  const { width, height, rgba } = image;
  const pixelCount = width * height;
  const indices = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const offset = i * BYTES_PER_PIXEL;
    const alpha = rgba[offset + 3];
    const key =
      alpha === 0 && !preserveTransparentColor
        ? 0
        : rgbaKey(rgba[offset], rgba[offset + 1], rgba[offset + 2], alpha);
    indices[i] = palette.indexOf.get(key) ?? 0;
  }

  const plte = new Uint8Array(palette.colors.length * 3);
  const alphas = new Uint8Array(palette.colors.length);
  palette.colors.forEach((color, index) => {
    plte[index * 3] = (color >>> 24) & 0xff;
    plte[index * 3 + 1] = (color >>> 16) & 0xff;
    plte[index * 3 + 2] = (color >>> 8) & 0xff;
    alphas[index] = color & 0xff;
  });
  // tRNS only has to cover entries up to the last non-opaque one.
  let transparentCount = alphas.length;
  while (transparentCount > 0 && alphas[transparentCount - 1] === 255) {
    transparentCount--;
  }

  // The spec advises against filtering palette data, and measurement agrees:
  // indices are already small and adjacent-difference destroys deflate's runs.
  const idat = zlibSync(filterNone(indices, width, height), { level });

  const parts = [
    Uint8Array.from(PNG_SIGNATURE),
    ihdr(width, height, ColorType.Indexed),
    chunk("PLTE", plte),
    ...(transparentCount > 0
      ? [chunk("tRNS", alphas.subarray(0, transparentCount))]
      : []),
    chunk("IDAT", idat),
    chunk("IEND", new Uint8Array(0))
  ];
  return concat(parts);
}

function encodeTruecolor(
  image: RawImage,
  preserveTransparentColor: boolean,
  level: PngEncodeOptions["level"]
) {
  const { width, height } = image;
  let rgba = image.rgba;
  if (!preserveTransparentColor) {
    // Flattening the colour under erased pixels turns scattered noise into one
    // long run, which is exactly what deflate wants.
    const scrubbed = new Uint8ClampedArray(rgba);
    for (let i = 0; i < width * height; i++) {
      const offset = i * BYTES_PER_PIXEL;
      if (scrubbed[offset + 3] !== 0) continue;
      scrubbed[offset] = 0;
      scrubbed[offset + 1] = 0;
      scrubbed[offset + 2] = 0;
    }
    rgba = scrubbed;
  }

  const rowBytes = width * BYTES_PER_PIXEL;
  // Compress both and keep the winner. Guessing from row statistics gets this
  // backwards on flat art, and it is only two deflates.
  const candidates = [
    zlibSync(filterNone(rgba, rowBytes, height), { level }),
    zlibSync(filterAdaptive(rgba, rowBytes, height), { level })
  ];
  const idat =
    candidates[0].length <= candidates[1].length
      ? candidates[0]
      : candidates[1];

  return concat([
    Uint8Array.from(PNG_SIGNATURE),
    ihdr(width, height, ColorType.TruecolorAlpha),
    chunk("IDAT", idat),
    chunk("IEND", new Uint8Array(0))
  ]);
}

/**
 * Encode a straight-RGBA buffer as PNG — palette-indexed when the image has
 * 256 colours or fewer, truecolour with alpha otherwise.
 */
export function encodePngRgba(
  image: RawImage,
  opt?: PngEncodeOptions
): Uint8Array {
  const { width, height, rgba } = image;
  if (width <= 0 || height <= 0) {
    throw new Error(
      `[ProtoSprite] Cannot encode a ${width}x${height} PNG; both dimensions must be positive.`
    );
  }
  const expected = width * height * BYTES_PER_PIXEL;
  if (rgba.length < expected) {
    throw new Error(
      `[ProtoSprite] RGBA buffer holds ${rgba.length} bytes; a ${width}x${height} image needs ${expected}.`
    );
  }

  const preserveTransparentColor = opt?.preserveTransparentColor ?? false;
  const level = opt?.level ?? 9;

  if (!opt?.forceTruecolor) {
    const palette = buildPalette(image, preserveTransparentColor);
    if (palette !== undefined) {
      return encodeIndexed(image, palette, preserveTransparentColor, level);
    }
  }
  return encodeTruecolor(image, preserveTransparentColor, level);
}
