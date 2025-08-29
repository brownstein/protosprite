import { Jimp } from "jimp";

import { EmbeddedSpriteSheetData, ExternalSpriteSheetData, SpriteData, isEmbeddedSpriteSheetData, isExternalSpriteSheetData } from "src/core/data.js";

export type SupportedPixelSource = EmbeddedSpriteSheetData | ExternalSpriteSheetData;
export type JimpData = Awaited<ReturnType<typeof Jimp.read>>;

export async function readPixelSourceToJimp(pixelSource: SupportedPixelSource) {
  if (isEmbeddedSpriteSheetData(pixelSource)) {
    if (pixelSource.pngData) {
      const stringifiedBuffer = `data:image/png;base64,${Buffer.from(pixelSource.pngData).toString("base64")}`;
      return Jimp.read(stringifiedBuffer, {
        "image/png": {}
      });
    } else {
      throw new Error("Unable to find PNG data in embedded sprite sheet.");
    }
  }
  if (isExternalSpriteSheetData(pixelSource)) {
    const urlOrFileName = pixelSource.url ?? pixelSource.fileName;
    if (!urlOrFileName) throw new Error("Unable to find URL for pixel source.");
    return Jimp.read(urlOrFileName, {
      "image/png": {}
    });
  }
  return null;
}
