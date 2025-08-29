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
    this.animationMap.clear();

    for (const frame of this.data.frames) {
      this.frameMap.set(frame.index, frame);
    }
    for (const layer of this.data.layers) {
      this.layerMap.set(layer.index, layer);
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
  FrameSwapped: [number, number]
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
      const firstFrame = dataMap.data.frames.at(0);
      if (firstFrame === undefined) throw new Error("No frames available.");
    }
  }
}
