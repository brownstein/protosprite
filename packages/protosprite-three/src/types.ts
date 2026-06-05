export type StringFallback<T extends string | void> = T extends void
  ? string
  : T;

export type ProtoSpriteThreeEventTypes<
  TAnimations extends string | void = string
> = {
  animationFrameSwapped: {
    animation: StringFallback<TAnimations> | null;
    from: number;
    to: number;
  };
  animationTagStarted: {
    animation: StringFallback<TAnimations>;
  };
  animationLooped: {
    animation: StringFallback<TAnimations> | null;
  };
};

export type SafeString<T extends string | void> = T extends void ? never : T;
export type SafeStringIterable<T extends string | void> = Iterable<T & string>;
