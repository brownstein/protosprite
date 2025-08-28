import { Jimp } from "jimp";

import { ProtoSpriteInstance } from "../core/index.js";

export async function renderSpriteInstance(
  spriteInstance: ProtoSpriteInstance,
  opt?: {
    includeLayers?: string[];
    excludeLayers?: string[];
    assetPath?: string;
  }
) {
  const includeLayers = opt?.includeLayers
    ? new Set(opt.includeLayers)
    : undefined;
  const excludeLayers = opt?.excludeLayers
    ? new Set(opt.excludeLayers)
    : undefined;

  const resultImg = new Jimp({
    width: spriteInstance.data.center.x * 2,
    height: spriteInstance.data.center.y * 2
  });

  let sourceImage: Awaited<ReturnType<typeof Jimp.read>> | undefined;
  if (
    sourceImage === undefined &&
    spriteInstance.data.pixelSource?.pngBytes !== undefined
  ) {
    const stringifiedBuffer = `data:image/png;base64,${Buffer.from(spriteInstance.data.pixelSource.pngBytes).toString("base64")}`;
    sourceImage = await Jimp.read(stringifiedBuffer, {
      "image/png": {}
    });
  }
  if (
    sourceImage === undefined &&
    (spriteInstance.data.pixelSource?.url ??
      spriteInstance.data.pixelSource?.fileName) !== undefined
  ) {
    const url =
      spriteInstance.data.pixelSource?.url ??
      spriteInstance.data.pixelSource?.fileName;
    if (url)
      sourceImage = await Jimp.read(`${opt?.assetPath ?? ""}${url}`, {
        "image/png": {}
      });
  }
  if (
    sourceImage === undefined &&
    spriteInstance.data.sheet?.pixelSource?.pngBytes !== undefined
  ) {
    const stringifiedBuffer = `data:image/png;base64,${Buffer.from(spriteInstance.data.sheet.pixelSource.pngBytes).toString("base64")}`;
    sourceImage = await Jimp.read(stringifiedBuffer, {
      "image/png": {}
    });
  }
  if (
    sourceImage === undefined &&
    (spriteInstance.data.sheet?.pixelSource?.url ??
      spriteInstance.data.sheet?.pixelSource?.fileName) !== undefined
  ) {
    const url =
      spriteInstance.data.sheet?.pixelSource?.url ??
      spriteInstance.data.sheet?.pixelSource?.fileName;
    if (url)
      sourceImage = await Jimp.read(`${opt?.assetPath ?? ""}${url}`, {
        "image/png": {}
      });
  }

  if (sourceImage === undefined)
    throw new Error("Unable to locate a suitable pixel source for rendering");

  spriteInstance.forEachLayerOfCurrentFrame((layerFrame) => {
    if (sourceImage === undefined) return;
    let layer = layerFrame.layer;
    let included = false;
    let excluded = false;
    while (layer !== undefined) {
      if (includeLayers !== undefined) {
        if (includeLayers.has(layer.name ?? "*")) {
          included = true;
          break;
        }
      }
      if (excludeLayers !== undefined) {
        if (excludeLayers.has(layer.name ?? "*")) {
          excluded = true;
          break;
        }
      }
      layer = layer.parent;
    }
    if (included || !excluded) {
      resultImg.blit({
        src: sourceImage,
        srcX: layerFrame.sheetBBox.x,
        srcY: layerFrame.sheetBBox.y,
        srcW: layerFrame.sheetBBox.width,
        srcH: layerFrame.sheetBBox.height,
        x: layerFrame.spriteBBox.x,
        y: layerFrame.spriteBBox.y
      });
    }
  });

  return resultImg;
}
