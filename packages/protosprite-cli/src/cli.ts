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
  FrameGeometryData,
  Vec2Data,
  PolygonData
} from "protosprite-geom";
import { traceSpriteSheet } from "protosprite-geom/trace";
import tmpDir from "temp-dir";

import {
  ExternalSpriteSheetData,
  isEmbeddedSpriteSheetData
} from "../../protosprite-core/dist/src/core/data.js";

type RenderedImage = Awaited<ReturnType<typeof renderSpriteInstance>>;
import { findAsperiteBinary } from "./util/findAseprite.js";
import { genTypeDefinitions } from "./util/genDefinitions.js";


const program = new Command()
  .name("protosprite-cli")
  .description("Utilities for working with protosprite")
  .version("0.0.1")
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
  );

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
  const entry = geometry.data.entries.find(
    (e) => e.spriteName === spriteName
  );
  const frameGeom = entry?.frames.find(
    (f) => f.frameIndex === frameIndex
  );
  if (!frameGeom) return;

  // Draw per-layer polygons.
  for (const layerGeom of frameGeom.layers) {
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
  if (frameGeom.composite) {
    for (const polygon of frameGeom.composite.polygons) {
      drawPolygonOutline(image, polygon.vertices, 0x00ffffff); // cyan
    }
    for (const decomp of frameGeom.composite.convexDecompositions) {
      for (const component of decomp.components) {
        drawPolygonOutline(image, component.vertices, 0xffff00ff); // yellow
      }
    }
  }
}

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
      if (args.debug) console.log("Packing sprite sheet...", this.sheet);
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

program.parse();
const opts = program.opts();

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
