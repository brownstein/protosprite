#!/usr/bin/env node
import { Command } from "@commander-js/extra-typings";
import * as aseprite from "@kayahr/aseprite";
import childProcess from "child_process";
import fs from "fs";
import { Jimp } from "jimp";
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
import tmpDir from "temp-dir";

import {
  ExternalSpriteSheetData,
  isEmbeddedSpriteSheetData
} from "../../protosprite-core/dist/src/core/data.js";
import { findAsperiteBinary } from "./util/findAseprite.js";
import { genTypeDefinitions } from "./util/genDefinitions.js";
import os from "os";


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
  .option("--debug", "enable debug logging.");

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
};

class ProtoSpriteCLI {
  private args: ProtoSpriteCLIArgs;
  private sheet?: ProtoSpriteSheet;
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

      // Handle binary ProtoSprite sheet files.
      const rawBuff = fs.readFileSync(inputFile);
      this.sheet = ProtoSpriteSheet.fromArray(new Uint8Array(rawBuff));
    }
  }
  private async _saveFiles() {
    if (!this.sheet) return;

    // Produce packed sprite on demand.
    if (
      this.args.outputProtoSpriteFileName ||
      this.args.outputSpriteSheetFileName
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

const cli = new ProtoSpriteCLI(args);
await cli._process();
