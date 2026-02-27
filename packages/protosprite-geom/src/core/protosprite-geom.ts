import { fromBinary, toBinary, toJson } from "@bufbuild/protobuf";
import { ProtoSpriteSheet } from "protosprite-core";
import { SpriteGeometrySchema } from "../../proto_dist/sprite_geometry_pb.js";
import { SpriteGeometryData } from "./data.js";
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
}
