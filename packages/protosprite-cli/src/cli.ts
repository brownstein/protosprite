import * as aseprite from "@kayahr/aseprite";
import childProcess from "child_process";
import { Command } from "commander";
import { EventEmitter } from "events";
import fs from "fs";
import { Jimp } from "jimp";
import path from "path";
import {
  BBox,
  ProtoSpriteFrameLayer,
  ProtoSpritePixelSource,
  ProtoSpriteSheet
} from "protosprite-core";
import { importAsepriteSheetExport } from "protosprite-core/importers/aseprite";
import { findAsperiteBinary } from "./util/findAseprite.js";
import { packSpriteSheet, renderSpriteInstance } from "protosprite-core/transform";

const program = new Command();
program
  .name("protosprite-cli")
  .description("Utilities for working with protosprite")
  .version("0.0.1");

program
  .command("ingest")
  .argument("input", "input aseprite file")
  .action((inputStr) => {
    exportSpriteSheet(inputStr);
  });

program.command("render").action(renderSprite);
program.command("pack").action(pack);

program.parse();

function exportSpriteSheet(targetFile: string) {
  const asepriteBinPath = findAsperiteBinary();
  const asepriteArgs = [
    "-b",
    "--sheet work/exported-sheet.png",
    "--data work/exported-data.json",
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
    targetFile
  ];
  childProcess.execSync(`${asepriteBinPath} ${asepriteArgs.join(" ")}`);
}

async function renderSprite() {
  const sheetData = JSON.parse(
    fs.readFileSync("./work/exported-data.json", { encoding: "utf8" })
  ) as aseprite.SpriteSheet;
  
  const sprite = importAsepriteSheetExport(sheetData, {
    referenceType: "file",
    assetPath: "./work/",
  });

  const sheet = new ProtoSpriteSheet();
  sheet.appendSprite(sprite);
   const packedSpriteSheet = await packSpriteSheet(sheet);

  const sheetPngBytes = packedSpriteSheet.pixelSource?.pngBytes;
  if (sheetPngBytes) fs.writeFileSync("./work/sheet.png", sheetPngBytes, { encoding: "binary" });

  const packedSprite = packedSpriteSheet.sprites.at(0);

  const instance = packedSprite.clone().createInstance();

  const resultImg = await renderSpriteInstance(instance, {
    excludeLayers: ["Engine"],
    // assetPath: "./work/"
  });
  const pngBytes = await resultImg.getBuffer("image/png");
  fs.writeFileSync("./work/rendered.png", pngBytes, { encoding: "binary" });
}

async function pack() {
  const rawBuff = fs.readFileSync("./work/exported-bin.prsb");

  const spriteSheet = ProtoSpriteSheet.fromBuffer(rawBuff);
  const pngBytes = spriteSheet.pixelSource?.pngBytes;
  if (!pngBytes) {
    console.log("Can't find PNG");
    return;
  }

  const img = await Jimp.read(
    `data:image/png;base64,${Buffer.from(pngBytes).toString("base64")}`,
    {
      "image/png": {}
    }
  );
  const res = new Jimp({
    width: 200,
    height: 200,
  });

  for (const sprite of spriteSheet.sprites) {
    const frame = sprite.frames.values().next()?.value;
    if (!frame) continue;
    for (const part of frame.indexedLayers.values()) {
      res.blit({
        src: img,
        x: part.spriteBBox.x - sprite.center.x + 100,
        y: part.spriteBBox.y - sprite.center.y + 100,
        srcX: part.sheetBBox.x,
        srcY: part.sheetBBox.y,
        srcW: part.sheetBBox.width,
        srcH: part.sheetBBox.height
      });
    }
  }

  const pngOut = await res.getBuffer("image/png");
  fs.writeFileSync("./work/out.png", pngOut, { encoding: "binary" });
}
