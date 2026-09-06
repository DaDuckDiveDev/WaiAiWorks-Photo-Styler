/**
 * Client-side image prep.
 *
 * Photos go straight from the browser to the API as data URIs — there's no
 * upload bucket and no disk on the server. Downscaling first keeps the request
 * body small, keeps render times down, and costs nothing in output quality at
 * the sizes this model works with.
 */

const MAX_EDGE = 1536;
const QUALITY = 0.9;

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

export async function prepareImage(file: File): Promise<PreparedImage> {
  const source = await loadImage(file);

  const scale = Math.min(1, MAX_EDGE / Math.max(source.width, source.height));
  const width = Math.round(source.width * scale);
  const height = Math.round(source.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser blocked image processing.");
  context.drawImage(source, 0, 0, width, height);

  return {
    id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
    name: file.name,
    dataUrl: canvas.toDataURL("image/jpeg", QUALITY),
    width,
    height,
  };
}
