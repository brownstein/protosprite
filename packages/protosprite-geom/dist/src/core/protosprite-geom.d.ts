import { ProtoSpriteSheet } from "protosprite-core";
import { SpriteGeometryData } from "./data.js";
export declare class ProtoSpriteGeometry {
    data: SpriteGeometryData;
    constructor(data?: SpriteGeometryData);
    static fromArray(uint8Array: Uint8Array): ProtoSpriteGeometry;
    toArray(): Uint8Array<ArrayBuffer>;
    toJsonObject(): import("../../proto_dist/sprite_geometry_pb.js").SpriteGeometryJson;
    getSpriteSheet(): ProtoSpriteSheet;
    embedSpriteSheet(sheet: ProtoSpriteSheet): void;
    referenceSpriteSheet(fileNameOrUrl: string): void;
}
