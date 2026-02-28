#!/usr/bin/env node
import { Command } from "@commander-js/extra-typings";
import * as aseprite from "@kayahr/aseprite";
import childProcess from "child_process";
import fs from "fs";
import { Jimp } from "jimp";
import os from "os";
import path from "path";
import ProtoSprite, {
  ProtoSpriteInstance,
  ProtoSpriteSheet
} from "protosprite-core";
import { importAsepriteSheetExport } from "protosprite-core/importers/aseprite";
import {
  packSpriteSheet,
  renderSpriteInstance
} from "protosprite-core/transform";
import {
  ProtoSpriteGeometry,
  Vec2Data
} from "protosprite-geom";
import { traceSpriteSheet } from "protosprite-geom/trace";
import tmpDir from "temp-dir";

import {
  ExternalSpriteSheetData,
  isEmbeddedSpriteSheetData,
  isExternalSpriteSheetData
} from "../../protosprite-core/dist/src/core/data.js";

type RenderedImage = Awaited<ReturnType<typeof renderSpriteInstance>>;
import { findAsperiteBinary } from "./util/findAseprite.js";
import { genTypeDefinitions } from "./util/genDefinitions.js";


function drawLine(
  image: RenderedImage,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: number
) {
  // Bresenham's line algorithm.
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    if (x0 >= 0 && x0 < image.width && y0 >= 0 && y0 < image.height) {
      image.setPixelColor(color, x0, y0);
    }
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
}

function drawPolygonOutline(
  image: RenderedImage,
  vertices: Vec2Data[],
  color: number
) {
  if (vertices.length < 2) return;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    drawLine(image, a.x, a.y, b.x, b.y, color);
  }
}

function overlayPolygonsOnImage(
  image: RenderedImage,
  geometry: ProtoSpriteGeometry,
  spriteName: string,
  frameIndex: number
): void {
  const resolved = geometry.getFrameGeometry(spriteName, frameIndex);
  if (!resolved) return;

  // Draw per-layer polygons.
  for (const layerGeom of resolved.layers) {
    for (const polygon of layerGeom.polygons) {
      drawPolygonOutline(image, polygon.vertices, 0x00ff00ff); // green
    }
    for (const decomp of layerGeom.convexDecompositions) {
      for (const component of decomp.components) {
        drawPolygonOutline(image, component.vertices, 0xff0000ff); // red
      }
    }
  }

  // Draw composite-frame polygons if present.
  if (resolved.composite) {
    for (const polygon of resolved.composite.polygons) {
      drawPolygonOutline(image, polygon.vertices, 0x00ffffff); // cyan
    }
    for (const decomp of resolved.composite.convexDecompositions) {
      for (const component of decomp.components) {
        drawPolygonOutline(image, component.vertices, 0xffff00ff); // yellow
      }
    }
  }
}

type ProtoSpriteCLIArgs = {
  spriteNames?: string[];
  inputFiles: string[];
  outputAsepriteExportFileName?: string;
  outputProtoSpriteFileName?: string;
  outputSpriteSheetFileName?: string;
  outputRenderedFileName?: string;
  outputMode?: "binary" | "json";
  writeTypesFileName?: string;
  debug?: boolean;
  traceGeometry?: boolean;
  simplifyTolerance?: number;
  perLayerGeometry?: boolean;
  compositeGeometry?: boolean;
  outputPrsgFileName?: string;
  outputGeomJsonFileName?: string;
  prsgEmbedPrs?: boolean;
  exportFramesDir?: string;
  overlayPolygons?: boolean;
};

