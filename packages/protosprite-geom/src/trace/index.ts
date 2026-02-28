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
  IndexedPolygonData,
  PolygonData,
  ShapePoolEntryData,
  SpriteGeometryData,
  SpriteGeometryEntryData,
  Vec2Data
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

class VertexPoolBuilder {
  private pool: Vec2Data[] = [];
  private hashMap = new Map<string, number>();

  addVertex(v: Vec2Data): number {
    const key = `${v.x},${v.y}`;
    const existing = this.hashMap.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const index = this.pool.length;
    this.pool.push(v);
    this.hashMap.set(key, index);
    return index;
  }

  getPool(): Vec2Data[] {
    return this.pool;
  }
}

class ShapePoolBuilder {
  private pool: ShapePoolEntryData[] = [];
  private hashMap = new Map<string, number>();
  private vertexBuilder: VertexPoolBuilder;

  constructor(vertexBuilder: VertexPoolBuilder) {
    this.vertexBuilder = vertexBuilder;
  }

  private indexPolygon(polygon: PolygonData): IndexedPolygonData {
    const indexed = new IndexedPolygonData();
    indexed.vertexIndices = polygon.vertices.map((v) => this.vertexBuilder.addVertex(v));
    return indexed;
  }

  private hashIndexedPolygon(indexed: IndexedPolygonData): string {
    return indexed.vertexIndices.join(";");
  }

  addShape(polygon: PolygonData, decomposition: ConvexDecompositionData): number {
    const indexedPolygon = this.indexPolygon(polygon);
    const key = this.hashIndexedPolygon(indexedPolygon);
    const existing = this.hashMap.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const index = this.pool.length;
    const entry = new ShapePoolEntryData();
    entry.polygon = indexedPolygon;
    entry.convexDecompositionComponents = decomposition.components.map((c) => this.indexPolygon(c));
    this.pool.push(entry);
    this.hashMap.set(key, index);
    return index;
  }

  getPool(): ShapePoolEntryData[] {
    return this.pool;
  }
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

    const vertexBuilder = new VertexPoolBuilder();
    const poolBuilder = new ShapePoolBuilder(vertexBuilder);

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

          const shapeIndices: number[] = [];
          for (let i = 0; i < polygons.length; i++) {
            shapeIndices.push(poolBuilder.addShape(polygons[i], convexDecompositions[i]));
          }
          layerGeom.shapeIndices = shapeIndices;
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
        const shapeIndices: number[] = [];
        for (let i = 0; i < polygons.length; i++) {
          shapeIndices.push(poolBuilder.addShape(polygons[i], convexDecompositions[i]));
        }
        compositeGeom.shapeIndices = shapeIndices;
        frameGeom.composite = compositeGeom;
      }

      entry.frames.push(frameGeom);
    }

    entry.shapePool = poolBuilder.getPool();
    entry.vertexPool = vertexBuilder.getPool();
    result.entries.push(entry);
  }

  return result;
}
