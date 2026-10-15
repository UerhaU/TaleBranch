import type { PhotoTransform } from "../types";

export const initialPhotoTransform: PhotoTransform = { zoom: 1, x: 0, y: 0, rotation: 0, flipped: false };

/** One rendering path for the square preview, circular preview and saved result. */
export function drawPhoto(context: CanvasRenderingContext2D, image: HTMLImageElement, transform: PhotoTransform, size = 800) {
  const rotated = Math.abs(transform.rotation % 180) === 90;
  const width = rotated ? image.naturalHeight : image.naturalWidth;
  const height = rotated ? image.naturalWidth : image.naturalHeight;
  const scale = Math.max(size / width, size / height) * transform.zoom;
  context.clearRect(0, 0, size, size);
  context.fillStyle = "#FFF4EB";
  context.fillRect(0, 0, size, size);
  context.save();
  context.translate(size / 2 + transform.x * size, size / 2 + transform.y * size);
  context.rotate(transform.rotation * Math.PI / 180);
  context.scale(transform.flipped ? -scale : scale, scale);
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  context.restore();
}