class ProtoSpriteCLI {
  private args: ProtoSpriteCLIArgs;
  private sheet?: ProtoSpriteSheet;
  private geometry?: ProtoSpriteGeometry;
  private workingDirectory = path.join(tmpDir, "protosprite");
  constructor(args: ProtoSpriteCLIArgs) {
    this.args = args;
  }
  async _process() {
    if (this.args.debug)
      console.log("[debug] working directory:", this.workingDirectory);
    if (this.args.debug) console.log("[debug] loading files...");
    await this._loadFiles();
    if (this.args.debug)
      console.log(
        "[debug] loaded files:",
        this.sheet?.sprites.map((sprite) => sprite.data.name).join(" ")
      );

    // Rename sprites in sheet.
    const applyNames = this.args.spriteNames;
    if (applyNames) {
      this.sheet?.sprites.forEach((s, i) => {
        if (i >= applyNames.length) return;
        s.data.name = applyNames[i];
      });
    }

    if (this.args.debug) console.log("[debug] saving files...");
    await this._saveFiles();
    await this._exportFrames();
  }
  private async _loadFiles() {
    this.sheet = new ProtoSpriteSheet();
    // Clear out working directory.
    fs.rmSync(this.workingDirectory, {
      recursive: true,
      force: true
    });
    fs.mkdirSync(this.workingDirectory);
    // Process files.
    for (const inputFile of this.args.inputFiles) {
      const inputFileParts = path.parse(inputFile);

      // Handle .prsg geometry files.
      if (inputFileParts.ext === ".prsg") {
        const rawBuff = fs.readFileSync(inputFile);
        const geom = ProtoSpriteGeometry.fromArray(new Uint8Array(rawBuff));
        this.sheet = geom.getSpriteSheet();
        this.geometry = geom;
        if (this.args.debug)
          console.log("[debug] loaded .prsg file:", inputFile);
        continue;
      }

      // Handle aseprite files exports automatically.
      if (
        inputFileParts.ext.endsWith("ase") ||
        inputFileParts.ext.endsWith("aseprite")
      ) {
        const workFileName = path.join(
          this.workingDirectory,
          inputFileParts.base
        );
        fs.copyFileSync(inputFile, workFileName);
        const workExportSheetName = path.join(
          this.workingDirectory,
          `${inputFileParts.name}.json`
        );
        const workExportPngName = path.join(
          this.workingDirectory,
          `${inputFileParts.name}.png`
        );
        let asepriteBinPath = findAsperiteBinary();

        const asepriteArgs = [
          "-b",
          "--sheet",
          `"${workExportPngName}"`,
          "--data",
          `"${workExportSheetName}"`,
          "--format json-hash",
          "--split-layers",
          "--all-layers",
          "--list-layers",
          "--list-tags",
          "--ignore-empty",
          "--merge-duplicates",
          "--border-padding 1",
          "--shape-padding 1",
          "--trim",
          '--filename-format "({layer}) {frame}"',
          `"${workFileName}"`
        ];
        childProcess.execSync(`"${asepriteBinPath}" ${asepriteArgs.join(" ")}`);
        const sheetData = JSON.parse(
          fs.readFileSync(workExportSheetName, { encoding: "utf8" })
        ) as aseprite.SpriteSheet;
        if (this.args.debug)
          console.log(
            "File to import:",
            this.workingDirectory + path.sep + sheetData.meta.image
          );
        const sprite = importAsepriteSheetExport(sheetData, {
          referenceType: "file",
          frameNameFormat: "({layer}) {frame}",
          assetPath: this.workingDirectory + path.sep,
          debug: this.args.debug
        });
        if (this.args.debug) console.log("Imported file:", sprite.name);
        this.sheet?.data.sprites.push(sprite);
        this.sheet?.sprites.push(new ProtoSprite(sprite, this.sheet));
        continue;
      }

      // Handle binary ProtoSprite sheet files (.prs or other).
      const rawBuff = fs.readFileSync(inputFile);
      this.sheet = ProtoSpriteSheet.fromArray(new Uint8Array(rawBuff));
    }
  }
  private async _saveFiles() {
    if (!this.sheet) return;

    // Produce packed sprite on demand.
    if (
      this.args.outputProtoSpriteFileName ||
      this.args.outputSpriteSheetFileName ||
      this.args.outputPrsgFileName ||
      this.args.outputGeomJsonFileName
    ) {
      if (this.args.debug) console.log("Packing sprite sheet...", this.sheet);
      this.sheet.data = await packSpriteSheet(this.sheet.data);
      this.sheet.sprites = this.sheet.data.sprites.map(
        (data) => new ProtoSprite(data, this.sheet)
      );
      if (!this.sheet) throw new Error("Missing sprite sheet after packing.");

      // In sheet export mode, remove the embedded buffer.
      if (this.args.outputSpriteSheetFileName) {
        if (
          isEmbeddedSpriteSheetData(this.sheet.data.pixelSource) &&
          !!this.sheet.data.pixelSource.pngData
        ) {
          const pngFileName = this.args.outputSpriteSheetFileName;
          fs.writeFileSync(pngFileName, this.sheet.data.pixelSource.pngData, {
            encoding: "binary"
          });
          this.sheet.data.pixelSource = new ExternalSpriteSheetData();
          this.sheet.data.pixelSource.fileName = pngFileName;
        }
      }

      if (this.args.outputProtoSpriteFileName) {
        if (this.args.outputMode === "json") {
          const jsonStr = JSON.stringify(this.sheet.toJsonObject());
          fs.writeFileSync(this.args.outputProtoSpriteFileName, jsonStr, {
            encoding: "utf8"
          });
        } else {
          const binBuff = this.sheet.toArray();
          fs.writeFileSync(this.args.outputProtoSpriteFileName, binBuff, {
            encoding: "binary"
          });
        }
      }

      // Output .prsg file with traced geometry.
      if (this.args.outputPrsgFileName) {
        if (this.args.debug) console.log("[debug] tracing geometry...");
        const geomData = await traceSpriteSheet(this.sheet, {
          tolerance: this.args.simplifyTolerance ?? 0.5,
          composite: this.args.compositeGeometry ?? true,
          perLayer: this.args.perLayerGeometry ?? false
        });

        const geom = new ProtoSpriteGeometry(geomData);

        if (this.args.prsgEmbedPrs) {
          geom.embedSpriteSheet(this.sheet);
        } else if (this.args.outputProtoSpriteFileName) {
          geom.referenceSpriteSheet(this.args.outputProtoSpriteFileName);
        }

        this.geometry = geom;

        if (this.args.outputMode === "json") {
          const jsonStr = JSON.stringify(geom.toJsonObject());
          fs.writeFileSync(this.args.outputPrsgFileName, jsonStr, {
            encoding: "utf8"
          });
        } else {
          const prsgBinary = geom.toArray();
          fs.writeFileSync(this.args.outputPrsgFileName, prsgBinary, {
            encoding: "binary"
          });
        }
        if (this.args.debug)
          console.log(
            "[debug] wrote .prsg file:",
            this.args.outputPrsgFileName
          );
      }

      // Output geometry as human-readable JSON.
      if (this.args.outputGeomJsonFileName) {
        // Trace if we don't already have geometry from --output-prsg or input.
        if (!this.geometry) {
          if (this.args.debug) console.log("[debug] tracing geometry for JSON output...");
          const geomData = await traceSpriteSheet(this.sheet, {
            tolerance: this.args.simplifyTolerance ?? 1.0,
            composite: this.args.compositeGeometry ?? false
          });
          this.geometry = new ProtoSpriteGeometry(geomData);
        }
        const jsonStr = JSON.stringify(this.geometry.toJsonObject(), null, 2);
        fs.writeFileSync(this.args.outputGeomJsonFileName, jsonStr, {
          encoding: "utf8"
        });
        if (this.args.debug)
          console.log(
            "[debug] wrote geometry JSON:",
            this.args.outputGeomJsonFileName
          );
      }
    }

    if (!this.sheet) return;

    // Render output preview on demand.
    if (this.args.outputRenderedFileName) {
      let totalWidth = 0;
      let totalHeight = 0;
      for (const sprite of this.sheet.sprites) {
        totalWidth += sprite.data.size.width;
        totalHeight = Math.max(totalHeight, sprite.data.size.height);
      }
      const outputImg = new Jimp({
        width: totalWidth,
        height: totalHeight
      });
      let xOffset = 0;
      for (const sprite of this.sheet.sprites) {
        const yOffset = 0;
        const renderedSpriteImg = await renderSpriteInstance(
          new ProtoSpriteInstance(sprite),
          {
            debug: this.args.debug
          }
        );
        outputImg.blit({
          src: renderedSpriteImg,
          x: xOffset,
          y: yOffset,
          srcX: 0,
          srcY: 0,
          srcW: renderedSpriteImg.width,
          srcH: renderedSpriteImg.height
        });
        xOffset += sprite.data.size.width;
      }
      await outputImg.write(
        this.args.outputRenderedFileName as "string.string"
      );
    }

    if (this.args.writeTypesFileName) {
      const typeDefsStr = genTypeDefinitions(this.sheet.data);
      fs.writeFileSync(this.args.writeTypesFileName, typeDefsStr, {
        encoding: "utf8"
      });
    }
  }

