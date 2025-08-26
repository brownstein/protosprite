import {
  create,
  fromBinary,
  toBinary,
  toJson
} from "@bufbuild/protobuf";
import {
  AnimationSchema,
  BBox as BBoxProto,
  BBoxSchema,
  EmbeddedSpriteSheetSchema,
  EmbeddedSpriteSheet_Encoding,
  FrameSchema,
  Frame_FrameLayerSchema,
  LayerSchema,
  Sprite,
  SpriteSchema,
  SpriteSheet,
  SpriteSheetSchema
} from "proto_dist/sprite_pb";

export class BBox {
  public x = 0;
  public y = 0;
  public width = 0;
  public height = 0;

  copy(other: BBox) {
    this.x = other.x;
    this.y = other.y;
    this.width = other.width;
    this.height = other.height;
  }

  toProto(proto: BBoxProto) {
    proto.x = this.x;
    proto.y = this.y;
    proto.width = this.width;
    proto.height = this.height;
    return this;
  }

  fromProto(proto: BBoxProto) {
    this.x = proto.x;
    this.y = proto.y;
    this.width = proto.width;
    this.height = proto.height;
    return this;
  }
}

export class ProtoSpriteLayer {
  public index = 0;
  public name?: string;
  public parent?: ProtoSpriteLayer;
  public children: ProtoSpriteLayer[] = [];
  public opacity?: number;

  addChild(child: ProtoSpriteLayer) {
    child.parent = this;
    this.children.push(child);
  }
}

export class ProtoSpriteFrameLayer {
  public frame?: ProtoSpriteFrame;
  public layer?: ProtoSpriteLayer;
  public sheetBBox = new BBox();
  public spriteBBox = new BBox();
}

export class ProtoSpriteFrame {
  public index = -1;
  public indexedLayers = new Map<number, ProtoSpriteFrameLayer>();
  public duration = 100;
}

export class ProtoSpriteAnimation {
  public sprite?: ProtoSprite;
  public name = "";
  public startIndex = -1;
  public endIndex = -1;

  frameDuration() {
    return this.endIndex - this.startIndex + 1;
  }

  timeDuration() {
    if (this.sprite === undefined) return 0;
    let duration = 0;
    for (let i = this.startIndex; i <= this.endIndex; i++) {
      const frame = this.sprite.frames.get(i);
      if (frame === undefined) continue;
      duration += frame.duration;
    }
    return duration;
  }
}

export class ProtoSprite {
  public name = "";
  public frames = new Map<number, ProtoSpriteFrame>();
  public layers: ProtoSpriteLayer[] = [];
  public animations: ProtoSpriteAnimation[] = [];
  public sheet?: ProtoSpriteSheet;
  public pixelSource?: ProtoSpritePixelSource;

  appendFrame(frame: ProtoSpriteFrame) {
    if (frame.index === -1) frame.index = this.frames.size;
    this.frames.set(frame.index, frame);
  }

  appendLayer(layer: ProtoSpriteLayer) {
    layer.index = this.layers.length;
    this.layers.push(layer);
  }

  appendAnimation(animation: ProtoSpriteAnimation) {
    this.animations.push(animation);
    animation.sprite = this;
  }

  frame(frameNumber: number) {
    return this.frames.get(frameNumber);
  }

  layer(layerIndexOrName: number | string) {
    if (typeof layerIndexOrName === "number") {
      return this.layers.at(layerIndexOrName);
    }
    return this.layers.find((l) => l.name === layerIndexOrName);
  }

  animation(animationName: string) {
    return this.animations.find((a) => a.name === animationName);
  }

  toProtoWithoutSource() {
    const outSprite = create(SpriteSchema);
    outSprite.name = this.name;
    const layerToIndex = new WeakMap<ProtoSpriteLayer, number>();
    outSprite.layers = this.layers.map((layer, layerIndex) => {
      const outLayer = create(LayerSchema);
      outLayer.name = layer.name ?? "";
      outLayer.parentLayerName = layer.parent?.name ?? "";
      outLayer.opacity = layer.opacity ?? 1;
      outLayer.opacitySet = layer.opacity !== undefined;
      layerToIndex.set(layer, layerIndex);
      return outLayer;
    });
    for (const [frameIndex, frame] of this.frames) {
      const outFrame = create(FrameSchema);
      outFrame.frameIndex = frameIndex;
      outFrame.duration = frame.duration;
      for (const layerFrame of frame.indexedLayers.values()) {
        if (layerFrame.layer === undefined) continue;
        const layerIndex = layerToIndex.get(layerFrame.layer);
        if (layerIndex === undefined) continue;
        const outFrameLayer = create(Frame_FrameLayerSchema);
        outFrameLayer.layerIndex = layerIndex;
        outFrameLayer.sheetBbox = create(BBoxSchema);
        layerFrame.sheetBBox.toProto(outFrameLayer.sheetBbox);
        outFrameLayer.spriteBbox = create(BBoxSchema);
        layerFrame.spriteBBox.toProto(outFrameLayer.spriteBbox);
        outFrame.layers.push(outFrameLayer);
      }
      outSprite.frames.push(outFrame);
    }
    outSprite.animations = this.animations.map((animation) => {
      const outAnimation = create(AnimationSchema);
      outAnimation.name = animation.name;
      outAnimation.indexStart = animation.startIndex;
      outAnimation.indexEnd = animation.endIndex;
      return outAnimation;
    });

    return outSprite;
  }

