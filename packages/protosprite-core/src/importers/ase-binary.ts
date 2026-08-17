/**
 * A reader for Aseprite's `.aseprite` / `.ase` binary format.
 *
 * Ported to TypeScript from `ase-parser` (MIT, © Cyber Ronin,
 * https://github.com/TheCyberRonin/ase-parser), with three changes that the
 * original could not make:
 *
 *  - `zlib` is replaced by `fflate`, so this runs in a browser. That is the
 *    whole reason the port exists; a `require('zlib')` on the cel hot path
 *    would drag a Node polyfill into every consumer's bundle.
 *  - `Buffer` is replaced by `DataView`, for the same reason.
 *  - The file is validated. The original reads whatever it is given, which is
 *    fine for your own art and not fine for an upload.
 *
 * This layer is deliberately a transcription of the file, not an
 * interpretation of it: no compositing, no palette expansion, no trimming.
 * `aseprite-file.ts` turns this into `SpriteData`.
 *
 * Format reference: `docs/ase-file-specs.md` in the Aseprite repository.
 */
import { unzlibSync } from "fflate";

/** Sizes and offsets the format fixes. */
const HEADER_SIZE = 128;
const FILE_MAGIC = 0xa5e0;
const FRAME_MAGIC = 0xf1fa;
/** Bytes of a cel chunk consumed before its pixel data begins. */
const CEL_CHUNK_PREFIX = 26;
/** Bytes of a tilemap cel chunk consumed before its tile data begins. */
const TILEMAP_CEL_CHUNK_PREFIX = 54;
/** A chunk's own size/type header, counted inside its declared size. */
const CHUNK_HEADER_SIZE = 6;

export const ChunkType = {
  OldPalette4: 0x0004,
  OldPalette11: 0x0011,
  Layer: 0x2004,
  Cel: 0x2005,
  CelExtra: 0x2006,
  ColorProfile: 0x2007,
  ExternalFiles: 0x2008,
  Mask: 0x2016,
  Path: 0x2017,
  Tags: 0x2018,
  Palette: 0x2019,
  UserData: 0x2020,
  Slice: 0x2022,
  Tileset: 0x2023
} as const;

export const AseColorDepth = {
  Indexed: 8,
  Grayscale: 16,
  Rgba: 32
} as const;
export type AseColorDepth = (typeof AseColorDepth)[keyof typeof AseColorDepth];

export const AseLayerType = {
  Normal: 0,
  Group: 1,
  Tilemap: 2
} as const;
export type AseLayerType = (typeof AseLayerType)[keyof typeof AseLayerType];

export const AseCelType = {
  Raw: 0,
  Linked: 1,
  CompressedImage: 2,
  CompressedTilemap: 3
} as const;
export type AseCelType = (typeof AseCelType)[keyof typeof AseCelType];

export const AseBlendMode = {
  Normal: 0,
  Multiply: 1,
  Screen: 2,
  Overlay: 3,
  Darken: 4,
  Lighten: 5,
  ColorDodge: 6,
  ColorBurn: 7,
  HardLight: 8,
  SoftLight: 9,
  Difference: 10,
  Exclusion: 11,
  Hue: 12,
  Saturation: 13,
  Color: 14,
  Luminosity: 15,
  Addition: 16,
  Subtract: 17,
  Divide: 18
} as const;

export const AseAnimationDirection = [
  "forward",
  "reverse",
  "pingpong",
  "pingpong-reverse"
] as const;
export type AseAnimationDirection = (typeof AseAnimationDirection)[number];

/** Thrown when the bytes are not an Aseprite file, or are damaged. */
export class InvalidAsepriteFileError extends Error {
  constructor(reason: string) {
    super(`[ProtoSprite] Not a readable Aseprite file: ${reason}`);
    this.name = "InvalidAsepriteFileError";
  }
}

/** Thrown for things the format allows but this reader does not handle. */
export class UnsupportedAsepriteFeatureError extends Error {
  constructor(feature: string) {
    super(`[ProtoSprite] Unsupported Aseprite feature: ${feature}`);
    this.name = "UnsupportedAsepriteFeatureError";
  }
}

export type AseLayerFlags = {
  visible: boolean;
  editable: boolean;
  lockMovement: boolean;
  background: boolean;
  preferLinkedCels: boolean;
  collapsedGroup: boolean;
  reference: boolean;
};

