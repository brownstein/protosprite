import type { GenFile, GenMessage } from "@bufbuild/protobuf/codegenv2";
import type { Message } from "@bufbuild/protobuf";
/**
 * Describes the file sprite_geometry.proto.
 */
export declare const file_sprite_geometry: GenFile;
/**
 * A 2D point with float precision (polygon vertices need sub-pixel accuracy
 * after simplification).
 *
 * @generated from message protosprite.Vec2
 */
export type Vec2 = Message<"protosprite.Vec2"> & {
    /**
     * @generated from field: float x = 1;
     */
    x: number;
    /**
     * @generated from field: float y = 2;
     */
    y: number;
};
/**
 * A 2D point with float precision (polygon vertices need sub-pixel accuracy
 * after simplification).
 *
 * @generated from message protosprite.Vec2
 */
export type Vec2Json = {
    /**
     * @generated from field: float x = 1;
     */
    x?: number | "NaN" | "Infinity" | "-Infinity";
    /**
     * @generated from field: float y = 2;
     */
    y?: number | "NaN" | "Infinity" | "-Infinity";
};
/**
 * Describes the message protosprite.Vec2.
 * Use `create(Vec2Schema)` to create a new message.
 */
export declare const Vec2Schema: GenMessage<Vec2, {
    jsonType: Vec2Json;
}>;
/**
 * A single closed polygon (ordered ring of vertices).
 *
 * @generated from message protosprite.Polygon
 */
export type Polygon = Message<"protosprite.Polygon"> & {
    /**
     * @generated from field: repeated protosprite.Vec2 vertices = 1;
     */
    vertices: Vec2[];
};
/**
 * A single closed polygon (ordered ring of vertices).
 *
 * @generated from message protosprite.Polygon
 */
export type PolygonJson = {
    /**
     * @generated from field: repeated protosprite.Vec2 vertices = 1;
     */
    vertices?: Vec2Json[];
};
/**
 * Describes the message protosprite.Polygon.
 * Use `create(PolygonSchema)` to create a new message.
 */
export declare const PolygonSchema: GenMessage<Polygon, {
    jsonType: PolygonJson;
}>;
/**
 * Convex decomposition of a polygon into convex parts.
 *
 * @generated from message protosprite.ConvexDecomposition
 */
export type ConvexDecomposition = Message<"protosprite.ConvexDecomposition"> & {
    /**
     * @generated from field: repeated protosprite.Polygon components = 1;
     */
    components: Polygon[];
};
/**
 * Convex decomposition of a polygon into convex parts.
 *
 * @generated from message protosprite.ConvexDecomposition
 */
export type ConvexDecompositionJson = {
    /**
     * @generated from field: repeated protosprite.Polygon components = 1;
     */
    components?: PolygonJson[];
};
/**
 * Describes the message protosprite.ConvexDecomposition.
 * Use `create(ConvexDecompositionSchema)` to create a new message.
 */
export declare const ConvexDecompositionSchema: GenMessage<ConvexDecomposition, {
    jsonType: ConvexDecompositionJson;
}>;
/**
 * Traced geometry for one layer within one frame.
 *
 * @generated from message protosprite.FrameLayerGeometry
 */
export type FrameLayerGeometry = Message<"protosprite.FrameLayerGeometry"> & {
    /**
     * @generated from field: int32 layer_index = 1;
     */
    layerIndex: number;
    /**
     * The raw traced & simplified outer polygon(s) — one per disjoint region.
     *
     * @generated from field: repeated protosprite.Polygon polygons = 2;
     */
    polygons: Polygon[];
    /**
     * Convex decompositions corresponding 1:1 to `polygons`.
     *
     * @generated from field: repeated protosprite.ConvexDecomposition convex_decompositions = 3;
     */
    convexDecompositions: ConvexDecomposition[];
};
/**
 * Traced geometry for one layer within one frame.
 *
 * @generated from message protosprite.FrameLayerGeometry
 */
