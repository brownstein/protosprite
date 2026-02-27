import { CompositeFrameGeometry, ConvexDecomposition, FrameGeometry, FrameLayerGeometry, Polygon, SpriteGeometry, SpriteGeometryEntry, Vec2 } from "../../proto_dist/sprite_geometry_pb.js";
export declare class Vec2Data {
    x: number;
    y: number;
    static fromProto(proto: Vec2): Vec2Data;
    toProto(protoIn?: Vec2): Vec2;
    clone(): Vec2Data;
}
export declare class PolygonData {
    vertices: Vec2Data[];
    static fromProto(proto: Polygon): PolygonData;
    toProto(protoIn?: Polygon): Polygon;
    clone(): PolygonData;
}
export declare class ConvexDecompositionData {
    components: PolygonData[];
    static fromProto(proto: ConvexDecomposition): ConvexDecompositionData;
    toProto(protoIn?: ConvexDecomposition): ConvexDecomposition;
    clone(): ConvexDecompositionData;
}
export declare class FrameLayerGeometryData {
    layerIndex: number;
    polygons: PolygonData[];
    convexDecompositions: ConvexDecompositionData[];
    static fromProto(proto: FrameLayerGeometry): FrameLayerGeometryData;
    toProto(protoIn?: FrameLayerGeometry): FrameLayerGeometry;
    clone(): FrameLayerGeometryData;
}
export declare class CompositeFrameGeometryData {
    polygons: PolygonData[];
    convexDecompositions: ConvexDecompositionData[];
    static fromProto(proto: CompositeFrameGeometry): CompositeFrameGeometryData;
    toProto(protoIn?: CompositeFrameGeometry): CompositeFrameGeometry;
    clone(): CompositeFrameGeometryData;
}
export declare class FrameGeometryData {
    frameIndex: number;
    layers: FrameLayerGeometryData[];
    composite?: CompositeFrameGeometryData;
    static fromProto(proto: FrameGeometry): FrameGeometryData;
    toProto(protoIn?: FrameGeometry): FrameGeometry;
    clone(): FrameGeometryData;
}
export declare class SpriteGeometryEntryData {
    spriteName: string;
    frames: FrameGeometryData[];
    simplifyTolerance: number;
    static fromProto(proto: SpriteGeometryEntry): SpriteGeometryEntryData;
    toProto(protoIn?: SpriteGeometryEntry): SpriteGeometryEntry;
    clone(): SpriteGeometryEntryData;
}
export type SpriteSourceData = {
    type: "embedded";
    prsData: Uint8Array;
} | {
    type: "externalFile";
    fileName: string;
} | {
    type: "externalUrl";
    url: string;
};
export declare class SpriteGeometryData {
    entries: SpriteGeometryEntryData[];
    spriteSource?: SpriteSourceData;
    static fromProto(proto: SpriteGeometry): SpriteGeometryData;
    toProto(protoIn?: SpriteGeometry): SpriteGeometry;
    clone(): SpriteGeometryData;
}
