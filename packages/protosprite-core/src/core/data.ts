import { create, fromBinary, toBinary, toJson } from "@bufbuild/protobuf";

import {
  Animation,
  AnimationSchema,
  EmbeddedSpriteSheet,
  EmbeddedSpriteSheetSchema,
  EmbeddedSpriteSheet_Encoding,
  ExternalSpriteSheet,
  ExternalSpriteSheetSchema,
  Frame,
  FrameSchema,
  Frame_FrameLayer,
  Frame_FrameLayerSchema,
  Layer,
  LayerSchema,
  Position,
  PositionSchema,
  Size,
  SizeSchema,
  Sprite,
  SpriteSchema,
  SpriteSheet,
  SpriteSheetSchema
} from "../../proto_dist/sprite_pb.js";

export class SizeData {
  public width = 0;
  public height = 0;

  static fromProto(proto: Size) {
    const instance = new SizeData();
    instance.width = proto.width;
    instance.height = proto.height;
    return instance;
  }

  toProto(protoIn?: Size) {
    const proto = protoIn ?? create(SizeSchema);
    proto.width = this.width;
    proto.height = this.height;
    return proto;
  }

  clone() {
    const other = new SizeData();
    other.width = this.width;
    other.height = this.height;
    return other;
  }
}

export class PositionData {
  public x = 0;
  public y = 0;

  static fromProto(proto: Position) {
    const instance = new PositionData();
    instance.x = proto.x;
    instance.y = proto.y;
    return instance;
  }

  toProto(protoIn?: Position) {
    const proto = protoIn ?? create(PositionSchema);
    proto.x = this.x;
    proto.y = this.y;
    return proto;
  }

  clone() {
    const other = new PositionData();
    other.x = this.x;
    other.y = this.y;
    return other;
  }
}

export class LayerData {
  public index = 0;
  public name = "";
  public isGroup = false;
  public parentIndex?: number;
  public opacity?: number;

  static fromProto(proto: Layer) {
    const instance = new LayerData();
    instance.name = proto.name;
    instance.isGroup = proto.isGroup;
    instance.parentIndex = proto.parentIndex;
    instance.opacity = proto.opacity;
    return instance;
  }

  toProto(protoIn?: Layer) {
    const proto = protoIn ?? create(LayerSchema);
    proto.name = this.name;
    proto.isGroup = this.isGroup;
    proto.parentIndex = this.parentIndex;
    proto.opacity = this.opacity;
    return proto;
  }

  clone() {
    const other = new LayerData();
    other.name = this.name;
    other.isGroup = this.isGroup;
    other.parentIndex = this.parentIndex;
    other.opacity = this.opacity;
    return other;
  }
}

export class FrameLayerData {
  public layerIndex = 0;
  public size = new SizeData();
  public sheetPosition = new PositionData();
  public spritePosition = new PositionData();

  static fromProto(proto: Frame_FrameLayer) {
    const instance = new FrameLayerData();
    instance.layerIndex = proto.layerIndex;
    instance.size = proto.size
      ? SizeData.fromProto(proto.size)
      : new SizeData();
    instance.sheetPosition = proto.sheetPosition
      ? PositionData.fromProto(proto.sheetPosition)
      : new PositionData();
    instance.spritePosition = proto.spritePosition
      ? PositionData.fromProto(proto.spritePosition)
      : new PositionData();
    return instance;
  }

  toProto(protoIn?: Frame_FrameLayer) {
    const proto = protoIn ?? create(Frame_FrameLayerSchema);
    proto.layerIndex = this.layerIndex;
    proto.size = this.size.toProto();
    proto.sheetPosition = this.sheetPosition.toProto();
    proto.spritePosition = this.spritePosition.toProto();
    return proto;
  }

  clone() {
    const other = new FrameLayerData();
    other.layerIndex = this.layerIndex;
    other.size = this.size.clone();
    other.sheetPosition = this.sheetPosition.clone();
    other.spritePosition = this.spritePosition.clone();
    return other;
  }
}

export class FrameData {
  public index = 0;
  public layers: FrameLayerData[] = [];
  public duration = 100;

