import type { PhotoTransform } from "../types";

export const initialPhotoTransform: PhotoTransform = { zoom: 1, x: 0, y: 0, rotation: 0, flipped: false };

/** One rendering path for the square preview, circular preview and saved result. */
export function drawPhoto(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  transform: PhotoTransform,
  size = 800,
) {
  const rotated = Math.abs(transform.rotation % 180) === 90;
  const width = rotated ? image.naturalHeight : image.naturalWidth;
  const height = rotated ? image.naturalWidth : image.naturalHeight;
  const scale = Math.max(size / width, size / height) * transform.zoom;
  context.clearRect(0, 0, size, size);
  context.fillStyle = "#FFF4EB";
  context.fillRect(0, 0, size, size);
  context.save();
  context.translate(size / 2 + transform.x * size, size / 2 + transform.y * size);
  context.rotate((transform.rotation * Math.PI) / 180);
  context.scale(transform.flipped ? -scale : scale, scale);
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  context.restore();
}

// Crops drawn this session, by original picture and crop settings. Small, so they are kept.
const crops = new Map<string, Map<string, Promise<string>>>();
const drawn = new Map<string, Map<string, string>>();
const cropKey = (transform: PhotoTransform) =>
  `${transform.zoom}|${transform.x}|${transform.y}|${transform.rotation}|${transform.flipped}`;

/** A crop that is already drawn, without waiting. */
export function drawnCrop(original: string, transform: PhotoTransform): string | undefined {
  return drawn.get(original)?.get(cropKey(transform));
}

/** dynasty.json keeps only the original and its crop settings; the crop is drawn again for display. */
export function cropPhoto(original: string, transform: PhotoTransform, size = 400): Promise<string> {
  const key = cropKey(transform);
  let byTransform = crops.get(original);
  if (!byTransform) crops.set(original, (byTransform = new Map()));
  let crop = byTransform.get(key);
  if (!crop) {
    crop = new Promise<string>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const context = canvas.getContext("2d");
        if (!context) return reject(new Error("NO_CANVAS"));
        drawPhoto(context, image, transform, size);
        canvas.toBlob(
          (blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error("NO_CROP"))),
          "image/webp",
          0.9,
        );
      };
      image.onerror = () => reject(new Error("IMAGE_READ_ERROR"));
      image.src = original;
    });
    byTransform.set(key, crop);
    crop.then(
      (url) => {
        if (!drawn.has(original)) drawn.set(original, new Map());
        drawn.get(original)!.set(key, url);
      },
      // A failed drawing may be tried again later.
      () => byTransform.delete(key),
    );
  }
  return crop;
}