export type FrameLayerGeometryJson = {
    /**
     * @generated from field: int32 layer_index = 1;
     */
    layerIndex?: number;
    /**
     * The raw traced & simplified outer polygon(s) — one per disjoint region.
     *
     * @generated from field: repeated protosprite.Polygon polygons = 2;
     */
    polygons?: PolygonJson[];
    /**
     * Convex decompositions corresponding 1:1 to `polygons`.
     *
     * @generated from field: repeated protosprite.ConvexDecomposition convex_decompositions = 3;
     */
    convexDecompositions?: ConvexDecompositionJson[];
};
/**
 * Describes the message protosprite.FrameLayerGeometry.
 * Use `create(FrameLayerGeometrySchema)` to create a new message.
 */
export declare const FrameLayerGeometrySchema: GenMessage<FrameLayerGeometry, {
    jsonType: FrameLayerGeometryJson;
}>;
/**
 * Composite geometry for the entire frame (all layers flattened).
 * Generated on demand as an alternative to per-layer geometry.
 *
 * @generated from message protosprite.CompositeFrameGeometry
 */
export type CompositeFrameGeometry = Message<"protosprite.CompositeFrameGeometry"> & {
    /**
     * Traced & simplified polygons for the composited frame image.
     *
     * @generated from field: repeated protosprite.Polygon polygons = 1;
     */
    polygons: Polygon[];
    /**
     * Convex decompositions corresponding 1:1 to `polygons`.
     *
     * @generated from field: repeated protosprite.ConvexDecomposition convex_decompositions = 2;
     */
    convexDecompositions: ConvexDecomposition[];
};
/**
 * Composite geometry for the entire frame (all layers flattened).
 * Generated on demand as an alternative to per-layer geometry.
 *
 * @generated from message protosprite.CompositeFrameGeometry
 */
export type CompositeFrameGeometryJson = {
    /**
     * Traced & simplified polygons for the composited frame image.
     *
     * @generated from field: repeated protosprite.Polygon polygons = 1;
     */
    polygons?: PolygonJson[];
    /**
     * Convex decompositions corresponding 1:1 to `polygons`.
     *
     * @generated from field: repeated protosprite.ConvexDecomposition convex_decompositions = 2;
     */
    convexDecompositions?: ConvexDecompositionJson[];
};
/**
 * Describes the message protosprite.CompositeFrameGeometry.
 * Use `create(CompositeFrameGeometrySchema)` to create a new message.
 */
export declare const CompositeFrameGeometrySchema: GenMessage<CompositeFrameGeometry, {
    jsonType: CompositeFrameGeometryJson;
}>;
/**
 * Geometry for an entire frame.
 *
 * @generated from message protosprite.FrameGeometry
 */
export type FrameGeometry = Message<"protosprite.FrameGeometry"> & {
    /**
     * @generated from field: int32 frame_index = 1;
     */
    frameIndex: number;
    /**
     * @generated from field: repeated protosprite.FrameLayerGeometry layers = 2;
     */
    layers: FrameLayerGeometry[];
    /**
     * Optional: unified polygon traced from the fully composited frame
     * (all layers flattened). Present only when composite tracing is requested.
     *
     * @generated from field: protosprite.CompositeFrameGeometry composite = 3;
     */
    composite?: CompositeFrameGeometry;
};
/**
 * Geometry for an entire frame.
 *
 * @generated from message protosprite.FrameGeometry
 */
export type FrameGeometryJson = {
    /**
     * @generated from field: int32 frame_index = 1;
     */
    frameIndex?: number;
    /**
     * @generated from field: repeated protosprite.FrameLayerGeometry layers = 2;
     */
    layers?: FrameLayerGeometryJson[];
    /**
     * Optional: unified polygon traced from the fully composited frame
     * (all layers flattened). Present only when composite tracing is requested.
     *
     * @generated from field: protosprite.CompositeFrameGeometry composite = 3;
     */
    composite?: CompositeFrameGeometryJson;
};
/**
 * Describes the message protosprite.FrameGeometry.
 * Use `create(FrameGeometrySchema)` to create a new message.
 */