  private async _exportFrames() {
    if (!this.args.exportFramesDir || !this.sheet) return;

    fs.mkdirSync(this.args.exportFramesDir, { recursive: true });

    for (const sprite of this.sheet.sprites) {
      // If sprite has animations, export frames per animation.
      if (sprite.data.animations.length > 0) {
        for (const animation of sprite.data.animations) {
          for (
            let i = animation.indexStart;
            i <= animation.indexEnd;
            i++
          ) {
            const instance = new ProtoSpriteInstance(sprite);
            instance.animationState.currentFrame = i;

            const frameImg = await renderSpriteInstance(instance);

            if (this.args.overlayPolygons && this.geometry) {
              overlayPolygonsOnImage(
                frameImg,
                this.geometry,
                sprite.data.name,
                i
              );
            }

            const fileName = `${sprite.data.name}_${animation.name}_${i}.png`;
            const outPath = path.join(this.args.exportFramesDir, fileName);
            await frameImg.write(outPath as "string.string");

            if (this.args.debug)
              console.log("[debug] exported frame:", outPath);
          }
        }
      } else {
        // No animations defined, export all frames directly.
        for (let i = 0; i < sprite.data.frames.length; i++) {
          const instance = new ProtoSpriteInstance(sprite);
          instance.animationState.currentFrame = i;

          const frameImg = await renderSpriteInstance(instance);

          if (this.args.overlayPolygons && this.geometry) {
            overlayPolygonsOnImage(
              frameImg,
              this.geometry,
              sprite.data.name,
              i
            );
          }

          const fileName = `${sprite.data.name}_frame_${i}.png`;
          const outPath = path.join(this.args.exportFramesDir, fileName);
          await frameImg.write(outPath as "string.string");

          if (this.args.debug)
            console.log("[debug] exported frame:", outPath);
        }
      }
    }
  }
}

