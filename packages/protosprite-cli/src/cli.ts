import * as aseprite from "@kayahr/aseprite";
import { Image, createCanvas, loadImage } from "canvas";
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
import { repackSpriteSheet } from "protosprite-core/transform";

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

program.command("render").action(() => renderSprite());

program.command("rerender").action(() => rerender());

program.parse();

// FIXME.
function findAsperiteBinary() {
  return path.join(
    "~",
    "Library",
    "Application\\ Support",
    "Steam",
    "steamapps",
    "common",
    "Aseprite",
    "Aseprite.app",
    "Contents",
    "MacOS",
    "aseprite"
  );
}

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
  const sheetImage = await loadImage("./work/exported-sheet.png");

  const sprite = importAsepriteSheetExport(sheetData);
  const sheet = new ProtoSpriteSheet();
  sprite.name = "test";
  sheet.appendSprite(sprite);

  const { renderQueue, size, packedBinsByBBoxKey, padding } =
    repackSpriteSheet(sheet);

  const canvas = createCanvas(size.width, size.height);
  const ctx = canvas.getContext("2d", {
    alpha: true
  });
  for (const item of renderQueue) {
    ctx.drawImage(
      sheetImage,
      item.sx,
      item.sy,
      item.sw,
      item.sh,
      item.dx,
      item.dy,
      item.dw,
      item.dh
    );
  }

  const pngBuffer = canvas.toBuffer("image/png");
  const pngBytes = new Uint8Array(pngBuffer);

  sprite.pixelSource = new ProtoSpritePixelSource();
  sprite.pixelSource.inParentSheet = true;
  sheet.pixelSource = new ProtoSpritePixelSource();
  sheet.pixelSource.pngBytes = pngBytes;

  let spriteIndex = 0;
  for (const sprite of sheet.sprites) {
    for (const frame of sprite.frames.values()) {
      for (const frameLayer of frame.indexedLayers.values()) {
        const transformed = packedBinsByBBoxKey.get(frameLayer);
        if (transformed === undefined) throw new Error("Pack failed!");
        frameLayer.sheetBBox.x = transformed.x + padding;
        frameLayer.sheetBBox.y = transformed.y + padding;
      }
    }
    spriteIndex++;
  }

  fs.writeFileSync("work/exported-bin.prsb", sheet.toBinary(), {
    encoding: "binary"
  });
}

async function rerender() {
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
      console.log(part.sheetBBox, part.spriteBBox);
      res.blit({
        src: img,
        x: part.spriteBBox.x,
        y: part.spriteBBox.y,
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
