import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, UserRound } from "lucide-react";
import type { LifeStage, PhotoTransform, StagePhoto } from "../types";
import { useI18n } from "../i18n";
import { PhotoEditor } from "./PhotoEditor";

export function CharacterPhotoInput({
  stage,
  onChange,
  onReadingChange,
}: {
  stage: LifeStage;
  onChange: (stageId: string, photo: StagePhoto | undefined) => void;
  onReadingChange: (reading: boolean) => void;
}) {
  const { t, valueLabel } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const reader = useRef<FileReader | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [crop, setCrop] = useState<{ original: string; transform?: PhotoTransform }>();
  useEffect(() => {
    onReadingChange(reading);
  }, [reading, onReadingChange]);
  useEffect(() => () => onReadingChange(false), [onReadingChange]);
  useEffect(
    () => () => {
      if (reader.current) {
        reader.current.onload = null;
        reader.current.onerror = null;
        reader.current.abort();
        reader.current = null;
      }
    },
    [],
  );
  const acceptFile = (file?: File) => {
    if (!file) return;
    setError("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("unsupportedImage");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError("fileTooLarge");
      return;
    }
    reader.current?.abort();
    const next = new FileReader();
    reader.current = next;
    setReading(true);
    next.onload = () => {
      if (reader.current !== next) return;
      reader.current = null;
      setReading(false);
      setCrop({ original: String(next.result) });
    };
    next.onerror = () => {
      if (reader.current !== next) return;
      reader.current = null;
      setReading(false);
      setError("imageReadError");
    };
    next.readAsDataURL(file);
  };
  const photo = stage.photo;
  return (
    <section className="character-photo-input span-2" aria-label={t("profilePhoto")}>
      <div className="character-photo-preview">
        {photo ? <img src={photo.edited || photo.original} alt={t("profilePhoto")} /> : <UserRound size={32} />}
      </div>
      <div className="character-photo-controls">
        <strong>{t("profilePhoto")}</strong>
        <small>{t("profilePhotoStage", { stage: valueLabel(stage.name) })}</small>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label={t("uploadProfilePhoto")}
          hidden
          onChange={(event) => {
            acceptFile(event.target.files?.[0]);
            event.currentTarget.value = "";
          }}
        />
        <div className="character-photo-actions">
          <button className="button subtle" disabled={reading} onClick={() => input.current?.click()}>
            <Camera size={16} />
            {t(reading ? "readingPhoto" : photo ? "replaceProfilePhoto" : "uploadProfilePhoto")}
          </button>
          {photo && (
            <>
              <button
                className="button ghost"
                onClick={() => setCrop({ original: photo.original, transform: photo.transform })}
              >
                {t("editPhoto")}
              </button>
              <button className="button ghost danger-text" onClick={() => onChange(stage.id, undefined)}>
                {t("removePhoto")}
              </button>
            </>
          )}
        </div>
        {error && <p role="alert">{t(error)}</p>}
      </div>
      {crop &&
        createPortal(
          <PhotoEditor
            source={crop.original}
            initialTransform={crop.transform}
            onClose={() => setCrop(undefined)}
            onSave={(edited, transform) => {
              onChange(stage.id, { original: crop.original, edited, transform, updatedAt: new Date().toISOString() });
              setCrop(undefined);
            }}
          />,
          document.body,
        )}
    </section>
  );
}
