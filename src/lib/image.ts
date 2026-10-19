/**
 * Client-side image prep.
 *
 * Photos go straight from the browser to Replicate as data URIs, so there's
 * no upload bucket, no database, and no disk involved. Replicate recommends
 * data URIs stay under 1MB, so every photo is downscaled and, if it's still
 * too heavy, re-encoded at lower quality or a smaller size until it fits.
 * At the sizes this model works with, that costs nothing visible.
 */

const MAX_EDGE = 1536;
const MIN_EDGE = 768;
const QUALITIES = [0.9, 0.82, 0.74, 0.66];
// Replicate's guidance is "under 1MB" for data URIs; leave some headroom.
const MAX_DATA_URL_CHARS = 950_000;

export type PreparedImage = {
  id: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
};

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Couldn't read ${file.name}.`));
    };
    image.src = url;
  });
}

function encode(source: HTMLImageElement, longEdge: number) {
  const scale = Math.min(1, longEdge / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser blocked image processing.");
  context.drawImage(source, 0, 0, width, height);

  let dataUrl = "";
  for (const quality of QUALITIES) {
    dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.length <= MAX_DATA_URL_CHARS) break;
  }
  return { dataUrl, width, height };
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  const source = await loadImage(file);

  // Very detailed photos can stay heavy even at lower quality; step the size
  // down until the encoded photo fits.
  let edge = MAX_EDGE;
  let result = encode(source, edge);
  while (result.dataUrl.length > MAX_DATA_URL_CHARS && edge > MIN_EDGE) {
    edge = Math.max(MIN_EDGE, Math.round(edge * 0.85));
    result = encode(source, edge);
  }

  return {
    id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
    name: file.name,
    ...result,
  };
}