  static fromProto(proto: Frame) {
    const instance = new FrameData();
    instance.index = proto.index;
    instance.layers = proto.layers.map(FrameLayerData.fromProto);
    instance.duration = proto.duration;
    return instance;
  }

  toProto(protoIn?: Frame) {
    const proto = protoIn ?? create(FrameSchema);
    proto.index = this.index;
    proto.layers = this.layers.map((layer) => layer.toProto());
    proto.duration = this.duration;
    return proto;
  }

  clone() {
    const other = new FrameData();
    other.index = this.index;
    other.layers = this.layers.map((layer) => layer.clone());
    other.duration = this.duration;
    return other;
  }
}

export class AnimationData {
  public name = "";
  public indexStart = -1;
  public indexEnd = -1;

  static fromProto(proto: Animation) {
    const instance = new AnimationData();
    instance.name = proto.name;
    instance.indexStart = proto.indexStart;
    instance.indexEnd = proto.indexEnd;
    return instance;
  }

  toProto(protoIn?: Animation) {
    const proto = protoIn ?? create(AnimationSchema);
    proto.name = this.name;
    proto.indexStart = this.indexStart;
    proto.indexEnd = this.indexEnd;
    return proto;
  }

  clone() {
    const other = new AnimationData();
    other.name = this.name;
    other.indexStart = this.indexStart;
    other.indexEnd = this.indexEnd;
    return other;
  }
}

export class EmbeddedSpriteSheetData {
  public _isEmbeddedData = true;

  public rawData?: Uint8Array;
  public pngData?: Uint8Array;

  static fromProto(proto: EmbeddedSpriteSheet) {
    const instance = new EmbeddedSpriteSheetData();
    switch (proto.encoding) {
      case EmbeddedSpriteSheet_Encoding.UNKNOWN:
        throw new Error(
          "[ProtoSprite] Encountered unknknown sprite sheet encoding."
        );
      case EmbeddedSpriteSheet_Encoding.PNG:
        instance.pngData = proto.data;
        break;
    }
    return instance;
  }

  toProto(protoIn?: EmbeddedSpriteSheet) {
    if (this.pngData === undefined)
      throw new Error(
        "[ProtoSprite] Cannot serialize EmbeddedSpriteSheet without PNG data."
      );
    const proto = protoIn ?? create(EmbeddedSpriteSheetSchema);
    proto.encoding = EmbeddedSpriteSheet_Encoding.PNG;
    proto.data = this.pngData;
    return proto;
  }

  clone(deep = false) {
    const other = new EmbeddedSpriteSheetData();
    if (this.rawData !== undefined) {
      other.rawData = deep ? new Uint8Array(this.rawData) : this.rawData;
    }
    if (this.pngData !== undefined) {
      other.pngData = deep ? new Uint8Array(this.pngData) : this.pngData;
    }
    return other;
  }
}

export class ExternalSpriteSheetData {
  public _isExternalData = true;

  public url?: string;
  public fileName?: string;

  static fromProto(proto: ExternalSpriteSheet) {
    const instance = new ExternalSpriteSheetData();
    switch (proto.source.case) {
      case "url":
        instance.url = proto.source.value;
        break;
      case "fileName":
        instance.fileName = proto.source.value;
        break;
    }
    return instance;
  }

  toProto(protoIn?: ExternalSpriteSheet) {
    const proto = protoIn ?? create(ExternalSpriteSheetSchema);
    if (this.url !== undefined) {
      proto.source.case = "url";
      proto.source.value = this.url;
    }
    if (this.fileName !== undefined) {
      proto.source.case = "fileName";
      proto.source.value = this.fileName;
    }
    return proto;
  }

  clone() {
    const other = new ExternalSpriteSheetData();
    other.url = this.url;
    other.fileName = this.fileName;
    return other;
  }
}

export function isEmbeddedSpriteSheetData(
  data: EmbeddedSpriteSheetData | ExternalSpriteSheetData | undefined
): data is EmbeddedSpriteSheetData {
  if (data === undefined) return false;
  return !!(data as EmbeddedSpriteSheetData)._isEmbeddedData;
}

