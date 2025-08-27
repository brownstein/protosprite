import { create, fromBinary, toBinary, toJson } from "@bufbuild/protobuf";
import {
  AnimationSchema,
  BBox as BBoxProto,
  BBoxSchema,
  EmbeddedSpriteSheetSchema,
  EmbeddedSpriteSheet_Encoding,
  FrameSchema,
  Frame_FrameLayerSchema,
  LayerSchema,
  PositionSchema,
  Sprite,
  SpriteSchema,
  SpriteSheet,
  SpriteSheetSchema
} from "proto_dist/sprite_pb";

import {
  TypedEventEmitter,
  createTypedEventEmitter
} from "src/util/TypedEventEmitter";

export { TypedEventEmitter };

export class BBox {
  public x = 0;
  public y = 0;
  public width = 0;
  public height = 0;

  clone() {
    const other = new BBox();
    other.x = this.x;
    other.y = this.y;
    other.width = this.width;
    other.height = this.height;
    return other;
  }

  copy(other: BBox) {
    this.x = other.x;
    this.y = other.y;
    this.width = other.width;
    this.height = other.height;
    return this;
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

export class Vector {
  public x = 0;
  public y = 0;

  clone() {
    const other = new Vector();
    other.x = this.x;
    other.y = this.y;
    return other;
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

  clone() {
    const other = new ProtoSpriteLayer();
    other.index = this.index;
    other.name = this.name;
    other.parent = this.parent;
    other.children = this.children;
    other.opacity = this.opacity;
    return other;
  }
}

export class ProtoSpriteFrameLayer {
  public frame?: ProtoSpriteFrame;
  public layer?: ProtoSpriteLayer;
  public sheetBBox = new BBox();
  public spriteBBox = new BBox();

  clone() {
    const other = new ProtoSpriteFrameLayer();
    other.frame = this.frame;
    other.layer = this.layer;
    other.sheetBBox = this.sheetBBox.clone();
    other.spriteBBox = this.spriteBBox.clone();
    return other;
  }
}

export class ProtoSpriteFrame {
  public index = -1;
  public indexedLayers = new Map<number, ProtoSpriteFrameLayer>();
  public duration = 100;

  clone() {
    const other = new ProtoSpriteFrame();
    other.index = this.index;
    other.indexedLayers = this.indexedLayers;
    other.duration = this.duration;
    return other;
  }
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

  clone() {
    const other = new ProtoSpriteAnimation();
    other.name = this.name;
    other.startIndex = this.startIndex;
    other.endIndex = this.endIndex;
    return other;
  }
}

export class ProtoSprite {
  public name = "";
  public frames = new Map<number, ProtoSpriteFrame>();
  public sortedFrameNumbers: number[] = [];
  public layers: ProtoSpriteLayer[] = [];
  public animations: ProtoSpriteAnimation[] = [];
  public sheet?: ProtoSpriteSheet;
  public pixelSource?: ProtoSpritePixelSource;
  public center = new Vector();

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

    outSprite.center = create(PositionSchema);
    outSprite.center.x = this.center.x;
    outSprite.center.y = this.center.y;

    return outSprite;
  }

  static fromProto(proto: Sprite) {
    const out = new ProtoSprite();
    out.name = proto.name;
    out.center.x = proto.center?.x ?? 0;
    out.center.y = proto.center?.y ?? 0;
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
    out.sortedFrameNumbers = [...out.frames.keys()];
    out.sortedFrameNumbers.sort();
    proto.animations.forEach((protoAnimation, animationIndex) => {
      const animation = new ProtoSpriteAnimation();
      animation.name = protoAnimation.name;
      animation.startIndex = protoAnimation.indexStart;
      animation.endIndex = protoAnimation.indexEnd;
      out.appendAnimation(animation);
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

  clone() {
    const other = new ProtoSprite();
    other.name = this.name;
    other.layers = this.layers;
    other.frames = this.frames;
    other.layers = this.layers.map((layer) => {
      const otherLayer = layer.clone();
      otherLayer.children = [];
      return otherLayer;
    });
    for (const otherLayer of other.layers) {
      if (otherLayer.parent === undefined) continue;
      const parentIndex = otherLayer.parent.index;
      const otherParentLayer = other.layers.find(l => l.index === parentIndex);
      if (otherParentLayer === undefined) continue;
      otherLayer.parent = otherParentLayer;
      otherParentLayer.children.push(otherLayer);
    }
    other.frames = new Map(
      [...this.frames.entries()].map(([frameIndex, frame]) => {
        const otherFrame = frame.clone();
        otherFrame.indexedLayers = new Map(
          [...otherFrame.indexedLayers.entries()].map(
            ([layerFrameIndex, layerFrame]) => {
              const otherLayerFrame = layerFrame.clone();
              otherLayerFrame.layer = other.layers.at(layerFrameIndex);
              otherLayerFrame.frame = otherFrame;
              return [layerFrameIndex, otherLayerFrame];
            }
          )
        );
        return [frameIndex, otherFrame];
      })
    );
    other.sortedFrameNumbers = [...this.sortedFrameNumbers];
    other.animations = this.animations.map((animation) => animation.clone());
    other.sheet = this.sheet;
    other.center = this.center.clone();
    other.pixelSource = this.pixelSource?.clone();
    return other;
  }

  createInstance() {
    return new ProtoSpriteInstance(this);
  }
}

export class ProtoSpritePixelSource {
  public inParentSheet = false;
  public pngBytes?: Uint8Array;
  public url?: string;
  public fileName?: string;

  clone() {
    const other = new ProtoSpritePixelSource();
    other.inParentSheet = this.inParentSheet;
    other.pngBytes = this.pngBytes;
    other.url = this.url;
    other.fileName = this.fileName;
    return other;
  }
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

  clone() {
    const other = new ProtoSpriteSheet();
    other.sprites = this.sprites.map((sprite) => {
      const otherSprite = sprite.clone();
      otherSprite.sheet = other;
      return otherSprite;
    });
    other.pixelSource = other.pixelSource?.clone();
    return other;
  }
}

export class ProtoSpriteInstance {
  public data: ProtoSprite;
  public currentFrame = 0;
  public currentFrameDurationRemaining = 0;
  public currentAnimation?: ProtoSpriteAnimation;
  public currentAnimationSpeed = 1;
  public currentAnimationLoops = true;
  public events = createTypedEventEmitter<{
    frameChanged: number;
    animationLoopCompleted: void;
  }>();
  private currentFrameIndex = 0;
  constructor(sprite: ProtoSprite) {
    this.data = sprite;

    // Select earliest populated frame.
    this.currentFrame = this.data.sortedFrameNumbers.at(0) ?? 0;
    const frame = this.data.frames.get(this.currentFrame);
    if (frame !== undefined) {
      this.currentFrameDurationRemaining = frame.duration;
    }
  }

  forEachLayerOfCurrentFrame(
    callback: (layerFrame: ProtoSpriteFrameLayer) => void
  ) {
    const frameCurrent = this.data.frames.get(this.currentFrame);
    if (frameCurrent === undefined) return;
    for (const layer of this.data.layers) {
      const layerFrame = frameCurrent.indexedLayers.get(layer.index);
      if (layerFrame !== undefined) callback(layerFrame);
    }
  }

  advanceByDuration(advanceDuration: number): boolean {
    this.currentFrameDurationRemaining -= Math.abs(
      advanceDuration * this.currentAnimationSpeed
    );
    const frameSwapped = this.currentFrameDurationRemaining <= 0;
    let animationLooped = false;
    let framesDone: number[] = [];
    while (this.currentFrameDurationRemaining <= 0) {
      framesDone.push(this.currentFrame);
      if (this.currentAnimationSpeed < 0) {
        this.currentFrameDurationRemaining -=
          advanceDuration * this.currentAnimationSpeed;
        this.currentFrameIndex--;
        if (this.currentFrameIndex < 0) {
          this.currentFrameIndex = this.data.sortedFrameNumbers.length - 1;
          this.currentFrame =
            this.data.sortedFrameNumbers[this.currentFrameIndex];
          animationLooped = true;
        }
        if (
          this.currentAnimation !== undefined &&
          this.currentFrame < this.currentAnimation.startIndex
        ) {
          this.currentFrame = this.currentAnimation.endIndex;
          this.currentFrameIndex = this.data.sortedFrameNumbers.indexOf(
            this.currentFrame
          );
          animationLooped = true;
        }
      } else {
        this.currentFrameDurationRemaining +=
          advanceDuration * this.currentAnimationSpeed;
        this.currentFrameIndex++;
        if (this.currentFrameIndex >= this.data.sortedFrameNumbers.length) {
          this.currentFrameIndex = 0;
          this.currentFrame =
            this.data.sortedFrameNumbers[this.currentFrameIndex];
          animationLooped = true;
        }
        if (
          this.currentAnimation !== undefined &&
          this.currentFrame > this.currentAnimation.endIndex
        ) {
          this.currentFrame = this.currentAnimation.startIndex;
          this.currentFrameIndex = this.data.sortedFrameNumbers.indexOf(
            this.currentFrame
          );
          animationLooped = true;
        }
      }
    }
    for (const frameNo of framesDone) {
      this.events.emit("frameChanged", frameNo);
    }
    if (animationLooped) {
      this.events.emit("animationLoopCompleted");
    }
    return frameSwapped;
  }
}
