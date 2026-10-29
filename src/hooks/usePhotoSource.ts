import { useEffect, useState } from "react";
import { cropPhoto, drawnCrop } from "../lib/photo";
import type { StagePhoto } from "../types";

/** The picture to show for a photo: its crop, drawn from the original when it was loaded from disk. */
export function usePhotoSource(photo: StagePhoto | undefined): string | undefined {
  const [crop, setCrop] = useState<{ photo: StagePhoto; url: string }>();
  const needsDrawing = Boolean(photo && !photo.edited && photo.transform);
  useEffect(() => {
    if (!photo || !needsDrawing) return;
    let live = true;
    cropPhoto(photo.original, photo.transform!)
      .then((url) => live && setCrop({ photo, url }))
      // The uncropped original is still shown.
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [photo, needsDrawing]);
  if (!photo) return undefined;
  if (photo.edited) return photo.edited;
  if (!photo.transform) return photo.original;
  if (crop?.photo === photo) return crop.url;
  return drawnCrop(photo.original, photo.transform) ?? photo.original;
}
