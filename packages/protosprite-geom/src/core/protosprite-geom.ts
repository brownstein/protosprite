import { fromBinary, toBinary, toJson } from "@bufbuild/protobuf";
import { ProtoSpriteSheet } from "protosprite-core";
import { SpriteGeometrySchema } from "../../proto_dist/sprite_geometry_pb.js";
import {
  ConvexDecompositionData,
  IndexedPolygonData,
  PolygonData,
  SpriteGeometryData,
  SpriteGeometryEntryData,
  Vec2Data
} from "./data.js";
import fs from "fs";

export class ProtoSpriteGeometry {
  public data: SpriteGeometryData;

  constructor(data?: SpriteGeometryData) {
    this.data = data ?? new SpriteGeometryData();
  }

  static fromArray(uint8Array: Uint8Array) {
    const proto = fromBinary(SpriteGeometrySchema, uint8Array);
    const resultData = SpriteGeometryData.fromProto(proto);
    return new ProtoSpriteGeometry(resultData);
  }

  toArray() {
    const proto = this.data.toProto();
    return toBinary(SpriteGeometrySchema, proto);
  }

  toJsonObject() {
    const proto = this.data.toProto();
    return toJson(SpriteGeometrySchema, proto);
  }

  getSpriteSheet(): ProtoSpriteSheet {
    if (!this.data.spriteSource) {
      throw new Error(
        "[ProtoSpriteGeometry] No sprite source defined in .prsg data."
      );
    }

    switch (this.data.spriteSource.type) {
      case "embedded":
        return ProtoSpriteSheet.fromArray(this.data.spriteSource.prsData);
      case "externalFile": {
        const rawBuff = fs.readFileSync(this.data.spriteSource.fileName);
        return ProtoSpriteSheet.fromArray(new Uint8Array(rawBuff));
      }
      case "externalUrl":
        throw new Error(
          "[ProtoSpriteGeometry] URL-based sprite source loading is not yet supported. Use a local file path."
        );
    }
  }

  embedSpriteSheet(sheet: ProtoSpriteSheet) {
    this.data.spriteSource = {
      type: "embedded",
      prsData: sheet.toArray()
    };
  }

  referenceSpriteSheet(fileNameOrUrl: string) {
    if (fileNameOrUrl.startsWith("http://") || fileNameOrUrl.startsWith("https://")) {
      this.data.spriteSource = {
        type: "externalUrl",
        url: fileNameOrUrl
      };
    } else {
      this.data.spriteSource = {
        type: "externalFile",
        fileName: fileNameOrUrl
      };
    }
  }

  getEntry(spriteName: string): SpriteGeometryEntryData | undefined {
    return this.data.entries.find((e) => e.spriteName === spriteName);
  }

  getFrameGeometry(
    spriteName: string,
    frameIndex: number
  ): ResolvedFrameGeometry | undefined {
    const entry = this.getEntry(spriteName);
    if (!entry) return undefined;

    const frameGeom = entry.frames.find((f) => f.frameIndex === frameIndex);
    if (!frameGeom) return undefined;

    const shapePool = entry.shapePool;
    const vertexPool = entry.vertexPool;

    const resolveIndexedPolygon = (indexed: IndexedPolygonData): PolygonData => {
      const poly = new PolygonData();
      poly.vertices = indexed.vertexIndices.map((vi) => vertexPool[vi]);
      return poly;
    };

    const resolveShape = (idx: number): { polygon: PolygonData; decomposition: ConvexDecompositionData } | undefined => {
      const shape = shapePool[idx];
      if (!shape) return undefined;
      const polygon = resolveIndexedPolygon(shape.polygon);
      const decomposition = new ConvexDecompositionData();
      decomposition.components = shape.convexDecompositionComponents.map(resolveIndexedPolygon);
      return { polygon, decomposition };
    };

    const layers: ResolvedLayerGeometry[] = frameGeom.layers.map((layer) => {
      const polygons: PolygonData[] = [];
      const convexDecompositions: ConvexDecompositionData[] = [];
      for (const idx of layer.shapeIndices) {
        const resolved = resolveShape(idx);
        if (resolved) {
          polygons.push(resolved.polygon);
          convexDecompositions.push(resolved.decomposition);
        }
      }
      return { layerIndex: layer.layerIndex, polygons, convexDecompositions };
    });

    let composite: ResolvedCompositeGeometry | undefined;
    if (frameGeom.composite) {
      const polygons: PolygonData[] = [];
      const convexDecompositions: ConvexDecompositionData[] = [];
      for (const idx of frameGeom.composite.shapeIndices) {
        const resolved = resolveShape(idx);
        if (resolved) {
          polygons.push(resolved.polygon);
          convexDecompositions.push(resolved.decomposition);
        }
      }
      composite = { polygons, convexDecompositions };
    }

    return { frameIndex: frameGeom.frameIndex, layers, composite };
  }
}

export interface ResolvedLayerGeometry {
  layerIndex: number;
  polygons: PolygonData[];
  convexDecompositions: ConvexDecompositionData[];
}

export interface ResolvedCompositeGeometry {
  polygons: PolygonData[];
  convexDecompositions: ConvexDecompositionData[];
}

export interface ResolvedFrameGeometry {
  frameIndex: number;
  layers: ResolvedLayerGeometry[];
  composite?: ResolvedCompositeGeometry;
}
