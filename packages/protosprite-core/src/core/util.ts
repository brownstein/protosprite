import { EventEmitter } from "events";

import { AnimationData, FrameData, LayerData, SpriteData } from "./data.js";

export type EmitterEventsMap = Record<string | symbol, unknown>;

export type TypedEventEmitter<T extends EmitterEventsMap> = Omit<
  EventEmitter,
  "emit" | "on" | "once" | "off"
> & {
  emit: <EventName extends keyof T>(
    eventName: EventName,
    ...args: T[EventName] extends void ? [] : [T[EventName]]
  ) => void;
  on: <EventName extends keyof T>(
    eventName: EventName,
    handler: (arg: T[EventName]) => unknown
  ) => void;
  once: <EventName extends keyof T>(
    eventName: EventName,
    handler: (arg: T[EventName]) => unknown
  ) => void;
  off: <EventName extends keyof T>(
    eventName: EventName,
    handler: (arg: T[EventName]) => unknown
  ) => void;
};

export function createTypedEventEmitter<EventMap extends EmitterEventsMap>() {
  return new EventEmitter() as TypedEventEmitter<EventMap>;
}

export class ProtoSpriteDataMap {
  public data: SpriteData;
  public frameMap = new Map<number, FrameData>();
  public layerMap = new Map<number, LayerData>();
  public layerNameMap = new Map<string, LayerData>();
  public animationMap = new Map<string, AnimationData>();

  public layerGroupSet = new Set<number>();
  public layerGroupsDown = new Map<number, LayerData[]>();
  public layerGroupsUp = new Map<number, LayerData>();

  constructor(data?: SpriteData) {
    if (data !== undefined) {
      this.data = data;
      this.remap();
    } else {
      this.data = new SpriteData();
    }
  }
  remap() {
    this.frameMap.clear();
    this.layerMap.clear();
    this.layerNameMap.clear();
    this.animationMap.clear();

    for (const frame of this.data.frames) {
      this.frameMap.set(frame.index, frame);
    }
    for (const layer of this.data.layers) {
      this.layerMap.set(layer.index, layer);
      this.layerNameMap.set(layer.name, layer);
    }
    for (const animation of this.data.animations) {
      this.animationMap.set(animation.name, animation);
    }

    this.layerGroupSet.clear();
    this.layerGroupsDown.clear();
    this.layerGroupsUp.clear();

    for (const layer of this.data.layers) {
      if (layer.isGroup) this.layerGroupSet.add(layer.index);
      if (layer.parentIndex) {
        const parentLayer = this.layerMap.get(layer.parentIndex);
        if (parentLayer !== undefined) {
          let downGroup = this.layerGroupsDown.get(parentLayer.index);
          if (downGroup === undefined) {
            downGroup = [];
            this.layerGroupsDown.set(parentLayer.index, downGroup);
          }
          downGroup.push(layer);
          this.layerGroupsUp.set(layer.index, parentLayer);
        }
      }
    }
  }
}

export type ProtoSpriteAnimationEventTypes = {
  FrameSwapped: {
    from: number,
    to: number
  };
  LoopComplete: void,
};

export class ProtoSpriteInstanceAnimationState {
  public events = createTypedEventEmitter<ProtoSpriteAnimationEventTypes>();
  public currentFrame = 0;
  public currentFrameDurationRemaining = 0;
  public currentAnimation?: AnimationData;
  public speed = 1;
  public loop = true;

  private dataMap: ProtoSpriteDataMap;

  constructor(dataMap: ProtoSpriteDataMap) {
    this.dataMap = dataMap;
    if (dataMap.data.frames.length > 0) {
      const firstFrame = dataMap.data.frames.at(this.currentFrame);
      if (firstFrame === undefined) throw new Error("No frames available.");
      this.currentFrameDurationRemaining = firstFrame.duration;
    }
  }

  startAnimation(animationName: string | null) {
    let changedAnimation = false;
    let nextAnimation: AnimationData | undefined;
    if (animationName !== null) {
      const animation = this.dataMap.animationMap.get(animationName);
      if (animation !== undefined && animation !== this.currentAnimation) {
        nextAnimation = animation;
      } 
    }
    changedAnimation = nextAnimation !== this.currentAnimation;
    this.currentAnimation = nextAnimation;
    if (changedAnimation) {
      if (this.currentAnimation) {
        if (this.speed >= 0) {
          this.currentFrame = this.currentAnimation.indexStart;
        } else {
          this.currentFrame = this.currentAnimation.indexEnd;
        }
        const frame = this.dataMap.frameMap.get(this.currentFrame);
        this.currentFrameDurationRemaining = frame?.duration ?? 100;
      }
    }
    return changedAnimation;
  }

  advance(duration: number) {
    if (this.speed === 0) return false;
    this.currentFrameDurationRemaining -= duration * Math.abs(this.speed);
    let changedFrame = false;
    while (this.currentFrameDurationRemaining <= 0) {
      changedFrame = true;
      if (this.speed > 0) {
        this.currentFrame++;
        if (this.currentAnimation) {
          if (this.currentFrame > this.currentAnimation.indexEnd) {
            this.currentFrame = this.currentAnimation.indexStart;
          }
        } else {
          if (this.currentFrame >= this.dataMap.frameMap.size) {
            this.currentFrame = 0;
          }
        }
      } else {
        this.currentFrame--;
        if (this.currentAnimation) {
          if (this.currentFrame < this.currentAnimation.indexStart) {
            this.currentFrame = this.currentAnimation.indexEnd;
          }
        } else {
          if (this.currentFrame <= 0) {
            this.currentFrame = this.dataMap.frameMap.size - 1;
          }
        }
      }

      const frame = this.dataMap.frameMap.get(this.currentFrame);
      if (frame === undefined) throw new Error(`Unable to find frame ${this.currentFrame}`);
      this.currentFrameDurationRemaining += frame.duration;
    }

    return changedFrame;
  }
}
