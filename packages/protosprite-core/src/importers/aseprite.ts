import * as Aseprite from "@kayahr/aseprite";

import {
  ProtoSprite,
  ProtoSpriteAnimation,
  ProtoSpriteFrame,
  ProtoSpriteFrameLayer,
  ProtoSpriteLayer,
  ProtoSpritePixelSource
} from "../core/index.js";

export class FrameNameUnknownError extends Error {
  constructor() {
    super(
      "Unknown frame name format: specifiied frameNameFormat option unavailable and unable to guess."
    );
  }
}

export class InvalidFrameNameError extends Error {
  constructor() {
    super("Invalid frame name: failed to patch parts.");
  }
}

type ExpectMatch = {
  title?: boolean;
  tag?: boolean;
  layer?: boolean;
  frame?: boolean;
  extension?: boolean;
};

type Matcher = (frameName: string) => {
  title?: string;
  tag?: string;
  layer?: string;
  frame?: number;
  extension?: string;
};

export function importAsepriteSheetExport(
  sourceSheet: Aseprite.SpriteSheet,
  opt?: {
    referenceType?: "file" | "url";
    frameNameFormat?: string;
    assetPath?: string;
    debug?: boolean;
  }
) {
  const sprite = new ProtoSprite();

  let frameNameFormat = opt?.frameNameFormat;
  let nameFormatHasExtension = false;
  let nameFormatHasFrame = false;
  let nameFormatHasTag = false;
  let nameFormatHasLayer = false;
  let nameFormatHasTitle = false;

  const firstFrameName = Array.isArray(sourceSheet.frames)
    ? sourceSheet.frames.at(0)?.filename
    : Object.keys(sourceSheet.frames).at(0);
  if (firstFrameName === undefined) throw new FrameNameUnknownError();

  // No frame name format? Time to play guess the export string!
  if (frameNameFormat === undefined) {
    const firstFrameNameParts = [
      ...firstFrameName.matchAll(/((?<part>[^\s\.]+)\s?)/g)
    ]
      .map((g) => g.groups?.part)
      .filter((part) => part !== undefined && part !== "");
    if (
      firstFrameNameParts.at(-1) === "ase" ||
      firstFrameNameParts.at(-1) === "aseprite"
    ) {
      nameFormatHasExtension = true;
      firstFrameNameParts.pop();
    }
    if (
      Number.isSafeInteger(Number.parseInt(firstFrameNameParts.at(-1) ?? "0"))
    ) {
      nameFormatHasFrame = true;
      firstFrameNameParts.pop();
    }
    if (firstFrameNameParts.at(-1)?.startsWith("(")) {
      nameFormatHasLayer = true;
      firstFrameNameParts.pop();
    }
    if (firstFrameNameParts.at(-1)?.startsWith("#")) {
      nameFormatHasTag = true;
      firstFrameNameParts.pop();
    }
    if (firstFrameNameParts.length > 0) {
      nameFormatHasTitle = true;
    }
    frameNameFormat = [
      nameFormatHasTitle ? "{title}" : "",
      nameFormatHasLayer ? "({layer})" : "",
      nameFormatHasTag ? "#{tag}" : "",
      nameFormatHasFrame ? "{frame}" : ""
    ].join(" ");
    if (nameFormatHasExtension)
      frameNameFormat = `${frameNameFormat.trim()}.{extension}`;
  }
  if (frameNameFormat === undefined) throw new FrameNameUnknownError();

  // Ok, time to PARSE the frame name format.
  const orderedFrameNameParts = [
    ...frameNameFormat.matchAll(/((\{(?<part>[^\}]+)\}))+/g)
  ]
    .map((g) =>
      Object.entries(g.groups ?? {})
        .at(0)
        ?.at(1)
    )
    .filter((v) => v !== undefined) as string[];
  const matchParts: string[] = [];
  const expectMatch: ExpectMatch = {};
  let isFirstPart = true;
  for (const part of orderedFrameNameParts) {
    if (!isFirstPart && part !== "extension") matchParts.push("\\s");
    switch (part) {
      case "title":
        expectMatch.title = true;
        matchParts.push("(?<title>.+)");
        break;
      case "tag":
        expectMatch.tag = true;
        matchParts.push("(#(?<tag>.+))");
        break;
      case "layer":
        expectMatch.layer = true;
        matchParts.push("(\\((?<layer>.+)\\))");
        break;
      case "frame":
        expectMatch.frame = true;
        matchParts.push("(?<frame>\\d+)");
        break;
      case "extension":
        expectMatch.extension = true;
        matchParts.push("(\\.(?<extension>.+))");
        break;
      default:
        break;
    }
    isFirstPart = false;
  }

  if (opt?.debug) {
    console.log("Matching on parts:", matchParts.join(""));
  }

  // With all that out of the way, we can finally infer the sprite's name if it exists.
  const frameNameMatcherRegex = new RegExp(matchParts.join(""));
  const matcher: Matcher = (frameName: string) => {
    const groups = frameName.match(frameNameMatcherRegex)?.groups;
    if (groups === undefined) throw new InvalidFrameNameError();
    let frame: number | undefined;
    if (expectMatch.frame) {
      const frameNo = Number.parseInt(groups.frame ?? "");
      if (Number.isSafeInteger(frameNo)) frame = frameNo;
    }
    return {
      title: groups.title,
      tag: groups.tag,
      layer: groups.layer,
      frame,
      extension: groups.extension
    };
  };

  const firstMatch = matcher(firstFrameName);
  if (expectMatch.title && firstMatch.title !== undefined) {
    sprite.name = firstMatch.title;
  }

  const pixelSource = new ProtoSpritePixelSource();
  const isFile = opt?.referenceType === "file";
  if (isFile) {
    pixelSource.fileName = `${opt?.assetPath ?? ""}${sourceSheet.meta.image}`;
  } else {
    pixelSource.url = `${opt?.assetPath ?? ""}${sourceSheet.meta.image}`;
  }

  sprite.pixelSource = pixelSource;
  if (opt?.debug) console.log("pixel source:", sprite.pixelSource);

  const hasLayers = sourceSheet.meta.layers !== undefined;
  const hasTags = sourceSheet.meta.frameTags !== undefined;

  // Build layers.
  const layersByName = new Map<string, ProtoSpriteLayer>();
  let getLayer: (layerName: string) => ProtoSpriteLayer | undefined;
  if (hasLayers) {
    let layerIndex = 0;
    // Generate layers.
    for (const sourceLayer of sourceSheet.meta.layers ?? []) {
      const layer = new ProtoSpriteLayer();
      layer.name = sourceLayer.name;
      layer.opacity = sourceLayer.opacity ?? layer.opacity;
      layer.index = layerIndex++;
      layersByName.set(sourceLayer.name, layer);
      sprite.appendLayer(layer);
    }
    // Assign parents.
    for (const sourceLayer of sourceSheet.meta.layers ?? []) {
      const layer = layersByName.get(sourceLayer.name);
      if (
        layer === undefined ||
        sourceLayer.group === undefined ||
        sourceLayer.group === ""
      )
        continue;
      const parent = layersByName.get(sourceLayer.group);
      if (parent !== undefined) parent.addChild(layer);
    }
    // Assign layer getter.
    getLayer = (layerName: string) => layersByName.get(layerName);
  } else if (expectMatch.layer) {
    let layerIndex = 0;
    getLayer = (layerName: string) => {
      const extant = layersByName.get(layerName);
      if (extant !== undefined) return extant;
      const newLayer = new ProtoSpriteLayer();
      newLayer.name = layerName;
      newLayer.index = layerIndex++;
      sprite.appendLayer(newLayer);
      return newLayer;
    };
  } else {
    const defaultLayer = new ProtoSpriteLayer();
    defaultLayer.name = "default";
    sprite.appendLayer(defaultLayer);
    getLayer = () => defaultLayer;
  }

  // Build frames.
  const getFrame = (frameNumber: number) => {
    const extant = sprite.frames.get(frameNumber);
    if (extant !== undefined) return extant;
    const frame = new ProtoSpriteFrame();
    frame.index = frameNumber;
    sprite.appendFrame(frame);
    return frame;
  };
  if (Array.isArray(sourceSheet.frames)) {
    let autoFrameIndex = 0;
    for (const sourceFrame of sourceSheet.frames) {
      const frameKey = sourceFrame.filename;
      const frameMatch = matcher(frameKey);
      const frameNo = frameMatch.frame ?? autoFrameIndex++;
      const frame = getFrame(frameNo);
      frame.duration = sourceFrame.duration;
      const frameLayerName = frameMatch.layer ?? "default";
      const layer = getLayer(frameLayerName);
      const frameLayer = new ProtoSpriteFrameLayer();
      frameLayer.frame = frame;
      frameLayer.layer = layer;
      frameLayer.sheetBBox.x = sourceFrame.frame.x;
      frameLayer.sheetBBox.y = sourceFrame.frame.y;
      frameLayer.sheetBBox.width = sourceFrame.frame.w;
      frameLayer.sheetBBox.height = sourceFrame.frame.h;
      frameLayer.spriteBBox.x = sourceFrame.spriteSourceSize.x;
      frameLayer.spriteBBox.y = sourceFrame.spriteSourceSize.y;
      frameLayer.spriteBBox.width = sourceFrame.spriteSourceSize.w;
      frameLayer.spriteBBox.height = sourceFrame.spriteSourceSize.h;
      frame.indexedLayers.set(frameLayer.layer?.index ?? 0, frameLayer);
    }
  } else {
    let autoFrameIndex = 0;
    for (const [frameKey, sourceFrame] of Object.entries(sourceSheet.frames)) {
      const frameMatch = matcher(frameKey);
      const frameNo = frameMatch.frame ?? autoFrameIndex++;
      const frame = getFrame(frameNo);
      frame.duration = sourceFrame.duration;
      const frameLayerName = frameMatch.layer ?? "default";
      const layer = getLayer(frameLayerName);
      const frameLayer = new ProtoSpriteFrameLayer();
      frameLayer.frame = frame;
      frameLayer.layer = layer;
      frameLayer.sheetBBox.x = sourceFrame.frame.x;
      frameLayer.sheetBBox.y = sourceFrame.frame.y;
      frameLayer.sheetBBox.width = sourceFrame.frame.w;
      frameLayer.sheetBBox.height = sourceFrame.frame.h;
      frameLayer.spriteBBox.x = sourceFrame.spriteSourceSize.x;
      frameLayer.spriteBBox.y = sourceFrame.spriteSourceSize.y;
      frameLayer.spriteBBox.width = sourceFrame.spriteSourceSize.w;
      frameLayer.spriteBBox.height = sourceFrame.spriteSourceSize.h;
      frame.indexedLayers.set(frameLayer.layer?.index ?? 0, frameLayer);
    }
  }

  if (opt?.debug) {
    for (const [frameIndex, frame] of sprite.frames) {
      console.log(
        "Found frame:",
        frameIndex,
        "with",
        frame.indexedLayers.size,
        "layers"
      );
    }
  }

  sprite.sortedFrameNumbers = [...sprite.frames.keys()];
  sprite.sortedFrameNumbers.sort();

  // Build animations.
  if (hasTags) {
    for (const sourceTag of sourceSheet.meta.frameTags ?? []) {
      const animation = new ProtoSpriteAnimation();
      animation.name = sourceTag.name;
      animation.startIndex = sourceTag.from;
      animation.endIndex = sourceTag.to;
      sprite.appendAnimation(animation);
    }
  }

  // Find the center of the sprite.
  const firstFrame = Array.isArray(sourceSheet.frames)
    ? sourceSheet.frames.at(0)
    : Object.values(sourceSheet.frames).at(0);
  if (firstFrame !== undefined) {
    const firstFrameSize = firstFrame.sourceSize;
    sprite.center.x = Math.round(firstFrameSize.w * 0.5);
    sprite.center.y = Math.round(firstFrameSize.h * 0.5);
  }

  return sprite;
}
