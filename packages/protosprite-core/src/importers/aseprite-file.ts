/**
 * Import a `.aseprite` file directly, without Aseprite installed.
 *
 * The counterpart to `importers/aseprite.ts`, which imports the JSON that
 * Aseprite's own exporter writes. Same `SpriteData` out, so everything
 * downstream — `.prs` encoding, `protosprite-three` — is untouched. The
 * difference is that this one needs no binary, no child process and no
 * temp directory, which is what lets it run on a server or in a browser.
 *
 * It is also strictly more faithful in one place: Aseprite's JSON export drops
 * frames that have no cel, so the JSON importer has to invent them and gives
 * them `FrameData`'s default 100ms. Read from the file, an empty frame keeps
 * the duration it was authored with.
 *
 * Pure and synchronous. No fs, no jimp, no canvas, no DOM — callers read
 * files. Pixels come back as raw RGBA so that holding them needs no image
 * library; `transform/packRaw.ts` turns them into an atlas.
 */
import {
  AnimationData,
  FrameData,
  FrameLayerData,
  LayerData,
  SpriteData
} from "../core/data.js";
import {
  AseCel,
  AseColorDepth,
  AseDocument,
  AseLayerType,
  AsePalette,
  UnsupportedAsepriteFeatureError,
  parseAsepriteFile
} from "./ase-binary.js";

/** One frame layer's pixels, at the cel's own bounds. */
export type AsepriteFileBitmap = {
  frameIndex: number;
  layerIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Straight (un-premultiplied) RGBA, row major, `width * height * 4` bytes. */
  rgba: Uint8ClampedArray;
};

export type AsepriteFileImport = {
  sprite: SpriteData;
  /** One entry per non-empty (frame, layer), in the sprite's own order. */
  bitmaps: AsepriteFileBitmap[];
};

export type AsepriteFileImportOptions = {
  /** Name for the resulting sprite. Aseprite files do not carry one. */
  spriteName?: string;
  /**
   * Skip layers Aseprite has hidden. Off by default, matching an export with
   * `--all-layers`, which is what `protosprite-cli` has always passed.
   */
  skipHiddenLayers?: boolean;
};

/** Expand one cel's pixels to straight RGBA in the sprite's colour space. */
function celToRgba(
  cel: AseCel,
  colorDepth: AseColorDepth,
  palette: AsePalette | undefined,
  transparentIndex: number
): Uint8ClampedArray {
  const pixelCount = cel.width * cel.height;
  const rgba = new Uint8ClampedArray(pixelCount * 4);
  const data = cel.data;
  if (data === undefined) return rgba;

  switch (colorDepth) {
    case AseColorDepth.Rgba: {
      if (data.length < pixelCount * 4) {
        throw new UnsupportedAsepriteFeatureError(
          `cel on layer ${cel.layerIndex} is short by ` +
            `${pixelCount * 4 - data.length} bytes of RGBA data`
        );
      }
      rgba.set(data.subarray(0, pixelCount * 4));
      return rgba;
    }
    case AseColorDepth.Grayscale: {
      if (data.length < pixelCount * 2) {
        throw new UnsupportedAsepriteFeatureError(
          `cel on layer ${cel.layerIndex} is short by ` +
            `${pixelCount * 2 - data.length} bytes of grayscale data`
        );
      }
      for (let i = 0; i < pixelCount; i++) {
        const value = data[i * 2];
        const out = i * 4;
        rgba[out] = value;
        rgba[out + 1] = value;
        rgba[out + 2] = value;
        rgba[out + 3] = data[i * 2 + 1];
      }
      return rgba;
    }
    case AseColorDepth.Indexed: {
      if (data.length < pixelCount) {
        throw new UnsupportedAsepriteFeatureError(
          `cel on layer ${cel.layerIndex} is short by ` +
            `${pixelCount - data.length} palette indices`
        );
      }
      if (palette === undefined) {
        throw new UnsupportedAsepriteFeatureError(
          "indexed color without a palette chunk"
        );
      }
      for (let i = 0; i < pixelCount; i++) {
        const index = data[i];
        const out = i * 4;
        // The transparent index is a hole, whatever colour the palette gives
        // it. Aseprite renders it as nothing.
        if (index === transparentIndex) continue;
        const color = palette.colors[index];
        if (color === undefined) continue;
        rgba[out] = color.red;
        rgba[out + 1] = color.green;
        rgba[out + 2] = color.blue;
        rgba[out + 3] = color.alpha;
      }
      return rgba;
    }
  }
}