export declare const FrameGeometrySchema: GenMessage<FrameGeometry, {
    jsonType: FrameGeometryJson;
}>;
/**
 * Top-level geometry container for one sprite.
 *
 * @generated from message protosprite.SpriteGeometryEntry
 */
export type SpriteGeometryEntry = Message<"protosprite.SpriteGeometryEntry"> & {
    /**
     * @generated from field: string sprite_name = 1;
     */
    spriteName: string;
    /**
     * @generated from field: repeated protosprite.FrameGeometry frames = 2;
     */
    frames: FrameGeometry[];
    /**
     * Simplification tolerance that was used to generate these polygons.
     *
     * @generated from field: float simplify_tolerance = 3;
     */
    simplifyTolerance: number;
};
/**
 * Top-level geometry container for one sprite.
 *
 * @generated from message protosprite.SpriteGeometryEntry
 */
export type SpriteGeometryEntryJson = {
    /**
     * @generated from field: string sprite_name = 1;
     */
    spriteName?: string;
    /**
     * @generated from field: repeated protosprite.FrameGeometry frames = 2;
     */
    frames?: FrameGeometryJson[];
    /**
     * Simplification tolerance that was used to generate these polygons.
     *
     * @generated from field: float simplify_tolerance = 3;
     */
    simplifyTolerance?: number | "NaN" | "Infinity" | "-Infinity";
};
/**
 * Describes the message protosprite.SpriteGeometryEntry.
 * Use `create(SpriteGeometryEntrySchema)` to create a new message.
 */
export declare const SpriteGeometryEntrySchema: GenMessage<SpriteGeometryEntry, {
    jsonType: SpriteGeometryEntryJson;
}>;
/**
 * Root message serialized into .prsg files.
 *
 * @generated from message protosprite.SpriteGeometry
 */
export type SpriteGeometry = Message<"protosprite.SpriteGeometry"> & {
    /**
     * @generated from field: repeated protosprite.SpriteGeometryEntry entries = 1;
     */
    entries: SpriteGeometryEntry[];
    /**
     * The .prsg can either embed the full .prs data or reference it externally.
     *
     * @generated from oneof protosprite.SpriteGeometry.sprite_source
     */
    spriteSource: {
        /**
         * Full .prs binary embedded
         *
         * @generated from field: bytes embedded_prs = 2;
         */
        value: Uint8Array;
        case: "embeddedPrs";
    } | {
        /**
         * Path/filename of a .prs file
         *
         * @generated from field: string external_prs_file = 3;
         */
        value: string;
        case: "externalPrsFile";
    } | {
        /**
         * URL of a .prs file
         *
         * @generated from field: string external_prs_url = 4;
         */
        value: string;
        case: "externalPrsUrl";
    } | {
        case: undefined;
        value?: undefined;
    };
};
/**
 * Root message serialized into .prsg files.
 *
 * @generated from message protosprite.SpriteGeometry
 */
export type SpriteGeometryJson = {
    /**
     * @generated from field: repeated protosprite.SpriteGeometryEntry entries = 1;
     */
    entries?: SpriteGeometryEntryJson[];
    /**
     * Full .prs binary embedded
     *
     * @generated from field: bytes embedded_prs = 2;
     */
    embeddedPrs?: string;
    /**
     * Path/filename of a .prs file
     *
     * @generated from field: string external_prs_file = 3;
     */
    externalPrsFile?: string;
    /**
     * URL of a .prs file
     *
     * @generated from field: string external_prs_url = 4;
     */
    externalPrsUrl?: string;
};
/**
 * Describes the message protosprite.SpriteGeometry.
 * Use `create(SpriteGeometrySchema)` to create a new message.
 */
export declare const SpriteGeometrySchema: GenMessage<SpriteGeometry, {
    jsonType: SpriteGeometryJson;
}>;
