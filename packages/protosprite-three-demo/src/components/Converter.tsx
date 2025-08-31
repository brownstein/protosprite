import { fromBinary } from "@bufbuild/protobuf";
import { faChevronRight, faClose } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Data, Protos } from "protosprite-core";
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
  imageUrl?: string;
  fileSize: number;
};

type JsonFileToDisplay = {
  type: "application/json";
  file: FileWithPath;
  fileSize: number;
};

type ProtoSpriteFileToDisplay = {
  type: "sprite/protosprite";
  file: FileWithPath;
  spriteSheetData: Data.SpriteSheetData;
  imageUrl?: string;
  fileSize: number;
};

type UploadedFile =
  | PngFileToDisplay
  | JsonFileToDisplay
  | ProtoSpriteFileToDisplay;

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

  // const iState = useMemo(
  //   () => ({
  //     currentFiles: [] as FileWithPath[],
  //     processingPngUploads: new WeakSet<FileWithPath>(),
  //     processingJsonUploads: new WeakSet<FileWithPath>()
  //   }),
  //   []
  // );
  // const [displayFiles, setDisplayFiles] = useState<UploadedFile[]>([]);

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
        <>
          <FontAwesomeIcon
            className="transitioning-icon"
            icon={faChevronRight}
          />
          <div className="downloader"></div>
        </>
      )}
    </div>
  );
}

type DisplayFileProps = {
  file: FileWithPath;
  onProcessed?: (file: UploadedFile) => void;
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
        const process = async () => {
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
        process();
        break;
      }
      case "application/json": {
        setProcessedFile({
          type: "application/json",
          file,
          fileSize: file.size
        });
        iState.processed = true;
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