/**
 * Aseprite records nesting as a child level per layer, in bottom-to-top order.
 * A layer's parent is the nearest layer before it one level shallower.
 */
function assignLayerParents(document: AseDocument, layers: LayerData[]) {
  // Innermost open group per depth, so a group closing does not need tracking.
  const openGroupAtLevel = new Map<number, LayerData>();
  document.layers.forEach((sourceLayer, index) => {
    const layer = layers[index];
    if (layer === undefined) return;
    const parent = openGroupAtLevel.get(sourceLayer.childLevel - 1);
    if (parent !== undefined) {
      layer.parentIndex = parent.index;
      parent.isGroup = true;
    }
    if (sourceLayer.type === AseLayerType.Group) {
      layer.isGroup = true;
      openGroupAtLevel.set(sourceLayer.childLevel, layer);
    }
  });
}

/**
 * Read a `.aseprite` file into `SpriteData` plus the pixels of every cel.
 *
 * Cels come back at their own bounds — Aseprite already stores them trimmed —
 * with `spritePosition` giving their place on the canvas. `sheetPosition` is
 * left at the origin: there is no sheet yet. Packing is `packSpriteSheetRaw`'s
 * job, and it is what fills those in.
 */
export function importAsepriteFile(
  bytes: Uint8Array,
  opt?: AsepriteFileImportOptions
): AsepriteFileImport {
  const document = parseAsepriteFile(bytes);

  for (const layer of document.layers) {
    if (layer.type === AseLayerType.Tilemap) {
      throw new UnsupportedAsepriteFeatureError(
        `tilemap layer "${layer.name}". Export the sprite from Aseprite, or ` +
          "flatten the tilemap layer, and import that instead."
      );
    }
  }

  const sprite = new SpriteData();
  sprite.name = opt?.spriteName ?? "";
  sprite.size.width = document.width;
  sprite.size.height = document.height;

  // Layers, in the file's own bottom-to-top order — the same order the JSON
  // export lists them in, so layer indices mean the same thing either way.
  const skipHidden = opt?.skipHiddenLayers ?? false;
  const includedLayer = new Map<number, LayerData>();
  document.layers.forEach((sourceLayer, sourceIndex) => {
    if (skipHidden && !sourceLayer.flags.visible) return;
    const layer = new LayerData();
    layer.name = sourceLayer.name;
    layer.index = sprite.layers.length;
    layer.isGroup = sourceLayer.type === AseLayerType.Group;
    // Only meaningful when the file says so; otherwise every layer is opaque.
    layer.opacity = document.layerOpacityValid ? sourceLayer.opacity : 255;
    includedLayer.set(sourceIndex, layer);
    sprite.layers.push(layer);
  });
  if (!skipHidden) assignLayerParents(document, sprite.layers);

  const bitmaps: AsepriteFileBitmap[] = [];
  document.frames.forEach((sourceFrame, frameIndex) => {
    const frame = new FrameData();
    frame.index = frameIndex;
    frame.duration = sourceFrame.duration;

    // Aseprite writes cels in layer order already, but a file is a file.
    const cels = [...sourceFrame.cels].sort(
      (a, b) => a.layerIndex - b.layerIndex || a.zIndex - b.zIndex
    );
    for (const cel of cels) {
      const layer = includedLayer.get(cel.layerIndex);
      if (layer === undefined) continue;
      // An empty cel carries no pixels and no bounds; there is nothing to
      // place on a sheet. Aseprite's exporter drops these too.
      if (cel.width <= 0 || cel.height <= 0) continue;

      const frameLayer = new FrameLayerData();
      frameLayer.layerIndex = layer.index;
      frameLayer.size.width = cel.width;
      frameLayer.size.height = cel.height;
      frameLayer.spritePosition.x = cel.x;
      frameLayer.spritePosition.y = cel.y;
      frameLayer.zIndex = cel.zIndex;
      frame.layers.push(frameLayer);

      bitmaps.push({
        frameIndex,
        layerIndex: layer.index,
        x: cel.x,
        y: cel.y,
        width: cel.width,
        height: cel.height,
        rgba: celToRgba(
          cel,
          document.colorDepth,
          document.palette,
          document.transparentIndex
        )
      });
    }

    sprite.frames.push(frame);
  });

  for (const sourceTag of document.tags) {
    const animation = new AnimationData();
    animation.name = sourceTag.name;
    animation.indexStart = sourceTag.from;
    animation.indexEnd = sourceTag.to;
    sprite.animations.push(animation);
  }

  return { sprite, bitmaps };
}
