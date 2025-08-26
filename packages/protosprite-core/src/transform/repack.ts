import pack, { Bin, PackResult } from "bin-pack";

import {
  BBox,
  ProtoSprite,
  ProtoSpriteFrameLayer,
  ProtoSpritePixelSource,
  ProtoSpriteSheet
} from "src/core";

// These types are a cludge to get this to work both in-browser and with node canvas.
export type BBoxTransformation = (spriteIndex: number, bbox: BBox) => BBox;

type BinWithFrameLayers = Bin & {
  frameLayers: ProtoSpriteFrameLayer[];
  pixelSource?: ProtoSpritePixelSource;
};

type ReRenderOperation = {
  pixelSource?: ProtoSpritePixelSource;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
};

export function repackSpriteSheet(
  sheet: ProtoSpriteSheet,
  opt?: {
    padding: number;
  }
) {
  const { padding = 2 } = opt ?? {};

  const bboxKey = (spriteIndex: number, bbox: BBox) =>
    `${spriteIndex}:${bbox.x}:${bbox.y}:${bbox.width}:${bbox.height}`;
  const bins: BinWithFrameLayers[] = [];
  const binsByBBoxKey = new Map<string, BinWithFrameLayers>();

  sheet.sprites.forEach((sprite, spriteIndex) => {
    for (const frame of sprite.frames.values()) {
      for (const frameLayer of frame.indexedLayers.values()) {
        const frameSourceKey = bboxKey(spriteIndex, frameLayer.sheetBBox);
        let frameBin = binsByBBoxKey.get(frameSourceKey);
        if (!frameBin) {
          frameBin = {
            width: frameLayer.sheetBBox.width + padding * 2,
            height: frameLayer.sheetBBox.height + padding * 2,
            frameLayers: [],
            pixelSource: sprite.pixelSource
          };
          bins.push(frameBin);
          binsByBBoxKey.set(frameSourceKey, frameBin);
        }
        frameBin.frameLayers.push(frameLayer);
      }
    }
  });

  const packed = pack(bins);
  const packedBinsByBBoxKey = new WeakMap<ProtoSpriteFrameLayer, PackResult<BinWithFrameLayers>["items"][number]>();
  for (const resBin of packed.items) {
    for (const frameLayer of resBin.item.frameLayers) {
      packedBinsByBBoxKey.set(frameLayer, resBin);
    }
  }

  return {
    size: {
      width: packed.width,
      height: packed.height
    },
    renderQueue: packed.items.map((resBin) => {
      const { frameLayers, pixelSource } = resBin.item as BinWithFrameLayers;
      const frameLayer = frameLayers.at(0);
      if (frameLayer === undefined)
        throw new Error("Unable to identify frame layer.");
      return {
        pixelSource,
        sx: frameLayer.sheetBBox.x,
        sy: frameLayer.sheetBBox.y,
        sw: frameLayer.sheetBBox.width,
        sh: frameLayer.sheetBBox.height,
        dx: resBin.x + padding,
        dy: resBin.y + padding,
        dw: frameLayer.sheetBBox.width,
        dh: frameLayer.sheetBBox.height
      } satisfies ReRenderOperation;
    }) satisfies ReRenderOperation[],
    packedBinsByBBoxKey,
    padding
  };
}
