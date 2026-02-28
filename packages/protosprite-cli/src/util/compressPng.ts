import PngQuant from "pngquant";

export async function compressPng(
  pngData: Uint8Array,
  colors: number = 256
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const pngQuant = new PngQuant([
      String(colors),
      "--quality",
      "80-100",
      "--speed",
      "1"
    ]);

    pngQuant.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    pngQuant.on("error", (err: Error & { code?: number }) => {
      // Exit code 99 means quality floor was not met; return original data.
      if (err.code === 99) {
        resolve(pngData);
        return;
      }
      reject(err);
    });

    pngQuant.on("end", () => {
      const result = Buffer.concat(chunks);
      resolve(new Uint8Array(result));
    });

    pngQuant.end(Buffer.from(pngData));
  });
}