export type AseLayer = {
  flags: AseLayerFlags;
  type: AseLayerType;
  /** Nesting depth. A layer belongs to the nearest preceding layer one level shallower. */
  childLevel: number;
  blendMode: number;
  /** 0-255. Only meaningful when the file's layer-opacity flag is set. */
  opacity: number;
  name: string;
  tilesetIndex?: number;
};

export type AseTilemapMetadata = {
  bitsPerTile: number;
  bitmaskForTileId: number;
  bitmaskForXFlip: number;
  bitmaskForYFlip: number;
  bitmaskFor90CWRotation: number;
};

export type AseCel = {
  layerIndex: number;
  /** Position of the cel's top-left within the sprite canvas. */
  x: number;
  y: number;
  opacity: number;
  celType: AseCelType;
  zIndex: number;
  width: number;
  height: number;
  /** For linked cels, the frame the pixels came from. */
  link?: number;
  /**
   * Pixels in the file's colour depth: RGBA bytes at 32bpp, value+alpha pairs
   * at 16bpp, palette indices at 8bpp. Tilemap cels carry tile ids instead.
   * Undefined only for a linked cel whose source could not be resolved.
   */
  data?: Uint8Array;
  tilemap?: AseTilemapMetadata;
};

export type AseFrame = {
  /** Frame duration in milliseconds, as authored. */
  duration: number;
  cels: AseCel[];
};

export type AseTag = {
  name: string;
  from: number;
  to: number;
  direction: AseAnimationDirection;
  repeat: number;
};

export type AsePaletteColor = {
  red: number;
  green: number;
  blue: number;
  alpha: number;
  name?: string;
};

export type AsePalette = {
  size: number;
  firstColor: number;
  lastColor: number;
  colors: AsePaletteColor[];
};

export type AseTileset = {
  id: number;
  tileCount: number;
  tileWidth: number;
  tileHeight: number;
  name: string;
  externalFile?: { id: number; tilesetId: number };
  /** Tile pixels, in the file's colour depth, stacked vertically. */
  data?: Uint8Array;
};

export type AseSliceKey = {
  frameNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  patch?: { x: number; y: number; width: number; height: number };
  pivot?: { x: number; y: number };
};

export type AseSlice = {
  name: string;
  flags: number;
  keys: AseSliceKey[];
};

export type AseDocument = {
  width: number;
  height: number;
  colorDepth: AseColorDepth;
  /** Palette index treated as transparent, in indexed mode. */
  transparentIndex: number;
  numColors: number;
  pixelRatio: string;
  /** Whether per-layer opacity in this file is meaningful. */
  layerOpacityValid: boolean;
  layers: AseLayer[];
  frames: AseFrame[];
  tags: AseTag[];
  palette?: AsePalette;
  tilesets: AseTileset[];
  slices: AseSlice[];
};

const LAYER_FLAG_BITS: [keyof AseLayerFlags, number][] = [
  ["visible", 0b1],
  ["editable", 0b10],
  ["lockMovement", 0b100],
  ["background", 0b1000],
  ["preferLinkedCels", 0b10000],
  ["collapsedGroup", 0b100000],
  ["reference", 0b1000000]
];

const textDecoder = new TextDecoder();

/**
 * A cursor over the file. Every read is bounds-checked: a truncated or hostile
 * file should surface as `InvalidAsepriteFileError`, not as a `RangeError`
 * from somewhere three calls deeper or a multi-gigabyte allocation.
 */
class ByteReader {
  private readonly view: DataView;
  private readonly bytes: Uint8Array;
  private offset = 0;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get position() {
    return this.offset;
  }

  get remaining() {
    return this.bytes.byteLength - this.offset;
  }

  private require(numBytes: number, what: string) {
    if (numBytes < 0) {
      throw new InvalidAsepriteFileError(
        `${what} declares a negative length (${numBytes})`
      );
    }
    if (numBytes > this.remaining) {
      throw new InvalidAsepriteFileError(
        `${what} runs past the end of the file (wanted ${numBytes} bytes at ` +
          `offset ${this.offset}, ${this.remaining} remain)`
      );
    }
  }

  byte(what = "byte") {
    this.require(1, what);
    return this.view.getUint8(this.offset++);
  }

