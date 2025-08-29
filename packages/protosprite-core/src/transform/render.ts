import { Jimp } from "jimp";

import { ProtoSpriteInstance } from "../core/index.js";
import { JimpData, readPixelSourceToJimp } from "./util.js";

export async function renderSpriteInstance(
  spriteInstance: ProtoSpriteInstance,
  opt?: {
    includeLayers?: string[];
    excludeLayers?: string[];
    assetPath?: string;
    debug?: boolean;
  }
) {
  const includeLayers = opt?.includeLayers
    ? new Set(opt.includeLayers)
    : undefined;
  const excludeLayers = opt?.excludeLayers
    ? new Set(opt.excludeLayers)
    : undefined;

  const resultImg = new Jimp({
    width: spriteInstance.sprite.data.size.width,
    height: spriteInstance.sprite.data.size.height
  });

  let sourceImg: JimpData | undefined;
  if (spriteInstance.sprite.data.pixelSource !== undefined) {
    sourceImg =
      (await readPixelSourceToJimp(spriteInstance.sprite.data.pixelSource)) ??
      undefined;
  }
  if (
    sourceImg === undefined &&
    spriteInstance.sprite.sheet?.data.pixelSource !== undefined
  ) {
    sourceImg =
      (await readPixelSourceToJimp(
        spriteInstance.sprite.sheet.data.pixelSource
      )) ?? undefined;
  }
  if (sourceImg === undefined)
    throw new Error("Unable to locate a suitable pixel source for rendering");

  const frame =
    spriteInstance.sprite.data.frames[
      spriteInstance.animationState.currentFrame
    ];
  if (frame === undefined) throw new Error("Current frame not found.");

  for (const layerFrame of frame.layers) {
    resultImg.blit({
      src: sourceImg,
      srcX: layerFrame.sheetPosition.x,
      srcY: layerFrame.sheetPosition.y,
      srcW: layerFrame.size.width,
      srcH: layerFrame.size.height,
      x: layerFrame.spritePosition.x,
      y: layerFrame.spritePosition.y
    });
  }

  return resultImg;
}
