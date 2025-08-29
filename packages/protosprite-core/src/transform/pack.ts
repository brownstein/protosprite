import pack, { Bin } from "bin-pack";
import { Jimp } from "jimp";

import {
  BBox,
  FrameLayerData,
  ProtoSpritePixelSource,
  ProtoSpriteSheet
} from "../core/index.js";

// These types are a cludge to get this to work both in-browser and with node canvas.
export type BBoxTransformation = (spriteIndex: number, bbox: BBox) => BBox;

type BinWithFrameLayers = Bin & {
  spriteIndex: number;
  frameLayers: FrameLayerData[];
  pixelSource?: ProtoSpritePixelSource;
};

export async function packSpriteSheet(
  sheet: ProtoSpriteSheet,
  opt?: {
    padding: number;
  }
): Promise<ProtoSpriteSheet> {
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
            spriteIndex,
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

  // Load pixel sources.
  const pixelSourceToJimp = new WeakMap<
    ProtoSpritePixelSource,
    Awaited<ReturnType<typeof Jimp.read>>
  >();
  let parentSheetPixelSourceUsed = false;
  for (const sprite of sheet.sprites) {
    if (sprite.pixelSource === undefined) continue;
    if (sprite.pixelSource.inParentSheet) {
      parentSheetPixelSourceUsed = true;
      continue;
    }
    if (sprite.pixelSource.pngBytes) {
      const stringifiedBuffer = `data:image/png;base64,${Buffer.from(sprite.pixelSource.pngBytes).toString("base64")}`;
      const img = await Jimp.read(stringifiedBuffer, {
        "image/png": {}
      });
      pixelSourceToJimp.set(sprite.pixelSource, img);
      continue;
    }
    const urlOrFileName = sprite.pixelSource.url ?? sprite.pixelSource.fileName;
    if (urlOrFileName !== undefined) {
      const img = await Jimp.read(urlOrFileName);
      pixelSourceToJimp.set(sprite.pixelSource, img);
    } else {
      console.warn("Unable to get sprite pixel source data...");
    }
  }
  if (parentSheetPixelSourceUsed && sheet.pixelSource !== undefined) {
    if (sheet.pixelSource.pngBytes) {
      const stringifiedBuffer = `data:image/png;base64,${Buffer.from(sheet.pixelSource.pngBytes).toString("base64")}`;
      const img = await Jimp.read(stringifiedBuffer, {
        "image/png": {}
      });
      pixelSourceToJimp.set(sheet.pixelSource, img);
    } else {
      const urlOrFileName = sheet.pixelSource.url ?? sheet.pixelSource.fileName;
      if (urlOrFileName !== undefined) {
        const img = await Jimp.read(urlOrFileName);
        pixelSourceToJimp.set(sheet.pixelSource, img);
      } else {
        console.warn("No suitable PNG found...");
      }
    }
  }

  // Perform blitting onto a shared sprite sheet and swap source bounding boxes.
  const resultImg = new Jimp({
    width: packed.width,
    height: packed.height
  });
  const keyToNewBBox = new Map<string, BBox>();
  for (const resBin of packed.items) {
    if (resBin.item.pixelSource === undefined) continue;
    let img = pixelSourceToJimp.get(resBin.item.pixelSource);
    if (
      img === undefined &&
      resBin.item.pixelSource.inParentSheet &&
      sheet.pixelSource
    ) {
      img = pixelSourceToJimp.get(sheet.pixelSource);
    }
    if (img === undefined) continue;
    let blitDone = false;
    for (const frameLayer of resBin.item.frameLayers) {
      const prevSheetBBox = frameLayer.sheetBBox;
      const newSheetBBox = new BBox();
      newSheetBBox.copy(prevSheetBBox);
      newSheetBBox.x = resBin.x + padding;
      newSheetBBox.y = resBin.y + padding;
      keyToNewBBox.set(
        bboxKey(resBin.item.spriteIndex, prevSheetBBox),
        newSheetBBox
      );
      if (!blitDone) {
        resultImg.blit({
          src: img,
          srcX: prevSheetBBox.x,
          srcY: prevSheetBBox.y,
          srcW: prevSheetBBox.width,
          srcH: prevSheetBBox.height,
          x: newSheetBBox.x,
          y: newSheetBBox.y
        });
        blitDone = true;
      }
    }
  }

  const result = sheet.clone();
  const resultPng = await resultImg.getBuffer("image/png");

  result.sprites.forEach((sprite, spriteIndex) => {
    for (const frame of sprite.frames.values()) {
      for (const frameLayer of frame.indexedLayers.values()) {
        const resultBBox = keyToNewBBox.get(
          bboxKey(spriteIndex, frameLayer.sheetBBox)
        );
        if (resultBBox === undefined)
          throw new Error(
            `Missing bbox in result: ${JSON.stringify(
              {
                spriteIndex,
                bbox: frameLayer.sheetBBox
              },
              null,
              2
            )}`
          );
        frameLayer.sheetBBox = resultBBox;
      }
    }
    sprite.pixelSource = new ProtoSpritePixelSource();
    sprite.pixelSource.inParentSheet = true;
  });

  result.pixelSource = new ProtoSpritePixelSource();
  result.pixelSource.pngBytes = new Uint8Array(resultPng);

  return result;
}
