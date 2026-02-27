import { Vec2Data } from "../core/data.js";
export interface ImageDataLike {
    width: number;
    height: number;
    data: Uint8Array | Buffer;
}
export declare function traceContours(imageData: ImageDataLike, alphaThreshold?: number): Vec2Data[][];