// --- Analyze helpers ---

function formatBytes(bytes: number): string {
  return bytes.toLocaleString();
}

function describePixelSource(
  pixelSource:
    | { _isEmbeddedData?: boolean; pngData?: Uint8Array; _isExternalData?: boolean; url?: string; fileName?: string }
    | undefined
): { description: string; type: string; size?: number; fileName?: string; url?: string } {
  if (!pixelSource) {
    return { description: "none", type: "none" };
  }
  if (isEmbeddedSpriteSheetData(pixelSource as any)) {
    const embedded = pixelSource as { pngData?: Uint8Array };
    const size = embedded.pngData?.byteLength;
    return {
      description: size != null
        ? `embedded PNG (${formatBytes(size)} bytes)`
        : "embedded PNG",
      type: "embedded",
      size
    };
  }
  if (isExternalSpriteSheetData(pixelSource as any)) {
    const external = pixelSource as { url?: string; fileName?: string };
    if (external.fileName) {
      return {
        description: `external file: ${external.fileName}`,
        type: "externalFile",
        fileName: external.fileName
      };
    }
    if (external.url) {
      return {
        description: `external URL: ${external.url}`,
        type: "externalUrl",
        url: external.url
      };
    }
  }
  return { description: "unknown", type: "unknown" };
}

function analyzePrs(filePath: string, fileSize: number, sheet: ProtoSpriteSheet) {
  const pixelSourceInfo = describePixelSource(sheet.data.pixelSource as any);

  const sprites = sheet.data.sprites.map((sprite) => {
    const totalDuration = sprite.frames.reduce((sum, f) => sum + f.duration, 0);

    const animations = sprite.animations.map((anim) => {
      let animDuration = 0;
      for (let i = anim.indexStart; i <= anim.indexEnd; i++) {
        const frame = sprite.frames.find((f) => f.index === i);
        animDuration += frame?.duration ?? 0;
      }
      return {
        name: anim.name,
        indexStart: anim.indexStart,
        indexEnd: anim.indexEnd,
        frameCount: anim.indexEnd - anim.indexStart + 1,
        duration: animDuration
      };
    });

    const layers = sprite.layers.map((layer) => ({
      name: layer.name,
      index: layer.index,
      isGroup: layer.isGroup,
      parentIndex: layer.parentIndex,
      opacity: layer.opacity
    }));

    return {
      name: sprite.name,
      size: { width: sprite.size.width, height: sprite.size.height },
      frameCount: sprite.frames.length,
      totalDuration,
      animations,
      layers
    };
  });

  return {
    type: "prs" as const,
    file: filePath,
    fileSize,
    pixelSource: pixelSourceInfo,
    sprites
  };
}

