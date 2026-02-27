import { ProtoSpriteSheet } from "protosprite-core";
import { SpriteGeometryData } from "../core/data.js";
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
export declare function traceSpriteSheet(sheet: ProtoSpriteSheet, options: TraceSpriteSheetOptions): Promise<SpriteGeometryData>;
