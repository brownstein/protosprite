import { Buffer } from "buffer";
import { Jimp } from "jimp";
import {
  Data,
  ProtoSpriteInstance,
  ProtoSpriteSheet
} from "protosprite-core";
import { renderSpriteInstance } from "protosprite-core/transform";

import {
  CompositeFrameGeometryData,
  ConvexDecompositionData,
  FrameGeometryData,
  FrameLayerGeometryData,
  PolygonData,
  SpriteGeometryData,
  SpriteGeometryEntryData
} from "../core/data.js";
import { decomposeConvex } from "./convex.js";
import { simplifyPolygon } from "./simplify.js";
import { traceContours } from "./trace.js";

export { traceContours } from "./trace.js";
export { simplifyPolygon } from "./simplify.js";
export { decomposeConvex } from "./convex.js";

export interface TraceSpriteSheetOptions {
  tolerance: number;
  alphaThreshold?: number;
  highQuality?: boolean;
  composite?: boolean;
  perLayer?: boolean;
}

type JimpImage = Awaited<ReturnType<typeof Jimp.read>>;

type PixelSource =
  | Data.EmbeddedSpriteSheetData
  | Data.ExternalSpriteSheetData;

async function readPixelSource(
  pixelSource: PixelSource
): Promise<JimpImage | null> {
  if (Data.isEmbeddedSpriteSheetData(pixelSource)) {
    if (pixelSource.pngData) {
      const b64 = `data:image/png;base64,${Buffer.from(pixelSource.pngData).toString("base64")}`;
      return Jimp.read(b64, { "image/png": {} });
    }
    return null;
  }
  if (Data.isExternalSpriteSheetData(pixelSource)) {
    const urlOrFileName = pixelSource.url ?? pixelSource.fileName;
    if (!urlOrFileName) return null;
    return Jimp.read(urlOrFileName, { "image/png": {} });
  }
  return null;
}

function traceAndProcess(
  imageData: { width: number; height: number; data: Uint8Array | Buffer },
  tolerance: number,
  alphaThreshold: number,
  highQuality: boolean
): {
  polygons: PolygonData[];
  convexDecompositions: ConvexDecompositionData[];
} {
  const rawContours = traceContours(imageData, alphaThreshold);
  const polygons: PolygonData[] = [];
  const convexDecompositions: ConvexDecompositionData[] = [];

  for (const contour of rawContours) {
    const simplified = simplifyPolygon(contour, tolerance, highQuality);
    if (simplified.length < 3) continue;

    const poly = new PolygonData();
    poly.vertices = simplified;
    polygons.push(poly);

    const convexParts = decomposeConvex(simplified);
    const decomposition = new ConvexDecompositionData();
    decomposition.components = convexParts.map((part) => {
      const p = new PolygonData();
      p.vertices = part;
      return p;
    });
    convexDecompositions.push(decomposition);
  }

  return { polygons, convexDecompositions };
}

export async function traceSpriteSheet(
  sheet: ProtoSpriteSheet,
  options: TraceSpriteSheetOptions
): Promise<SpriteGeometryData> {
  const {
    tolerance,
    alphaThreshold = 1,
    highQuality = true,
    composite = true,
    perLayer = false
  } = options;

  const result = new SpriteGeometryData();

  // Load the sheet-level pixel source image.
  let sheetImg: JimpImage | null = null;
  if (sheet.data.pixelSource) {
    sheetImg = await readPixelSource(sheet.data.pixelSource);
  }

  for (const sprite of sheet.sprites) {
    const entry = new SpriteGeometryEntryData();
    entry.spriteName = sprite.data.name;
    entry.simplifyTolerance = tolerance;

    // Try sprite-level pixel source, fall back to sheet image.
    let spriteImg = sheetImg;
    if (sprite.data.pixelSource) {
      const img = await readPixelSource(sprite.data.pixelSource);
      if (img) spriteImg = img;
    }

    for (const frame of sprite.data.frames) {
      const frameGeom = new FrameGeometryData();
      frameGeom.frameIndex = frame.index;

      // Per-layer tracing.
      if (perLayer && spriteImg) {
        for (const frameLayer of frame.layers) {
          const layerGeom = new FrameLayerGeometryData();
          layerGeom.layerIndex = frameLayer.layerIndex;

          // Extract this layer's pixel region from the sprite sheet.
          const layerImg = new Jimp({
            width: frameLayer.size.width,
            height: frameLayer.size.height
          });
          layerImg.blit({
            src: spriteImg,
            srcX: frameLayer.sheetPosition.x,
            srcY: frameLayer.sheetPosition.y,
            srcW: frameLayer.size.width,
            srcH: frameLayer.size.height,
            x: 0,
            y: 0
          });

          const imageData = {
            width: layerImg.width,
            height: layerImg.height,
            data: new Uint8Array(layerImg.bitmap.data)
          };

          const { polygons, convexDecompositions } = traceAndProcess(
            imageData,
            tolerance,
            alphaThreshold,
            highQuality
          );

          // Offset polygons to sprite-local coordinates.
          for (const poly of polygons) {
            for (const v of poly.vertices) {
              v.x += frameLayer.spritePosition.x;
              v.y += frameLayer.spritePosition.y;
            }
          }
          for (const decomposition of convexDecompositions) {
            for (const comp of decomposition.components) {
              for (const v of comp.vertices) {
                v.x += frameLayer.spritePosition.x;
                v.y += frameLayer.spritePosition.y;
              }
            }
          }

          layerGeom.polygons = polygons;
          layerGeom.convexDecompositions = convexDecompositions;
          frameGeom.layers.push(layerGeom);
        }
      }

      // Composite-frame tracing.
      if (composite) {
        const instance = new ProtoSpriteInstance(sprite);
        instance.animationState.currentFrame = frame.index;

        const compositeImg = await renderSpriteInstance(instance);
        const compositeImageData = {
          width: compositeImg.width,
          height: compositeImg.height,
          data: new Uint8Array(compositeImg.bitmap.data)
        };

        const { polygons, convexDecompositions } = traceAndProcess(
          compositeImageData,
          tolerance,
          alphaThreshold,
          highQuality
        );

        const compositeGeom = new CompositeFrameGeometryData();
        compositeGeom.polygons = polygons;
        compositeGeom.convexDecompositions = convexDecompositions;
        frameGeom.composite = compositeGeom;
      }

      entry.frames.push(frameGeom);
    }

    result.entries.push(entry);
  }

  return result;
}
