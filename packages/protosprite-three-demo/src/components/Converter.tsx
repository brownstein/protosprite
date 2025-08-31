import { JsonValue, fromBinary, fromJson, toBinary } from "@bufbuild/protobuf";
import { faChevronRight, faClose } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import * as Aseprite from "@kayahr/aseprite";
import cx from "classnames";
import { Data, ProtoSpriteSheet, Protos } from "protosprite-core";
import { importAsepriteSheetExport } from "protosprite-core/importers/aseprite";
import { packSpriteSheet } from "protosprite-core/transform";
import {
  MouseEventHandler,
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import { FileWithPath, useDropzone } from "react-dropzone";

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

type UploadedFile =
  | PngFileToDisplay
  | JsonFileToDisplay
  | ProtoSpriteFileToDisplay;

type ProtoSpriteDownload = {
  type: "sprite/protosprite";
  imageUrl?: string;
  fileSize: number;
  blobUrl: string;
};

export function Converter(props: ConverterProps) {
  const [allFiles, setAllFiles] = useState<FileWithPath[]>([]);

  const { getRootProps, getInputProps } = useDropzone({
    accept: {
      "image/png": [".png"],
      "application/json": [".json"],
      "sprite/protosprite": [".prs"]
    },
    onDropAccepted(files) {
      setAllFiles((currentFiles) => [...currentFiles, ...files]);
    }
  });
  const onRemoveFile = useCallback(
    (file: FileWithPath) =>
      setAllFiles((currentFiles) =>
        currentFiles.filter((currentFile) => file.path !== currentFile.path)
      ),
    []
  );

  const [isProcessing, setProcessing] = useState(false);
  const [processedFile, setProcessedFile] =
    useState<ProtoSpriteDownload | null>(null);
  const processIState = useMemo(
    () => ({
      allFiles,
      allProcessedFiles: [] as UploadedFile[]
    }),
    []
  );
  processIState.allFiles = allFiles;

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

      // Ok, now for the fun part. We get to check if we have all data and can pack
      // a resulting sprite sheet.
      const availablePngsByName = new Map<string, PngFileToDisplay>();
      const availableSprites: Aseprite.SpriteSheet[] = [];
      let resultSheet = new Data.SpriteSheetData();
      for (const processed of processIState.allProcessedFiles) {
        switch (processed.type) {
          case "application/json":
            availableSprites.push(processed.json as Aseprite.SpriteSheet);
            break;
          case "image/png":
            availablePngsByName.set(processed.file.name, processed);
            break;
          case "sprite/protosprite":
            resultSheet = processed.spriteSheetData.clone();
            break;
        }
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
          frameNameFormat: "{title} ({layer}) {frame}.{extension}",
          debug: true
        });
        resultSheet.sprites.push(sprite);
      }
      const packed = await packSpriteSheet(resultSheet);
      const packedProto = packed.toProto();
      const packedArray = toBinary(Protos.SpriteSheetSchema, packedProto);
      setProcessedFile({
        type: "sprite/protosprite",
        fileSize: packedArray.length,
        blobUrl: URL.createObjectURL(new Blob([packedArray]))
      });
    },
    [processIState]
  );

  const fileSizeString = useMemo(() => {
    if (processedFile?.fileSize === undefined) return "...loading...";
    if (processedFile.fileSize > 1000000)
      return `${processedFile.fileSize / 1000000} MB`;
    if (processedFile.fileSize > 1000)
      return `${processedFile.fileSize / 1000} KB`;
    return `${processedFile.fileSize} Bytes`;
  }, [processedFile?.fileSize]);

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
          <div>Upload Sprites(s):</div>
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
        <div className="downloader">
          <div className="display-file">
            <div className="file-name">result</div>
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
        file,
        fileSize: file.size,
        imageUrl: objectUrl
      });
      iState.processed = true;
    };

    const processJsonFile = async () => {
      const buff = await iState.file.text();
      const json = JSON.parse(buff);
      setProcessedFile({
        type: "application/json",
        file,
        fileSize: file.size,
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
        file,
        fileSize: file.size,
        spriteSheetData,
        imageUrl
      });
      iState.processed = true;
    };

    if (iState.file.name.endsWith(".prs")) {
      processProtoSprite();
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
        content = <img src={processedFile.imageUrl} />;
        break;
      case "application/json":
        content = <div className="standin">{"{ }"}</div>;
        break;
      case "sprite/protosprite":
        content = <img src={processedFile.imageUrl} />;
        break;
    }
  } else {
    content = <div>( Uploading )</div>;
  }

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
