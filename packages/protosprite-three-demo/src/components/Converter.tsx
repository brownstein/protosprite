import { fromBinary, toBinary } from "@bufbuild/protobuf";
import {
  faChevronRight,
  faClose,
  faDownload
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import * as Aseprite from "@kayahr/aseprite";
import cx from "classnames";
import { Data, Protos } from "protosprite-core";
import { importAsepriteSheetExport } from "protosprite-core/importers/aseprite";
import {
  AsepriteFileBitmap,
  importAsepriteFile
} from "protosprite-core/importers/aseprite-file";
import { packSpriteSheet } from "protosprite-core/transform";
import {
  MouseEventHandler,
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import { FileWithPath, useDropzone } from "react-dropzone";
import download from "js-file-download";

import "./Converter.css";

export type ConverterProps = {
  onPreviewSprite?: (sheet: Data.SpriteSheetData, index?: number) => void;
};

type PngFileToDisplay = {
  type: "image/png";
  file: FileWithPath;
  fileSize: number;
  imageUrl?: string;
};

type JsonFileToDisplay = {
  type: "application/json";
  file: FileWithPath;
  json: unknown;
  fileSize: number;
};

type ProtoSpriteFileToDisplay = {
  type: "sprite/protosprite";
  file: FileWithPath;
  fileSize: number;
  spriteSheetData: Data.SpriteSheetData;
  imageUrl?: string;
};

/**
 * A `.aseprite` file read in the browser. There is no sprite sheet yet — cels
 * arrive at their own bounds as raw RGBA, and packing is what turns them into
 * an atlas. The pixels ride along here until then.
 */
type AsepriteFileToDisplay = {
  type: "sprite/aseprite";
  file: FileWithPath;
  fileSize: number;
  sprite: Data.SpriteData;
  bitmaps: AsepriteFileBitmap[];
  imageUrl?: string;
};

/** A file we could not read, kept so the reason can be shown rather than swallowed. */
type FailedFileToDisplay = {
  type: "error";
  file: FileWithPath;
  fileSize: number;
  message: string;
};

type UploadedFile =
  | PngFileToDisplay
  | JsonFileToDisplay
  | ProtoSpriteFileToDisplay
  | AsepriteFileToDisplay
  | FailedFileToDisplay;

const ASEPRITE_EXTENSIONS = [".aseprite", ".ase"];

const isAsepriteFileName = (name: string) =>
  ASEPRITE_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));

/**
 * Composite a sprite's first drawn frame into a thumbnail, straight from the
 * cel bitmaps. Nothing has been packed at this point, so this is the only way
 * to show what was dropped.
 */
function renderAsepriteThumbnail(
  sprite: Data.SpriteData,
  bitmaps: AsepriteFileBitmap[]
): string | undefined {
  const frameIndex = bitmaps.length ? bitmaps[0].frameIndex : -1;
  if (frameIndex < 0) return undefined;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, sprite.size.width);
  canvas.height = Math.max(1, sprite.size.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  // Bitmaps are in layer order already, so drawing in sequence stacks them
  // the way Aseprite does.
  for (const bitmap of bitmaps) {
    if (bitmap.frameIndex !== frameIndex) continue;
    const image = ctx.createImageData(bitmap.width, bitmap.height);
    image.data.set(bitmap.rgba);
    // putImageData ignores compositing, so each cel goes through a scratch
    // canvas to blend against what is already there.
    const scratch = document.createElement("canvas");
    scratch.width = bitmap.width;
    scratch.height = bitmap.height;
    const scratchCtx = scratch.getContext("2d");
    if (!scratchCtx) continue;
    scratchCtx.putImageData(image, 0, 0);
    ctx.drawImage(scratch, bitmap.x, bitmap.y);
  }
  return canvas.toDataURL("image/png");
}

type ProtoSpriteResult = {
  type: "sprite/protosprite";
  data: Data.SpriteSheetData;
  imageUrl?: string;
  fileSize: number;
  blobUrl: string;
};