function printLayerTree(
  layers: Array<{ name: string; index: number; isGroup: boolean; parentIndex?: number; opacity?: number }>,
  indent: string
) {
  // Build children map.
  const childrenOf = new Map<number | undefined, typeof layers>();
  for (const layer of layers) {
    const parent = layer.parentIndex;
    if (!childrenOf.has(parent)) childrenOf.set(parent, []);
    childrenOf.get(parent)!.push(layer);
  }

  function printChildren(parentIndex: number | undefined, prefix: string) {
    const children = childrenOf.get(parentIndex) ?? [];
    for (const layer of children) {
      let label = layer.name;
      const annotations: string[] = [];
      if (layer.isGroup) annotations.push("group");
      if (layer.opacity != null && layer.opacity !== 0) annotations.push(`opacity: ${layer.opacity}`);
      if (annotations.length > 0) label += ` (${annotations.join(", ")})`;
      console.log(`${prefix}- ${label}`);
      if (layer.isGroup) {
        printChildren(layer.index, prefix + "  ");
      }
    }
  }

  // Root layers have parentIndex === undefined or 0 (check both).
  printChildren(undefined, indent);
  // Also print layers with parentIndex === 0 if no layer has index 0, or if 0 isn't a group.
  // Actually, parentIndex is undefined for root layers based on the protobuf schema.
  // But some layers may have parentIndex = 0. Let's check if we already printed them.
}

function printPrsAnalysis(result: ReturnType<typeof analyzePrs>) {
  console.log(`File: ${result.file} (${formatBytes(result.fileSize)} bytes)`);
  console.log(`  Pixel source: ${result.pixelSource.description}`);

  for (const sprite of result.sprites) {
    console.log();
    console.log(`  Sprite: "${sprite.name}" (${sprite.size.width}x${sprite.size.height})`);
    console.log(`    Frames: ${sprite.frameCount} (total duration: ${sprite.totalDuration}ms)`);

    if (sprite.animations.length > 0) {
      console.log(`    Animations:`);
      for (const anim of sprite.animations) {
        console.log(`      - ${anim.name} (frames ${anim.indexStart}-${anim.indexEnd}, ${anim.duration}ms)`);
      }
    }

    if (sprite.layers.length > 0) {
      console.log(`    Layers:`);
      printLayerTree(sprite.layers, "      ");
    }
  }
}