  word(what = "word") {
    this.require(2, what);
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  short(what = "short") {
    this.require(2, what);
    const value = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return value;
  }

  dword(what = "dword") {
    this.require(4, what);
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  long(what = "long") {
    this.require(4, what);
    const value = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return value;
  }

  /** 32-bit 16.16 fixed point. */
  fixed(what = "fixed") {
    return this.long(what) / 65536;
  }

  raw(numBytes: number, what = "data") {
    this.require(numBytes, what);
    // A copy, not a view: cel data outlives the input buffer, and callers are
    // free to hand us a slice of something larger.
    const out = this.bytes.slice(this.offset, this.offset + numBytes);
    this.offset += numBytes;
    return out;
  }

  string(what = "string") {
    const numBytes = this.word(`${what} length`);
    return textDecoder.decode(this.raw(numBytes, what));
  }

  skip(numBytes: number, what = "padding") {
    this.require(numBytes, what);
    this.offset += numBytes;
  }

  seek(position: number, what = "chunk") {
    if (position < 0 || position > this.bytes.byteLength) {
      throw new InvalidAsepriteFileError(
        `${what} ends outside the file (offset ${position})`
      );
    }
    this.offset = position;
  }
}

function inflate(compressed: Uint8Array, what: string) {
  try {
    return unzlibSync(compressed);
  } catch (cause) {
    throw new InvalidAsepriteFileError(
      `${what} is not valid zlib data (${(cause as Error).message})`
    );
  }
}

function readHeader(reader: ByteReader) {
  reader.dword("file size");
  const magic = reader.word("magic number");
  if (magic !== FILE_MAGIC) {
    throw new InvalidAsepriteFileError(
      `bad magic number 0x${magic.toString(16)}, expected 0x${FILE_MAGIC.toString(16)}`
    );
  }
  const numFrames = reader.word("frame count");
  const width = reader.word("width");
  const height = reader.word("height");
  const colorDepth = reader.word("color depth");
  const flags = reader.dword("flags");
  reader.skip(2, "deprecated speed");
  reader.skip(8, "reserved");
  const transparentIndex = reader.byte("transparent index");
  reader.skip(3, "reserved");
  const numColors = reader.word("color count");
  const pixelWidth = reader.byte("pixel width");
  const pixelHeight = reader.byte("pixel height");
  reader.skip(92, "reserved header tail");

  if (width === 0 || height === 0) {
    throw new InvalidAsepriteFileError(`zero canvas (${width}x${height})`);
  }
  if (
    colorDepth !== AseColorDepth.Indexed &&
    colorDepth !== AseColorDepth.Grayscale &&
    colorDepth !== AseColorDepth.Rgba
  ) {
    throw new InvalidAsepriteFileError(`unknown color depth ${colorDepth}bpp`);
  }

  return {
    numFrames,
    width,
    height,
    colorDepth: colorDepth as AseColorDepth,
    transparentIndex,
    numColors,
    pixelRatio: `${pixelWidth}:${pixelHeight}`,
    layerOpacityValid: (flags & 1) !== 0
  };
}

function readLayerChunk(reader: ByteReader): AseLayer {
  const flagBits = reader.word("layer flags");
  const flags = {} as AseLayerFlags;
  for (const [name, bit] of LAYER_FLAG_BITS)
    flags[name] = (flagBits & bit) !== 0;
  const type = reader.word("layer type") as AseLayerType;
  const childLevel = reader.word("layer child level");
  reader.skip(4, "layer default size");
  const blendMode = reader.word("blend mode");
  const opacity = reader.byte("layer opacity");
  reader.skip(3, "reserved");
  const name = reader.string("layer name");
  const layer: AseLayer = { flags, type, childLevel, blendMode, opacity, name };
  if (type === AseLayerType.Tilemap) {
    layer.tilesetIndex = reader.dword("tileset index");
  }
  return layer;
}

function readCelChunk(reader: ByteReader, chunkSize: number): AseCel {
  const layerIndex = reader.word("cel layer index");
  const x = reader.short("cel x");
  const y = reader.short("cel y");
  const opacity = reader.byte("cel opacity");
  const rawCelType = reader.word("cel type");
  const celType = rawCelType as AseCelType;
  const zIndex = reader.short("cel z-index");
  reader.skip(5, "reserved");

  if (celType === AseCelType.Linked) {
    return {
      layerIndex,
      x,
      y,
      opacity,
      celType,
      zIndex,
      width: 0,
      height: 0,
      link: reader.word("cel link")
    };
  }

  const width = reader.word("cel width");
  const height = reader.word("cel height");
  const cel: AseCel = {
    layerIndex,
    x,
    y,
    opacity,
    celType,
    zIndex,
    width,
    height
  };

  if (celType === AseCelType.Raw) {
    cel.data = reader.raw(chunkSize - CEL_CHUNK_PREFIX, "cel pixels");
    return cel;
  }
  if (celType === AseCelType.CompressedImage) {
    cel.data = inflate(
      reader.raw(chunkSize - CEL_CHUNK_PREFIX, "compressed cel pixels"),
      "cel pixel data"
    );
    return cel;
  }
  if (celType === AseCelType.CompressedTilemap) {
    cel.tilemap = {
      bitsPerTile: reader.word("bits per tile"),
      bitmaskForTileId: reader.dword("tile id mask"),
      bitmaskForXFlip: reader.dword("x flip mask"),
      bitmaskForYFlip: reader.dword("y flip mask"),
      bitmaskFor90CWRotation: reader.dword("rotation mask")
    };
    reader.skip(10, "reserved");
    cel.data = inflate(
      reader.raw(chunkSize - TILEMAP_CEL_CHUNK_PREFIX, "compressed tile data"),
      "tilemap cel data"
    );
    return cel;
  }

  // The original returned undefined here and crashed later on something
  // unrelated. Fail where the problem actually is.
  throw new UnsupportedAsepriteFeatureError(`cel type ${rawCelType}`);
}

function readTagsChunk(reader: ByteReader, tags: AseTag[]) {
  const numTags = reader.word("tag count");
  reader.skip(8, "reserved");
  for (let i = 0; i < numTags; i++) {
    const from = reader.word("tag from");
    const to = reader.word("tag to");
    const directionIndex = reader.byte("tag direction");
    const repeat = reader.word("tag repeat");
    reader.skip(6, "reserved");
    reader.skip(3, "deprecated tag color");
    reader.skip(1, "reserved");
    const name = reader.string("tag name");
    tags.push({
      name,
      from,
      to,
      direction: AseAnimationDirection[directionIndex] ?? "forward",
      repeat
    });
  }
}

function readPaletteChunk(reader: ByteReader): AsePalette {
  const size = reader.dword("palette size");
  const firstColor = reader.dword("palette first color");
  const lastColor = reader.dword("palette last color");
  reader.skip(8, "reserved");
  const colors: AsePaletteColor[] = [];
  for (let i = 0; i < size; i++) {
    const flags = reader.word("palette entry flags");
    const red = reader.byte("palette red");
    const green = reader.byte("palette green");
    const blue = reader.byte("palette blue");
    const alpha = reader.byte("palette alpha");
    const name =
      (flags & 1) !== 0 ? reader.string("palette entry name") : undefined;
    colors.push({ red, green, blue, alpha, name });
  }
  return { size, firstColor, lastColor, colors };
}

function readTilesetChunk(reader: ByteReader): AseTileset {
  const id = reader.dword("tileset id");
  const flags = reader.dword("tileset flags");
  const tileCount = reader.dword("tile count");
  const tileWidth = reader.word("tile width");
  const tileHeight = reader.word("tile height");
  reader.skip(2, "base index");
  reader.skip(14, "reserved");
  const name = reader.string("tileset name");
  const tileset: AseTileset = { id, tileCount, tileWidth, tileHeight, name };
  if ((flags & 1) !== 0) {
    tileset.externalFile = {
      id: reader.dword("external file id"),
      tilesetId: reader.dword("external tileset id")
    };
  }
  if ((flags & 2) !== 0) {
    const dataLength = reader.dword("tileset data length");
    tileset.data = inflate(
      reader.raw(dataLength, "compressed tileset data"),
      "tileset data"
    );
  }
  return tileset;
}

function readSliceChunk(reader: ByteReader): AseSlice {
  const numKeys = reader.dword("slice key count");
  const flags = reader.dword("slice flags");
  reader.skip(4, "reserved");
  const name = reader.string("slice name");
  const keys: AseSliceKey[] = [];
  for (let i = 0; i < numKeys; i++) {
    const key: AseSliceKey = {
      frameNumber: reader.dword("slice key frame"),
      x: reader.long("slice key x"),
      y: reader.long("slice key y"),
      width: reader.dword("slice key width"),
      height: reader.dword("slice key height")
    };
    if ((flags & 1) !== 0) {
      key.patch = {
        x: reader.long("slice patch x"),
        y: reader.long("slice patch y"),
        width: reader.dword("slice patch width"),
        height: reader.dword("slice patch height")
      };
    }
    if ((flags & 2) !== 0) {
      key.pivot = {
        x: reader.long("slice pivot x"),
        y: reader.long("slice pivot y")
      };
    }
    keys.push(key);
  }
  return { name, flags, keys };
}

/**
 * Resolve linked cels by copying the referenced frame's pixels. A linked cel
 * keeps its own position; only the pixels and their extent are borrowed.
 */
function resolveLinkedCels(frames: AseFrame[]) {
  for (const frame of frames) {
    for (const cel of frame.cels) {
      if (cel.celType !== AseCelType.Linked) continue;
      const source = frames[cel.link ?? -1];
      if (source === undefined) {
        throw new InvalidAsepriteFileError(
          `cel links to frame ${cel.link}, which does not exist`
        );
      }
      const sourceCel = source.cels.find(
        (candidate) => candidate.layerIndex === cel.layerIndex
      );
      if (sourceCel === undefined) continue;
      cel.width = sourceCel.width;
      cel.height = sourceCel.height;
      cel.data = sourceCel.data;
      cel.tilemap = sourceCel.tilemap;
    }
  }
}

/**
 * Read a `.aseprite` file.
 *
 * Pure and synchronous: bytes in, a transcription of the file out. No I/O, no
 * image library, nothing from the DOM.
 */
export function parseAsepriteFile(bytes: Uint8Array): AseDocument {
  if (bytes.byteLength < HEADER_SIZE) {
    throw new InvalidAsepriteFileError(
      `file is ${bytes.byteLength} bytes, shorter than the ${HEADER_SIZE}-byte header`
    );
  }
  const reader = new ByteReader(bytes);
  const header = readHeader(reader);

  const layers: AseLayer[] = [];
  const frames: AseFrame[] = [];
  const tags: AseTag[] = [];
  const tilesets: AseTileset[] = [];
  const slices: AseSlice[] = [];
  let palette: AsePalette | undefined;

  for (let frameIndex = 0; frameIndex < header.numFrames; frameIndex++) {
    const frameStart = reader.position;
    const bytesInFrame = reader.dword("frame size");
    const frameMagic = reader.word("frame magic number");
    if (frameMagic !== FRAME_MAGIC) {
      throw new InvalidAsepriteFileError(
        `frame ${frameIndex} has bad magic number 0x${frameMagic.toString(16)}`
      );
    }
    const oldChunkCount = reader.word("old chunk count");
    const duration = reader.word("frame duration");
    reader.skip(2, "reserved");
    const newChunkCount = reader.dword("chunk count");
    // The DWord count is authoritative when non-zero; older files only fill
    // the Word.
    const chunkCount = newChunkCount !== 0 ? newChunkCount : oldChunkCount;

    const cels: AseCel[] = [];
    for (let i = 0; i < chunkCount; i++) {
      const chunkStart = reader.position;
      const chunkSize = reader.dword("chunk size");
      const chunkType = reader.word("chunk type");
      if (chunkSize < CHUNK_HEADER_SIZE) {
        throw new InvalidAsepriteFileError(
          `frame ${frameIndex} chunk ${i} declares an impossible size (${chunkSize})`
        );
      }
      const chunkEnd = chunkStart + chunkSize;

      switch (chunkType) {
        case ChunkType.Layer:
          layers.push(readLayerChunk(reader));
          break;
        case ChunkType.Cel:
          cels.push(readCelChunk(reader, chunkSize));
          break;
        case ChunkType.Tags:
          readTagsChunk(reader, tags);
          break;
        case ChunkType.Palette:
          palette = readPaletteChunk(reader);
          break;
        case ChunkType.Tileset:
          tilesets.push(readTilesetChunk(reader));
          break;
        case ChunkType.Slice:
          slices.push(readSliceChunk(reader));
          break;
        default:
          // Colour profiles, user data, legacy palettes, masks, paths, cel
          // extras and anything Aseprite adds later. None of it reaches
          // SpriteData, and every chunk declares its own size, so skipping is
          // both safe and forward-compatible.
          break;
      }
      // Always resume from the chunk's declared end rather than wherever the
      // reader happens to have stopped. Keeps one over- or under-read from
      // corrupting every chunk after it.
      reader.seek(chunkEnd, `frame ${frameIndex} chunk ${i}`);
    }

    frames.push({ duration, cels });

    if (bytesInFrame > 0) {
      reader.seek(frameStart + bytesInFrame, `frame ${frameIndex}`);
    }
  }

  resolveLinkedCels(frames);

  return {
    width: header.width,
    height: header.height,
    colorDepth: header.colorDepth,
    transparentIndex: header.transparentIndex,
    numColors: header.numColors,
    pixelRatio: header.pixelRatio,
    layerOpacityValid: header.layerOpacityValid,
    layers,
    frames,
    tags,
    palette,
    tilesets,
    slices
  };
}
