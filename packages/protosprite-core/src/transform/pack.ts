import pack, { Bin } from "bin-pack";
import { Jimp } from "jimp";

import {
  EmbeddedSpriteSheetData,
  FrameLayerData,
  PositionData,
  SizeData,
  SpriteSheetData
} from "src/core/data.js";

import {
  JimpData,
  SupportedPixelSource,
  readPixelSourceToJimp
} from "./util.js";

type BinWithFrameLayers = Bin & {
  spriteIndex: number;
  frameLayers: FrameLayerData[];
  pixelSource?: SupportedPixelSource;
};

export async function packSpriteSheet(
  sheet: SpriteSheetData,
  opt?: {
    padding: number;
  }
): Promise<SpriteSheetData> {
  const { padding = 2 } = opt ?? {};

  const spriteLayerFrameKey = (
    spriteIndex: number,
    size: SizeData,
    pos: PositionData
  ) => `${spriteIndex}:${pos.x}:${pos.y}:${size.width}:${size.height}`;
  const bins: BinWithFrameLayers[] = [];
  const binsByBBoxKey = new Map<string, BinWithFrameLayers>();

  sheet.sprites.forEach((sprite, spriteIndex) => {
    for (const frame of sprite.frames) {
      for (const frameLayer of frame.layers) {
        const frameSourceKey = spriteLayerFrameKey(
          spriteIndex,
          frameLayer.size,
          frameLayer.sheetPosition
        );
        let frameBin = binsByBBoxKey.get(frameSourceKey);
        if (!frameBin) {
          frameBin = {
            width: frameLayer.size.width + padding * 2,
            height: frameLayer.size.height + padding * 2,
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
  const pixelSourceToJimp = new WeakMap<SupportedPixelSource, JimpData>();
  let parentSheetPixelSourceUsed = false;
  for (const sprite of sheet.sprites) {
    if (sprite.pixelSource === undefined) continue;
    const img = await readPixelSourceToJimp(sprite.pixelSource);
    if (img) {
      pixelSourceToJimp.set(sprite.pixelSource, img);
    }
  }
  if (sheet.pixelSource !== undefined) {
    const img = await readPixelSourceToJimp(sheet.pixelSource);
    if (img) {
      pixelSourceToJimp.set(sheet.pixelSource, img);
    }
  }

  // Perform blitting onto a shared sprite sheet and swap source bounding boxes.
  const resultImg = new Jimp({
    width: packed.width,
    height: packed.height
  });
  const spriteFrameKeyToNewPosition = new Map<string, PositionData>();
  for (const resBin of packed.items) {
    let img: JimpData | undefined;
    if (resBin.item.pixelSource !== undefined) {
      img = pixelSourceToJimp.get(resBin.item.pixelSource);
    } else if (sheet.pixelSource) {
      img = pixelSourceToJimp.get(sheet.pixelSource);
    }
    if (img === undefined) continue;
    let blitDone = false;
    for (const frameLayer of resBin.item.frameLayers) {
      const prevSheetPos = frameLayer.sheetPosition;
      const newSheetPos = new PositionData();
      newSheetPos.x = resBin.x + padding;
      newSheetPos.y = resBin.y + padding;
      spriteFrameKeyToNewPosition.set(
        spriteLayerFrameKey(
          resBin.item.spriteIndex,
          frameLayer.size,
          prevSheetPos
        ),
        newSheetPos
      );
      if (!blitDone) {
        resultImg.blit({
          src: img,
          srcX: prevSheetPos.x,
          srcY: prevSheetPos.y,
          srcW: frameLayer.size.width,
          srcH: frameLayer.size.height,
          x: newSheetPos.x,
          y: newSheetPos.y
        });
        blitDone = true;
      }
    }
  }

  const result = sheet.clone();
  const resultPng = await resultImg.getBuffer("image/png");
  result.pixelSource = new EmbeddedSpriteSheetData();
  result.pixelSource.pngData = new Uint8Array(resultPng);

  result.sprites.forEach((sprite, spriteIndex) => {
    for (const frame of sprite.frames) {
      for (const frameLayer of frame.layers) {
        const resultPos = spriteFrameKeyToNewPosition.get(
          spriteLayerFrameKey(
            spriteIndex,
            frameLayer.size,
            frameLayer.sheetPosition
          )
        );
        if (resultPos === undefined)
          throw new Error("Missing position in result.");
        frameLayer.sheetPosition = resultPos;
      }
    }
    sprite.pixelSource = undefined;
  });

  return result;
}