export function Converter(props: ConverterProps) {
  const { onPreviewSprite } = props;
  const [allFiles, setAllFiles] = useState<FileWithPath[]>([]);

  const { getRootProps, getInputProps } = useDropzone({
    accept: {
      "image/png": [".png"],
      "application/json": [".json"],
      "sprite/protosprite": [".prs"],
      "sprite/aseprite": ASEPRITE_EXTENSIONS
    },
    onDropAccepted(files) {
      setAllFiles((currentFiles) => [
        ...currentFiles,
        ...files.filter(
          (file) =>
            !currentFiles.find((cf) => cf.path === (file as FileWithPath).path)
        )
      ]);
    }
  });

  const [isProcessing, setProcessing] = useState(false);
  const [processedFile, setProcessedFile] = useState<ProtoSpriteResult | null>(
    null
  );
  const processIState = useMemo(
    () => ({
      allFiles,
      allProcessedFiles: [] as UploadedFile[],
      onPreview: undefined as typeof onPreviewSprite
    }),
    [allFiles]
  );
  processIState.allFiles = allFiles;
  processIState.onPreview = onPreviewSprite;

  const onProcessedFilesUpdate = useCallback(async () => {
    setProcessing(true);
    // Ok, now for the fun part. We get to check if we have all data and can pack
    // a resulting sprite sheet.
    const availablePngsByName = new Map<string, PngFileToDisplay>();
    const availableSprites: Aseprite.SpriteSheet[] = [];
    const availableAsepriteFiles: AsepriteFileToDisplay[] = [];
    let resultSheet = new Data.SpriteSheetData();
    for (const processed of processIState.allProcessedFiles) {
      switch (processed.type) {
        case "application/json":
          availableSprites.push(processed.json as Aseprite.SpriteSheet);
          break;
        case "image/png":
          availablePngsByName.set(processed.file.name, processed);
          break;
        case "sprite/aseprite":
          availableAsepriteFiles.push(processed);
          break;
        case "sprite/protosprite":
          resultSheet = processed.spriteSheetData.clone();
          break;
        case "error":
          break;
      }
    }
    // Sprites read straight from .aseprite carry their pixels with them rather
    // than pointing at a sheet, so packing is told where to find them.
    const bitmapsBySpriteIndex = new Map<
      number,
      Map<string, AsepriteFileBitmap>
    >();
    for (const asepriteFile of availableAsepriteFiles) {
      const sprite = asepriteFile.sprite.clone();
      if (!sprite.name) {
        sprite.name = asepriteFile.file.name.replace(/\.(aseprite|ase)$/i, "");
      }
      bitmapsBySpriteIndex.set(
        resultSheet.sprites.length,
        new Map(
          asepriteFile.bitmaps.map((bitmap) => [
            `${bitmap.frameIndex}:${bitmap.layerIndex}`,
            bitmap
          ])
        )
      );
      resultSheet.sprites.push(sprite);
    }
    for (const spriteJson of availableSprites) {
      const pngFileName = spriteJson.meta.image;
      const referencedProcessedPng = availablePngsByName.get(pngFileName);
      if (!referencedProcessedPng) continue;
      const sprite = await importAsepriteSheetExport(spriteJson, {
        pngArray: new Uint8Array(
          await (
            await fetch(referencedProcessedPng.imageUrl ?? "")
          ).arrayBuffer()
        ),
        debug: true
      });
      resultSheet.sprites.push(sprite);
    }
    if (!resultSheet.sprites.length) {
      setProcessing(false);
      return;
    }
    const packed = (await packSpriteSheet(resultSheet, {
      tiles: (spriteIndex, frameIndex, frameLayer) =>
        bitmapsBySpriteIndex
          .get(spriteIndex)
          ?.get(`${frameIndex}:${frameLayer.layerIndex}`)
    })) as Data.SpriteSheetData;
    const packedProto = packed.toProto();
    const packedArray = toBinary(Protos.SpriteSheetSchema, packedProto);
    let imageUrl: string | undefined;
    if (
      Data.isEmbeddedSpriteSheetData(packed.pixelSource) &&
      packed.pixelSource.pngData !== undefined
    ) {
      imageUrl = URL.createObjectURL(
        new Blob([new Uint8Array(packed.pixelSource.pngData)], {
          type: "image/png"
        })
      );
    }
    const result: ProtoSpriteResult = {
      type: "sprite/protosprite",
      data: packed,
      imageUrl,
      fileSize: packedArray.length,
      blobUrl: URL.createObjectURL(new Blob([packedArray]))
    };
    setProcessedFile(result);
    setProcessing(false);
    processIState.onPreview?.(packed);
  }, [processIState]);

  const onProcessed = useCallback(
    async (processed: UploadedFile) => {
      let fileMatched = false;
      for (const file of processIState.allFiles) {
        if (processed.file.path === file.path) {
          fileMatched = true;
          break;
        }
      }
      if (!fileMatched) return;
      let alreadyHandled = false;
      for (const processedFile of processIState.allProcessedFiles) {
        if (processedFile.file.path === processed.file.path) {
          alreadyHandled = true;
          break;
        }
      }
      if (alreadyHandled) return;
      processIState.allProcessedFiles.push(processed);
      onProcessedFilesUpdate();
    },
    [processIState, onProcessedFilesUpdate]
  );

  const onRemoveFile = useCallback(
    (file: FileWithPath) => {
      setProcessedFile(null);
      setAllFiles((currentFiles) =>
        currentFiles.filter((currentFile) => file.path !== currentFile.path)
      );
      processIState.allProcessedFiles = processIState.allProcessedFiles.filter(
        (processed) => processed.file.path !== file.path
      );
      onProcessedFilesUpdate();
    },
    [processIState, onProcessedFilesUpdate]
  );

  const fileSizeString = useMemo(() => {
    if (processedFile?.fileSize === undefined) return "...loading...";
    if (processedFile.fileSize > 1000000)
      return `${processedFile.fileSize / 1000000} MB`;
    if (processedFile.fileSize > 1000)
      return `${processedFile.fileSize / 1000} KB`;
    return `${processedFile.fileSize} Bytes`;
  }, [processedFile?.fileSize]);

  const onDownloadResult = useCallback(async () => {
    if (!processedFile?.blobUrl) return;
    const res = await fetch(processedFile.blobUrl);
    download(await res.blob(), "packed.prs");
  }, [processedFile]);

  return (
    <div className="converter">
      <div {...getRootProps({ className: "uploader" })}>
        <input {...getInputProps()} />
        {allFiles.length > 0 && (
          <div className="upload-previews">
            {allFiles.map((file) => (
              <DisplayFile
                key={file.relativePath ?? file.path ?? ""}
                file={file}
                onProcessed={onProcessed}
                onRemove={onRemoveFile}
              />
            ))}
          </div>
        )}
        <div className="upload-text">
          <div>Upload Sprite(s):</div>
          <div>.aseprite</div>
          <div>.png + .json</div>
          <div>or .prs</div>
        </div>
      </div>
      {allFiles.length > 0 && (
        <FontAwesomeIcon
          className={cx("transitioning-icon", isProcessing && "processing")}
          icon={faChevronRight}
        />
      )}
      {processedFile && (
        <div className="downloader" onClick={onDownloadResult}>
          <div className="display-file">
            <div className="download-display-file"><FontAwesomeIcon className="icon" icon={faDownload} /></div>
            {processedFile.imageUrl && (
              <div className="preview">
                <img src={processedFile.imageUrl} alt="sprite sheet"/>
              </div>
            )}
            {processedFile?.type && (
              <div className="file-type">{processedFile.type}</div>
            )}
            <div className="file-size">{fileSizeString}</div>
          </div>
        </div>
      )}
    </div>
  );
}