function analyzePrsg(filePath: string, fileSize: number, geom: ProtoSpriteGeometry) {
  // Describe the sprite source.
  let spriteSourceInfo: { description: string; type: string; fileName?: string; url?: string; prsSize?: number };
  const src = geom.data.spriteSource;
  if (!src) {
    spriteSourceInfo = { description: "none", type: "none" };
  } else if (src.type === "embedded") {
    spriteSourceInfo = {
      description: `embedded PRS (${formatBytes(src.prsData.byteLength)} bytes)`,
      type: "embedded",
      prsSize: src.prsData.byteLength
    };
  } else if (src.type === "externalFile") {
    spriteSourceInfo = {
      description: `external file: ${src.fileName}`,
      type: "externalFile",
      fileName: src.fileName
    };
  } else {
    spriteSourceInfo = {
      description: `external URL: ${src.url}`,
      type: "externalUrl",
      url: src.url
    };
  }

  // Try to load embedded PRS for sprite info.
  let prsAnalysis: ReturnType<typeof analyzePrs> | undefined;
  if (src?.type === "embedded") {
    try {
      const sheet = ProtoSpriteSheet.fromArray(src.prsData);
      prsAnalysis = analyzePrs(filePath, src.prsData.byteLength, sheet);
    } catch {
      // Ignore errors loading embedded PRS.
    }
  }

  const entries = geom.data.entries.map((entry) => {
    let hasPerLayerGeometry = false;
    let hasCompositeGeometry = false;
    let totalShapeReferences = 0;

    for (const frame of entry.frames) {
      if (frame.layers.length > 0) {
        hasPerLayerGeometry = true;
        for (const layerGeom of frame.layers) {
          totalShapeReferences += layerGeom.shapeIndices.length;
        }
      }
      if (frame.composite) {
        hasCompositeGeometry = true;
        totalShapeReferences += frame.composite.shapeIndices.length;
      }
    }

    // Compute totals from the shape pool.
    const uniqueShapes = entry.shapePool.length;
    const uniqueVertices = entry.vertexPool.length;
    let totalVertexIndices = 0;
    for (const shape of entry.shapePool) {
      totalVertexIndices += shape.polygon.vertexIndices.length;
      for (const comp of shape.convexDecompositionComponents) {
        totalVertexIndices += comp.vertexIndices.length;
      }
    }

    return {
      spriteName: entry.spriteName,
      simplifyTolerance: entry.simplifyTolerance,
      frameCount: entry.frames.length,
      hasPerLayerGeometry,
      hasCompositeGeometry,
      uniqueShapes,
      totalShapeReferences,
      uniqueVertices,
      totalVertexIndices
    };
  });

  return {
    type: "prsg" as const,
    file: filePath,
    fileSize,
    spriteSource: spriteSourceInfo,
    prsAnalysis,
    entries
  };
}

function printPrsgAnalysis(result: ReturnType<typeof analyzePrsg>) {
  console.log(`File: ${result.file} (${formatBytes(result.fileSize)} bytes)`);
  console.log(`  Sprite source: ${result.spriteSource.description}`);

  // Print embedded PRS sprite info if available.
  if (result.prsAnalysis) {
    console.log(`  Pixel source: ${result.prsAnalysis.pixelSource.description}`);
    for (const sprite of result.prsAnalysis.sprites) {
      console.log();
      console.log(`  Sprite: "${sprite.name}" (${sprite.size.width}x${sprite.size.height})`);
      console.log(`    Frames: ${sprite.frameCount} (total duration: ${sprite.totalDuration}ms)`);
      if (sprite.animations.length > 0) {
        console.log(`    Animations:`);
        for (const anim of sprite.animations) {
          console.log(`      - ${anim.name} (frames ${anim.indexStart}-${anim.indexEnd}, ${anim.duration}ms)`);
        }
      }
      if (sprite.layers.length > 0) {
        console.log(`    Layers:`);
        printLayerTree(sprite.layers, "      ");
      }
    }
  }

  console.log();
  console.log(`  Geometry entries: ${result.entries.length}`);
  for (const entry of result.entries) {
    console.log(`    Entry: "${entry.spriteName}" (simplify tolerance: ${entry.simplifyTolerance})`);
    console.log(`      Frames with geometry: ${entry.frameCount}`);
    console.log(`      Has per-layer geometry: ${entry.hasPerLayerGeometry ? "yes" : "no"}`);
    console.log(`      Has composite geometry: ${entry.hasCompositeGeometry ? "yes" : "no"}`);
    console.log(`      Unique shapes: ${entry.uniqueShapes}`);
    console.log(`      Total shape references: ${entry.totalShapeReferences}`);
    console.log(`      Unique vertices: ${entry.uniqueVertices}`);
    console.log(`      Total vertex indices: ${entry.totalVertexIndices}`);
  }
}

// --- Command setup ---

const program = new Command()
  .name("protosprite-cli")
  .description("Utilities for working with protosprite")
  .version("0.0.1");

