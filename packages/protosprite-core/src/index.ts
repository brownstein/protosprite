import { toBinary, fromJson, fromBinary, toJson } from "@bufbuild/protobuf";
import { fromUint8Array, toUint8Array } from "js-base64";
import { SpriteJson, SpriteSchema } from "proto_dist/sprite_pb";

export function encodeSpriteAsUint8Array(source: SpriteJson): Uint8Array {
  return toBinary(
    SpriteSchema,
    fromJson(SpriteSchema, source, {
      ignoreUnknownFields: true,
    })
  );
}

export function encodeSpriteAsString(source: SpriteJson): string {
  return fromUint8Array(encodeSpriteAsUint8Array(source));
}

export function dumpJson(source: string) {
  return JSON.stringify(
    toJson(SpriteSchema, fromBinary(SpriteSchema, toUint8Array(source))),
    null,
    2
  );
}