type DisplayFileProps = {
  file: FileWithPath;
  onProcessed?: (processed: UploadedFile) => void;
  onRemove?: (file: FileWithPath) => void;
};

function DisplayFile(props: DisplayFileProps) {
  const { file, onProcessed, onRemove } = props;
  const [processedFile, setProcessedFile] = useState<UploadedFile | null>(null);
  const iState = useMemo<{
    file: FileWithPath;
    processing?: boolean;
    processed?: boolean;
  }>(() => ({ file }), [file]);

  useEffect(() => {
    if (iState.processed || iState.processing) return;
    iState.processing = true;

    const processPng = async () => {
      const buff = await iState.file.arrayBuffer();
      const blob = new Blob([buff], { type: "image/png" });
      const objectUrl = URL.createObjectURL(blob);
      setProcessedFile({
        type: "image/png",
        file: iState.file,
        fileSize: iState.file.size,
        imageUrl: objectUrl
      });
      iState.processed = true;
    };

    const processJsonFile = async () => {
      const buff = await iState.file.text();
      const json = JSON.parse(buff);
      setProcessedFile({
        type: "application/json",
        file: iState.file,
        fileSize: iState.file.size,
        json
      });
      iState.processed = true;
    };

    const processProtoSprite = async () => {
      const buff = await iState.file.arrayBuffer();
      const spriteSheetProto = fromBinary(
        Protos.SpriteSheetSchema,
        new Uint8Array(buff)
      );
      const spriteSheetData = Data.SpriteSheetData.fromProto(spriteSheetProto);
      let imageUrl: string | undefined;
      if (
        Data.isEmbeddedSpriteSheetData(spriteSheetData.pixelSource) &&
        spriteSheetData.pixelSource.pngData
      ) {
        const blob = new Blob(
          [new Uint8Array(spriteSheetData.pixelSource.pngData)],
          { type: "image/png" }
        );
        imageUrl = URL.createObjectURL(blob);
      }
      setProcessedFile({
        type: "sprite/protosprite",
        file: iState.file,
        fileSize: iState.file.size,
        spriteSheetData,
        imageUrl
      });
      iState.processed = true;
    };

    /**
     * Read a `.aseprite` file in the browser: no Aseprite install, no server,
     * the file never leaves the page.
     */
    const processAsepriteFile = async () => {
      const buff = await iState.file.arrayBuffer();
      try {
        const { sprite, bitmaps } = importAsepriteFile(new Uint8Array(buff), {
          spriteName: iState.file.name.replace(/\.(aseprite|ase)$/i, "")
        });
        setProcessedFile({
          type: "sprite/aseprite",
          file: iState.file,
          fileSize: iState.file.size,
          sprite,
          bitmaps,
          imageUrl: renderAsepriteThumbnail(sprite, bitmaps)
        });
      } catch (err) {
        // Tilemap layers and damaged files raise named errors. Showing the
        // reason beats a tile that silently never finishes loading.
        setProcessedFile({
          type: "error",
          file: iState.file,
          fileSize: iState.file.size,
          message: err instanceof Error ? err.message : String(err)
        });
      }
      iState.processed = true;
    };

    if (iState.file.name.endsWith(".prs")) {
      processProtoSprite();
      return;
    }

    if (isAsepriteFileName(iState.file.name)) {
      processAsepriteFile();
      return;
    }

    switch (iState.file.type) {
      case "image/png": {
        processPng();
        break;
      }
      case "application/json": {
        processJsonFile();
        break;
      }
      default:
        setProcessedFile(null);
        iState.processed = true;
        break;
    }
  }, [iState]);

  let content: React.ReactNode = null;
  if (processedFile) {
    switch (processedFile.type) {
      case "image/png":
        content = <img src={processedFile.imageUrl} alt="sprite sheet"/>;
        break;
      case "application/json":
        content = <div className="standin">{"{ }"}</div>;
        break;
      case "sprite/protosprite":
        content = <img src={processedFile.imageUrl} alt="sprite sheet"/>;
        break;
      case "sprite/aseprite":
        content = <img src={processedFile.imageUrl} alt="aseprite sprite" />;
        break;
      case "error":
        content = <div className="file-error">{processedFile.message}</div>;
        break;
    }
  } else {
    content = <div>( Uploading )</div>;
  }

  const plural = (count: number, noun: string) =>
    `${count} ${noun}${count === 1 ? "" : "s"}`;

  // What was read out of the file, for .aseprite input. Its own row rather
  // than an overlay, so it cannot land on top of the type and size bars.
  const detail =
    processedFile?.type === "sprite/aseprite"
      ? [
          plural(processedFile.sprite.frames.length, "frame"),
          plural(processedFile.sprite.layers.length, "layer"),
          plural(processedFile.sprite.animations.length, "tag")
        ].join(", ")
      : null;

  useEffect(() => {
    if (processedFile) onProcessed?.(processedFile);
  }, [processedFile, onProcessed]);

  const onClickCapture = useCallback<MouseEventHandler>((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const fileSizeString = useMemo(() => {
    if (processedFile?.fileSize === undefined) return "...loading...";
    if (processedFile.fileSize > 1000000)
      return `${processedFile.fileSize / 1000000} MB`;
    if (processedFile.fileSize > 1000)
      return `${processedFile.fileSize / 1000} KB`;
    return `${processedFile.fileSize} Bytes`;
  }, [processedFile?.fileSize]);

  return (
    <div className="display-file" onClick={onClickCapture}>
      <div className="file-name">{file.name}</div>
      <div className="preview">{content}</div>
      {detail && <div className="file-detail">{detail}</div>}
      {processedFile?.type && (
        <div className="file-type">{processedFile.type}</div>
      )}
      <div className="file-size">{fileSizeString}</div>
      <div className="remove" onClickCapture={() => onRemove?.(file)}>
        <FontAwesomeIcon icon={faClose} />
      </div>
    </div>
  );
}
