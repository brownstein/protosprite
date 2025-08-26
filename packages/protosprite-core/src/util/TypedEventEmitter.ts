import { EventEmitter } from "events";

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
