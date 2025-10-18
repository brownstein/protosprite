import * as Aseprite from "@kayahr/aseprite";

import {
  AnimationData,
  EmbeddedSpriteSheetData,
  ExternalSpriteSheetData,
  FrameData,
  FrameLayerData,
  LayerData,
  SizeData,
  SpriteData
} from "../core/data.js";

// Aseprite supports cels pending merge of https://github.com/kayahr/aseprite/pull/22.
type AsepriteLayerWithCels = Aseprite.Layer & {
  cels?: {
    frame: number;
    zIndex: number;
  }[];
};

export class FrameNameUnknownError extends Error {
  constructor() {
    super(
      "Unknown frame name format: specifiied frameNameFormat option unavailable and unable to guess."
    );
  }
}

export class InvalidFrameNameError extends Error {
  constructor() {
    super("Invalid frame name: failed to match parts.");
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
    pngArray?: Uint8Array;
    debug?: boolean;
  }
) {
  const sprite = new SpriteData();

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

  if (opt?.pngArray !== undefined) {
    const pixelSource = new EmbeddedSpriteSheetData();
    pixelSource.pngData = opt.pngArray;
    sprite.pixelSource = pixelSource;
  } else {
    const pixelSource = new ExternalSpriteSheetData();
    const isFile = opt?.referenceType === "file";
    if (isFile) {
      pixelSource.fileName = `${opt?.assetPath ?? ""}${sourceSheet.meta.image}`;
    } else {
      pixelSource.url = `${opt?.assetPath ?? ""}${sourceSheet.meta.image}`;
    }
    sprite.pixelSource = pixelSource;
  }

  const hasLayers = sourceSheet.meta.layers !== undefined;
  const hasTags = sourceSheet.meta.frameTags !== undefined;

  // Build layers.
  const layersByName = new Map<string, LayerData>();
  const celsByLayer = new Map<
    string,
    Map<number, NonNullable<AsepriteLayerWithCels["cels"]>[number]>
  >();
  let getLayer: (layerName: string) => LayerData;
  if (hasLayers) {
    let layerIndex = 0;
    // Generate layers.
    for (const sourceLayer of sourceSheet.meta.layers ?? []) {
      const layer = new LayerData();
      layer.name = sourceLayer.name;
      layer.opacity = sourceLayer.opacity ?? layer.opacity;
      layer.index = layerIndex++;
      layersByName.set(sourceLayer.name, layer);
      sprite.layers.push(layer);
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
      if (parent !== undefined) {
        layer.parentIndex = parent.index;
        parent.isGroup = true;
      }
      const asLayerWithCells = sourceLayer as AsepriteLayerWithCels;
      if (asLayerWithCells.cels !== undefined) {
        for (const cel of asLayerWithCells.cels) {
          if (!celsByLayer.has(sourceLayer.name))
            celsByLayer.set(sourceLayer.name, new Map());
          celsByLayer.get(sourceLayer.name)?.set(cel.frame, cel);
        }
      }
    }
    // Assign layer getter.
    getLayer = (layerName: string) => {
      const layer = layersByName.get(layerName);
      if (!layer) throw new Error("Layer not found.");
      return layer;
    };
  } else if (expectMatch.layer) {
    let layerIndex = 0;
    getLayer = (layerName: string) => {
      const extant = layersByName.get(layerName);
      if (extant !== undefined) return extant;
      const newLayer = new LayerData();
      newLayer.name = layerName;
      newLayer.index = layerIndex++;
      layersByName.set(newLayer.name, newLayer);
      sprite.layers.push(newLayer);
      return newLayer;
    };
  } else {
    const defaultLayer = new LayerData();
    defaultLayer.name = "default";
    defaultLayer.index = 0;
    layersByName.set(defaultLayer.name, defaultLayer);
    sprite.layers.push(defaultLayer);
    getLayer = () => defaultLayer;
  }

  // Build frames.
  const framesByIndex = new Map<number, FrameData>();
  let maxFrameIndex = 0;
  const getFrame = (frameIndex: number) => {
    const extant = framesByIndex.get(frameIndex);
    if (extant !== undefined) return extant;
    const frame = new FrameData();
    frame.index = frameIndex;
    maxFrameIndex = Math.max(frameIndex, frame.index);
    framesByIndex.set(frameIndex, frame);
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
      const frameLayerName =
        frameMatch.layer ?? layersByName.keys().next().value ?? "default";
      const layer = getLayer(frameLayerName);
      const frameLayer = new FrameLayerData();
      frameLayer.layerIndex = layer.index;
      frameLayer.size.width = sourceFrame.frame.w;
      frameLayer.size.height = sourceFrame.frame.h;
      frameLayer.sheetPosition.x = sourceFrame.frame.x;
      frameLayer.sheetPosition.y = sourceFrame.frame.y;
      frameLayer.spritePosition.x = sourceFrame.spriteSourceSize.x;
      frameLayer.spritePosition.y = sourceFrame.spriteSourceSize.y;
      const cel = celsByLayer.get(frameLayerName)?.get(frameNo);
      if (cel !== undefined) {
        frameLayer.zOffset = cel.zIndex;
      }
      frame.layers.push(frameLayer);
    }
  } else {
    let autoFrameIndex = 0;
    for (const [frameKey, sourceFrame] of Object.entries(sourceSheet.frames)) {
      const frameMatch = matcher(frameKey);
      const frameNo = frameMatch.frame ?? autoFrameIndex++;
      const frame = getFrame(frameNo);
      frame.duration = sourceFrame.duration;
      const frameLayerName =
        frameMatch.layer ?? layersByName.keys().next().value ?? "default";
      const layer = getLayer(frameLayerName);
      const frameLayer = new FrameLayerData();
      frameLayer.layerIndex = layer.index;
      frameLayer.size.width = sourceFrame.frame.w;
      frameLayer.size.height = sourceFrame.frame.h;
      frameLayer.sheetPosition.x = sourceFrame.frame.x;
      frameLayer.sheetPosition.y = sourceFrame.frame.y;
      frameLayer.spritePosition.x = sourceFrame.spriteSourceSize.x;
      frameLayer.spritePosition.y = sourceFrame.spriteSourceSize.y;
      const cel = celsByLayer.get(frameLayerName)?.get(frameNo);
      if (cel !== undefined) {
        frameLayer.zOffset = cel.zIndex;
      }
      frame.layers.push(frameLayer);
    }
  }

  const orderedFrames = [...framesByIndex.values()];
  orderedFrames.sort((a, b) => a.index - b.index);
  let lastFrameIndex = 0;
  for (const orderedFrame of orderedFrames) {
    for (let fi = lastFrameIndex; fi < orderedFrame.index; fi++) {
      const missingFrame = new FrameData();
      missingFrame.index = fi;
      sprite.frames.push(missingFrame);
    }
    sprite.frames.push(orderedFrame);
    lastFrameIndex = orderedFrame.index + 1;
  }
  for (let fi = lastFrameIndex; fi <= maxFrameIndex; fi++) {
    const missingFrame = new FrameData();
    missingFrame.index = fi;
    sprite.frames.push(missingFrame);
  }

  // Build animations.
  if (hasTags) {
    for (const sourceTag of sourceSheet.meta.frameTags ?? []) {
      const animation = new AnimationData();
      animation.name = sourceTag.name;
      animation.indexStart = sourceTag.from;
      animation.indexEnd = sourceTag.to;
      sprite.animations.push(animation);
    }
  }

  // Find the center of the sprite.
  const firstFrame = Array.isArray(sourceSheet.frames)
    ? sourceSheet.frames.at(0)
    : Object.values(sourceSheet.frames).at(0);
  if (firstFrame !== undefined) {
    const firstFrameSize = firstFrame.sourceSize;
    sprite.size = new SizeData();
    sprite.size.width = firstFrameSize.w;
    sprite.size.height = firstFrameSize.h;
  }

  return sprite;
}