export function isExternalSpriteSheetData(
  data: EmbeddedSpriteSheetData | ExternalSpriteSheetData | undefined
): data is ExternalSpriteSheetData {
  if (data === undefined) return false;
  return !!(data as ExternalSpriteSheetData)._isExternalData;
}
export class SpriteData {
  public name = "";
  public pixelSource?: EmbeddedSpriteSheetData | ExternalSpriteSheetData;
  public frames: FrameData[] = [];
  public layers: LayerData[] = [];
  public animations: AnimationData[] = [];
  public size = new SizeData();

  static fromProto(proto: Sprite) {
    const instance = new SpriteData();
    instance.name = proto.name;
    switch (proto.pixelSource.case) {
      case "embeddedInParentSheet":
        break;
      case "embeddedSheet":
        instance.pixelSource = EmbeddedSpriteSheetData.fromProto(
          proto.pixelSource.value
        );
        break;
      case "externalSheet":
        instance.pixelSource = ExternalSpriteSheetData.fromProto(
          proto.pixelSource.value
        );
        break;
      default:
        break;
    }
    instance.frames = proto.frames.map(FrameData.fromProto);
    instance.layers = proto.layers.map(LayerData.fromProto);
    instance.layers.forEach((layer, layerIndex) => layer.index = layerIndex);
    instance.animations = proto.animations.map(AnimationData.fromProto);
    instance.size = proto.size
      ? SizeData.fromProto(proto.size)
      : new SizeData();
    return instance;
  }

  toProto(protoIn?: Sprite) {
    const proto = protoIn ?? create(SpriteSchema);
    proto.name = this.name;
    if (isEmbeddedSpriteSheetData(this.pixelSource)) {
      proto.pixelSource.case = "embeddedSheet";
      proto.pixelSource.value = this.pixelSource.toProto();
    }
    if (isExternalSpriteSheetData(this.pixelSource)) {
      proto.pixelSource.case = "externalSheet";
      proto.pixelSource.value = this.pixelSource.toProto();
    }
    proto.frames = this.frames.map((frame) => frame.toProto());
    proto.layers = this.layers.map((layer) => layer.toProto());
    proto.animations = this.animations.map((animation) => animation.toProto());
    proto.size = this.size.toProto();
    return proto;
  }

  clone(deep = false) {
    const other = new SpriteData();
    other.name = this.name;
    other.pixelSource = this.pixelSource?.clone(deep);
    other.frames = this.frames.map((frame) => frame.clone());
    other.layers = this.layers.map((layer) => layer.clone());
    other.animations = this.animations.map((animation) => animation.clone());
    other.size = this.size.clone();
    return other;
  }
}

export class SpriteSheetData {
  public sprites: SpriteData[] = [];
  public pixelSource?: EmbeddedSpriteSheetData | ExternalSpriteSheetData;

  static fromProto(proto: SpriteSheet) {
    const instance = new SpriteSheetData();
    instance.sprites = proto.sprites.map((spriteProto) =>
      SpriteData.fromProto(spriteProto)
    );
    switch (proto.pixelSource.case) {
      case "embeddedSheet":
        instance.pixelSource = EmbeddedSpriteSheetData.fromProto(
          proto.pixelSource.value
        );
        break;
      case "externalSheet":
        instance.pixelSource = ExternalSpriteSheetData.fromProto(
          proto.pixelSource.value
        );
        break;
      default:
        break;
    }
    return instance;
  }

  toProto(protoIn?: SpriteSheet) {
    const proto = protoIn ?? create(SpriteSheetSchema);
    proto.sprites = this.sprites.map((sprite) => sprite.toProto());
    if (isEmbeddedSpriteSheetData(this.pixelSource)) {
      proto.pixelSource.case = "embeddedSheet";
      proto.pixelSource.value = this.pixelSource.toProto();
    }
    if (isExternalSpriteSheetData(this.pixelSource)) {
      proto.pixelSource.case = "externalSheet";
      proto.pixelSource.value = this.pixelSource.toProto();
    }
    return proto;
  }

  clone(deep = false) {
    const other = new SpriteSheetData();
    other.sprites = this.sprites.map((sprite) => sprite.clone(deep));
    other.pixelSource = this.pixelSource?.clone(deep);
    return other;
  }
}
