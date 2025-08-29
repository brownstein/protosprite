import { fromBinary, toBinary, toJson } from "@bufbuild/protobuf";
import { SpriteSheetSchema } from "proto_dist/sprite_pb.js";

import { SpriteData, SpriteSheetData } from "./data.js";
import {
  ProtoSpriteDataMap,
  ProtoSpriteInstanceAnimationState
} from "./util.js";

export class ProtoSpriteSheet {
  public data: SpriteSheetData;
  public sprites: ProtoSprite[];

  constructor(data?: SpriteSheetData) {
    this.data = data ?? new SpriteSheetData();
    this.sprites = this.data.sprites.map(
      (spriteData) => new ProtoSprite(spriteData, this)
    );
  }

  static fromArray(uint8Array: Uint8Array) {
    const proto = fromBinary(SpriteSheetSchema, uint8Array);
    const resultData = SpriteSheetData.fromProto(proto);
    return new ProtoSpriteSheet(resultData);
  }

  toArray() {
    const proto = this.data.toProto();
    return toBinary(SpriteSheetSchema, proto);
  }

  toJsonObject() {
    const proto = this.data.toProto();
    return toJson(SpriteSheetSchema, proto);
  }
}

export class ProtoSprite {
  public data: SpriteData;
  public sheet?: ProtoSpriteSheet;
  public maps: ProtoSpriteDataMap;

  constructor(data?: SpriteData, sheet?: ProtoSpriteSheet) {
    this.data = data ?? new SpriteData();
    this.sheet = sheet;
    this.maps = new ProtoSpriteDataMap(this.data);
  }

  countLayers() {
    return this.data.layers.length - this.maps.layerGroupSet.size;
  }

  countGroups() {
    return this.maps.layerGroupSet.size;
  }
}

export class ProtoSpriteInstance {
  public sprite: ProtoSprite;
  public animationState: ProtoSpriteInstanceAnimationState;

  constructor(sprite: ProtoSprite) {
    this.sprite = sprite;
    this.animationState = new ProtoSpriteInstanceAnimationState(
      this.sprite.maps
    );
  }
}