program
  .command("build")
  .description("Build/convert sprite files")
  .option("--name [name...]", "Provide names for the imported sprites.")
  .requiredOption("-i, --input [input...]", "Process an input file.")
  .option("--output [output]", "output a ProtoSprite file.")
  .option("--external-sheet", "output an exernal sprite sheet.")
  .option(
    "--write-types [types-file]",
    "write a types file for sprite animations and layers."
  )
  .option("--preview [preview-output]", "output a preview file.")
  .option("--json", "output in JSON format")
  .option("--debug", "enable debug logging.")
  .option("--trace-geometry", "enable polygon tracing on the input sprites.")
  .option(
    "--simplify-tolerance <number>",
    "simplification tolerance for polygon tracing.",
    "0.5"
  )
  .option(
    "--per-layer-geometry",
    "include per-layer polygons in addition to composite-frame polygons."
  )
  .option(
    "--no-composite-geometry",
    "disable composite-frame polygons (only useful with --per-layer-geometry)."
  )
  .option("--output-prsg [file]", "output a .prsg geometry file.")
  .option(
    "--output-geom-json [file]",
    "output traced geometry as a human-readable JSON file."
  )
  .option(
    "--prsg-embed-prs",
    "embed the .prs data inside the .prsg file."
  )
  .option(
    "--export-frames [dir]",
    "export each frame of each animation as a separate PNG."
  )
  .option(
    "--overlay-polygons",
    "when exporting frames, overlay traced polygons on the output images."
  )
  .action(async (opts) => {
    let args: ProtoSpriteCLIArgs = {
      inputFiles: []
    };

    if (opts.name && Array.isArray(opts.name)) args.spriteNames = opts.name;
    if (opts.input && Array.isArray(opts.input)) args.inputFiles = opts.input;
    if (typeof opts.output === "string")
      args.outputProtoSpriteFileName = opts.output;
    if (opts.externalSheet && args.outputProtoSpriteFileName) {
      const sheetFileName = path.parse(args.outputProtoSpriteFileName);
      args.outputSpriteSheetFileName = path.join(
        sheetFileName.dir,
        `${sheetFileName.name}.png`
      );
    }
    if (typeof opts.preview === "string")
      args.outputRenderedFileName = opts.preview;
    if (opts.json) args.outputMode = "json";
    if (typeof opts.writeTypes === "string")
      args.writeTypesFileName = opts.writeTypes;
    if (opts.debug) args.debug = true;
    if (opts.traceGeometry) args.traceGeometry = true;
    if (opts.simplifyTolerance)
      args.simplifyTolerance = parseFloat(opts.simplifyTolerance);
    if (opts.perLayerGeometry) args.perLayerGeometry = true;
    if (opts.compositeGeometry === false) args.compositeGeometry = false;
    if (typeof opts.outputPrsg === "string")
      args.outputPrsgFileName = opts.outputPrsg;
    if (typeof opts.outputGeomJson === "string")
      args.outputGeomJsonFileName = opts.outputGeomJson;
    if (opts.prsgEmbedPrs) args.prsgEmbedPrs = true;
    if (typeof opts.exportFrames === "string")
      args.exportFramesDir = opts.exportFrames;
    if (opts.overlayPolygons) args.overlayPolygons = true;

    const cli = new ProtoSpriteCLI(args);
    await cli._process();
  });

program
  .command("analyze")
  .description("Analyze .prs and .prsg files and print structural information")
  .requiredOption("-i, --input [input...]", "Input files to analyze.")
  .option("--json", "Output in JSON format")
  .action(async (opts) => {
    const inputFiles = Array.isArray(opts.input) ? opts.input : [];
    const jsonMode = !!opts.json;
    const results: (ReturnType<typeof analyzePrs> | ReturnType<typeof analyzePrsg>)[] = [];

    for (const inputFile of inputFiles) {
      const fileParts = path.parse(inputFile);
      const stat = fs.statSync(inputFile);
      const fileSize = stat.size;
      const rawBuff = fs.readFileSync(inputFile);

      if (fileParts.ext === ".prsg") {
        const geom = ProtoSpriteGeometry.fromArray(new Uint8Array(rawBuff));
        const result = analyzePrsg(inputFile, fileSize, geom);
        results.push(result);
        if (!jsonMode) {
          if (results.length > 1) console.log();
          printPrsgAnalysis(result);
        }
      } else {
        const sheet = ProtoSpriteSheet.fromArray(new Uint8Array(rawBuff));
        const result = analyzePrs(inputFile, fileSize, sheet);
        results.push(result);
        if (!jsonMode) {
          if (results.length > 1) console.log();
          printPrsAnalysis(result);
        }
      }
    }

    if (jsonMode) {
      console.log(JSON.stringify(results, null, 2));
    }
  });

await program.parseAsync();
