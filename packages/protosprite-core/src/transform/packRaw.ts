/**
 * Sprite sheet packing on raw RGBA buffers.
 *
 * This is the packing algorithm. `pack.ts` is the same thing with a Jimp front
 * door for callers whose pixels arrive as PNG files or URLs; it decodes and
 * then calls in here. There is one implementation on purpose — two would drift
 * and start disagreeing about padding.
 *
 * Pure. No jimp, no canvas, no fs, no DOM, so this is the path a browser uses.
 */
import pack, { Bin } from "bin-pack";

import {
  EmbeddedSpriteSheetData,
  FrameLayerData,
  PositionData,
  SpriteSheetData
} from "../core/data.js";
import { PngEncodeOptions, RawImage, encodePngRgba } from "./png.js";

export type { RawImage };

/**
 * Turns the packed atlas into PNG bytes. Synchronous by necessity — packing is
 * synchronous, and making it otherwise would push `async` onto every caller.
 * An asynchronous encoder (Jimp's, a browser's canvas) is applied after packing
 * instead; see `encodePng: null` below.
 */
export type PngEncoder = (image: RawImage) => Uint8Array;

/** A frame layer's pixels, at that layer's own size. */
export type RawTile = RawImage;

/**
 * Supplies the pixels for one frame layer. Returning undefined leaves that
 * layer's region of the atlas blank, which is what an unreadable or missing
 * pixel source has always done.
 */
export type RawTileResolver = (
  spriteIndex: number,
  frameIndex: number,
  frameLayer: FrameLayerData
) => RawTile | undefined;

export type RawPackOptions = {
  /** Transparent margin around each packed tile. */
  padding?: number;
  /**
   * How the atlas becomes PNG bytes. Defaults to the built-in encoder in
   * `png.js`, which is pure and writes palette-indexed PNG for pixel art.
   *
   * Pass `null` to skip encoding: the sheet comes back with no `pixelSource`
   * and the atlas is yours to encode. That is the route for an asynchronous
   * encoder — `packSpriteSheet` uses it to offer Jimp's.
   */
  encodePng?: PngEncoder | null;
  /** Tuning for the built-in encoder. Ignored when `encodePng` is supplied. */
  png?: PngEncodeOptions;
};

export type RawPackResult = {
  /**
   * The input sheet with every `sheetPosition` rewritten, and the atlas
   * attached as its `pixelSource` unless encoding was skipped.
   */
  sheet: SpriteSheetData;
  /** The packed atlas, before PNG encoding. */
  atlas: RawImage;
};

type TileBin = Bin & {
  tile: RawTile;
  frameLayers: FrameLayerData[];
};

/** FNV-1a over the tile's bytes. Buckets candidates; never decides equality. */
function hashTile(tile: RawTile) {
  let hash = 0x811c9dc5;
  const { rgba } = tile;
  for (let i = 0; i < rgba.length; i++) {
    hash ^= rgba[i];
    hash = Math.imul(hash, 0x01000193);
  }
  return `${tile.width}x${tile.height}:${hash >>> 0}`;
}

function tilesEqual(a: RawTile, b: RawTile) {
  if (a.width !== b.width || a.height !== b.height) return false;
  const length = a.width * a.height * 4;
  for (let i = 0; i < length; i++) {
    if (a.rgba[i] !== b.rgba[i]) return false;
  }
  return true;
}

function blit(atlas: RawImage, tile: RawTile, x: number, y: number) {
  const tileRowBytes = tile.width * 4;
  for (let row = 0; row < tile.height; row++) {
    const from = row * tileRowBytes;
    const to = ((y + row) * atlas.width + x) * 4;
    atlas.rgba.set(tile.rgba.subarray(from, from + tileRowBytes), to);
  }
}

/**
 * Pack every frame layer in a sheet into one atlas.
 *
 * Frame layers whose pixels are byte-identical share a single region, so a
 * held pose costs one tile no matter how many frames hold it. `sheetPosition`
 * is rewritten to point into the atlas; `spritePosition` and sizes are left
 * alone, since where a layer draws does not change.
 */
export function packSpriteSheetRaw(
  sheet: SpriteSheetData,
  resolveTile: RawTileResolver,
  opt?: RawPackOptions
): RawPackResult {
  const { padding = 2 } = opt ?? {};
  const defaultEncoder: PngEncoder = (image) => encodePngRgba(image, opt?.png);

  const bins: TileBin[] = [];
  // Hash buckets, so identical tiles merge without a byte-compare against
  // every bin already placed.
  const binsByTileHash = new Map<string, TileBin[]>();
  // Frame layers with no pixels still need a position; they get an empty bin.
  const placeholders: FrameLayerData[] = [];

  sheet.sprites.forEach((sprite, spriteIndex) => {
    sprite.frames.forEach((frame, frameIndex) => {
      for (const frameLayer of frame.layers) {
        const tile = resolveTile(spriteIndex, frameIndex, frameLayer);
        if (tile === undefined) {
          placeholders.push(frameLayer);
          continue;
        }
        const hash = hashTile(tile);
        const bucket = binsByTileHash.get(hash);
        const match = bucket?.find((bin) => tilesEqual(bin.tile, tile));
        if (match !== undefined) {
          match.frameLayers.push(frameLayer);
          continue;
        }
        const bin: TileBin = {
          width: tile.width + padding * 2,
          height: tile.height + padding * 2,
          tile,
          frameLayers: [frameLayer]
        };
        bins.push(bin);
        if (bucket === undefined) binsByTileHash.set(hash, [bin]);
        else bucket.push(bin);
      }
    });
  });

  const packed = pack(bins);
  // bin-pack reports 0x0 for an empty input; a sheet still needs a texture.
  const atlas: RawImage = {
    width: Math.max(1, packed.width),
    height: Math.max(1, packed.height),
    rgba: new Uint8ClampedArray(
      Math.max(1, packed.width) * Math.max(1, packed.height) * 4
    )
  };

  const newPositions = new Map<FrameLayerData, PositionData>();
  for (const placed of packed.items) {
    const x = placed.x + padding;
    const y = placed.y + padding;
    blit(atlas, placed.item.tile, x, y);
    for (const frameLayer of placed.item.frameLayers) {
      const position = new PositionData();
      position.x = x;
      position.y = y;
      newPositions.set(frameLayer, position);
    }
  }
  for (const frameLayer of placeholders) {
    newPositions.set(frameLayer, new PositionData());
  }

  // Rewrite in place: the frame layers we packed are the ones being updated,
  // so a clone here would leave the caller holding stale sheet positions.
  for (const sprite of sheet.sprites) {
    for (const frame of sprite.frames) {
      for (const frameLayer of frame.layers) {
        const position = newPositions.get(frameLayer);
        if (position === undefined) {
          throw new Error("[ProtoSprite] Missing position in packed result.");
        }
        frameLayer.sheetPosition = position;
      }
    }
    // One atlas for the sheet; per-sprite sources have been absorbed into it.
    sprite.pixelSource = undefined;
  }

  // `undefined` means "use the default"; `null` means "the caller is encoding".
  const encodePng =
    opt?.encodePng === undefined ? defaultEncoder : opt.encodePng;
  if (encodePng !== null) {
    const pixelSource = new EmbeddedSpriteSheetData();
    pixelSource.pngData = encodePng(atlas);
    sheet.pixelSource = pixelSource;
  } else {
    sheet.pixelSource = undefined;
  }

  return { sheet, atlas };
}