  static fromProto(proto: Sprite) {
    const out = new ProtoSprite();
    out.name = proto.name;
    const indexToLayer = new Map<number, ProtoSpriteLayer>();
    const nameToLayer = new Map<string, ProtoSpriteLayer>();
    out.layers = proto.layers.map((protoLayer, layerIndex) => {
      const layer = new ProtoSpriteLayer();
      if (protoLayer.name !== "") {
        layer.name = protoLayer.name;
      }
      if (protoLayer.opacitySet) {
        layer.opacity = protoLayer.opacity;
      }
      indexToLayer.set(layerIndex, layer);
      if (layer.name !== undefined) {
        nameToLayer.set(layer.name, layer);
      }
      return layer;
    });
    proto.layers.forEach((protoLayer, layerIndex) => {
      if (protoLayer.parentLayerName !== "") {
        const layer = indexToLayer.get(layerIndex);
        const parentLayer = nameToLayer.get(protoLayer.parentLayerName);
        if (layer !== undefined && parentLayer !== undefined) {
          parentLayer.addChild(layer);
        }
      }
    });
    proto.frames.forEach((protoFrame, frameIndex) => {
      const frame = new ProtoSpriteFrame();
      frame.index = frameIndex;
      for (const protoFrameLayer of protoFrame.layers) {
        const layer = indexToLayer.get(protoFrameLayer.layerIndex);
        if (layer === undefined) continue;
        const frameLayer = new ProtoSpriteFrameLayer();
        frameLayer.frame = frame;
        if (protoFrameLayer.sheetBbox) {
          frameLayer.sheetBBox.fromProto(protoFrameLayer.sheetBbox);
        }
        if (protoFrameLayer.spriteBbox) {
          frameLayer.spriteBBox.fromProto(protoFrameLayer.spriteBbox);
        }
        frame.indexedLayers.set(protoFrameLayer.layerIndex, frameLayer);
      }
      frame.duration = protoFrame.duration;
      out.frames.set(frameIndex, frame);
    });

    return out;
  }

  attachSourcePixelsToProto(sprite: Sprite) {
    if (this.pixelSource?.inParentSheet) return sprite;
    if (this.pixelSource?.pngBytes !== undefined) {
      sprite.pixelSource.case = "embeddedSheet";
      sprite.pixelSource.value = create(EmbeddedSpriteSheetSchema);
      sprite.pixelSource.value.data = this.pixelSource.pngBytes;
      sprite.pixelSource.value.encoding = EmbeddedSpriteSheet_Encoding.PNG;
    }
    return sprite;
  }

  toJsonObject() {
    return toJson(SpriteSchema, this.toProtoWithoutSource());
  }

  toBinary() {
    const result = this.toProtoWithoutSource();
    this.attachSourcePixelsToProto(result);
    return toBinary(SpriteSchema, result);
  }
}

export class ProtoSpritePixelSource {
  public inParentSheet = false;
  public rawBlob?: Blob;
  public pngBlob?: Blob;
  public pngBytes?: Uint8Array;
  public url?: string;
  public fileName?: string;
}

export class ProtoSpriteSheet {
  public sprites: ProtoSprite[] = [];
  public pixelSource?: ProtoSpritePixelSource;

  appendSprite(sprite: ProtoSprite) {
    sprite.sheet = this;
    this.sprites.push(sprite);
  }

  sprite(indexOrName: number | string) {
    if (typeof indexOrName === "number") {
      return this.sprites.at(indexOrName);
    }
    return this.sprites.find((s) => s.name === indexOrName);
  }

  toBinary() {
    const result = create(SpriteSheetSchema);
    result.sprites = this.sprites.map((s) => s.toProtoWithoutSource());
    this.attachSourcePixelsToProto(result);
    return toBinary(SpriteSheetSchema, result);
  }

  attachSourcePixelsToProto(spriteSheet: SpriteSheet) {
    if (this.pixelSource?.inParentSheet) return;
    if (this.pixelSource?.pngBytes !== undefined) {
      spriteSheet.pixelSource.case = "embeddedSheet";
      spriteSheet.pixelSource.value = create(EmbeddedSpriteSheetSchema);
      spriteSheet.pixelSource.value.data = this.pixelSource.pngBytes;
      spriteSheet.pixelSource.value.encoding = EmbeddedSpriteSheet_Encoding.PNG;
    }
    let spriteIndex = 0;
    for (const sprite of this.sprites) {
      const spriteResult = spriteSheet.sprites.at(spriteIndex++);
      if (spriteResult === undefined) break;
      sprite.attachSourcePixelsToProto(spriteResult);
    }
    return spriteSheet;
  }

  static fromBuffer(buff: Buffer<ArrayBuffer>) {
    const uint8Array = new Uint8Array(buff);
    const decoded = fromBinary(SpriteSheetSchema, uint8Array);
    const result = new ProtoSpriteSheet();
    for (const decodedSprite of decoded.sprites) {
      const sprite = ProtoSprite.fromProto(decodedSprite);
      result.appendSprite(sprite);
    }
    switch (decoded.pixelSource.case) {
      case "embeddedSheet": {
        switch (decoded.pixelSource.value.encoding) {
          case EmbeddedSpriteSheet_Encoding.PNG:
            result.pixelSource = new ProtoSpritePixelSource();
            result.pixelSource.pngBytes = decoded.pixelSource.value.data;
            break;
          default:
            break;
        }
      }
      default:
        break;
    }
    return result;
  }
}

export class ProtoSpriteInstance {
  public data: ProtoSprite;
  public currentFrame = 0;
  public currentFrameDurationRemaining = 0;
  public currentAnimation?: ProtoSpriteAnimation;
  constructor(sprite: ProtoSprite) {
    this.data = sprite;
  }
}
