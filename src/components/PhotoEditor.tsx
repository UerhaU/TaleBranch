import { useEffect, useRef, useState } from "react";
import { Check, FlipHorizontal2, ImagePlus, RotateCcw, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { Modal } from "./Modal";
import { useI18n } from "../i18n";
import { drawPhoto, initialPhotoTransform } from "../lib/photo";
import type { PhotoTransform } from "../types";

export function PhotoEditor({
  source,
  initialTransform,
  onClose,
  onSave,
}: {
  source: string;
  initialTransform?: PhotoTransform;
  onClose: () => void;
  onSave: (edited: string, transform: PhotoTransform) => void;
}) {
  const { t } = useI18n();
  const [transform, setTransform] = useState(initialTransform ?? initialPhotoTransform);
  const [history, setHistory] = useState<PhotoTransform[]>([]);
  const [future, setFuture] = useState<PhotoTransform[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [preview, setPreview] = useState("");
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragOrigin = useRef<{ x: number; y: number; transform: PhotoTransform } | null>(null);

  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      setLoaded(true);
    };
    image.onerror = () => setFailed(true);
    image.src = source;
    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, [source]);

  const render = () => {
    if (!imageRef.current) return "";
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 800;
    const context = canvas.getContext("2d");
    if (!context) return "";
    drawPhoto(context, imageRef.current, transform);
    return canvas.toDataURL("image/webp", 0.9);
  };

  useEffect(() => {
    if (loaded) setPreview(render());
  }, [loaded, transform]);

  const apply = (patch: Partial<PhotoTransform>) => {
    setHistory((items) => [...items.slice(-49), transform]);
    setFuture([]);
    setTransform({ ...transform, ...patch });
  };
  const undo = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setFuture((items) => [transform, ...items]);
    setHistory((items) => items.slice(0, -1));
    setTransform(previous);
  };
  const redo = () => {
    const next = future[0];
    if (!next) return;
    setHistory((items) => [...items, transform]);
    setFuture((items) => items.slice(1));
    setTransform(next);
  };

  return (
    <Modal
      title={t("cropPhoto")}
      subtitle={t("cropPhotoHint")}
      onClose={onClose}
      wide
      onKeyDown={(event) => {
        if (!(event.ctrlKey || event.metaKey)) return;
        const key = event.key.toLowerCase();
        if (key === "z" || key === "y") {
          event.preventDefault();
          event.stopPropagation();
          key === "y" || event.shiftKey ? redo() : undo();
        }
      }}
    >
      <div className="photo-editor">
        <div className="crop-stage">
          <div
            className="crop-frame"
            role="img"
            aria-label={t("preview")}
            onPointerDown={(event) => {
              if (!loaded) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              dragOrigin.current = { x: event.clientX, y: event.clientY, transform };
              setHistory((items) => [...items.slice(-49), transform]);
              setFuture([]);
            }}
            onPointerMove={(event) => {
              const origin = dragOrigin.current;
              if (!origin) return;
              const width = event.currentTarget.getBoundingClientRect().width;
              setTransform({
                ...origin.transform,
                x: Math.max(-1, Math.min(1, origin.transform.x + (event.clientX - origin.x) / width)),
                y: Math.max(-1, Math.min(1, origin.transform.y + (event.clientY - origin.y) / width)),
              });
            }}
            onPointerUp={() => {
              dragOrigin.current = null;
            }}
            onPointerCancel={() => {
              dragOrigin.current = null;
            }}
          >
            {preview && <img src={preview} alt={t("preview")} draggable={false} />}
            <div className="crop-grid" />
            {failed && <p role="alert">{t("imageReadError")}</p>}
          </div>
          <div className="circle-preview">{preview && <img src={preview} alt="" draggable={false} />}</div>
        </div>
        <aside className="photo-tools">
          <span className="eyebrow">{t("scalePosition")}</span>
          <div className="range-row">
            <ZoomOut size={17} />
            <input
              aria-label={t("scalePosition")}
              type="range"
              min="1"
              max="3"
              step="0.05"
              value={transform.zoom}
              onChange={(event) => apply({ zoom: Number(event.target.value) })}
            />
            <ZoomIn size={17} />
          </div>
          <label className="field">
            <span>{t("horizontal")}</span>
            <input
              type="range"
              min="-1"
              max="1"
              step="0.01"
              value={transform.x}
              onChange={(event) => apply({ x: Number(event.target.value) })}
            />
          </label>
          <label className="field">
            <span>{t("vertical")}</span>
            <input
              type="range"
              min="-1"
              max="1"
              step="0.01"
              value={transform.y}
              onChange={(event) => apply({ y: Number(event.target.value) })}
            />
          </label>
          <div className="photo-action-grid">
            <button onClick={() => apply({ rotation: (transform.rotation - 90) % 360 })}>
              <RotateCcw size={17} /> −90°
            </button>
            <button onClick={() => apply({ rotation: (transform.rotation + 90) % 360 })}>
              <RotateCw size={17} /> +90°
            </button>
            <button onClick={() => apply({ flipped: !transform.flipped })}>
              <FlipHorizontal2 size={17} /> {t("flip")}
            </button>
            <button onClick={() => apply(initialPhotoTransform)}>
              <ImagePlus size={17} /> {t("reset")}
            </button>
          </div>
          <div className="history-actions">
            <button disabled={!history.length} onClick={undo}>
              {t("undo")}
            </button>
            <button disabled={!future.length} onClick={redo}>
              {t("redo")}
            </button>
          </div>
        </aside>
      </div>
      <footer className="modal-footer">
        <button className="button ghost" onClick={onClose}>
          {t("doNotChange")}
        </button>
        <button
          className="button primary"
          disabled={!loaded || failed || !preview}
          onClick={() => {
            const edited = render();
            if (edited) onSave(edited, transform);
          }}
        >
          <Check size={17} /> {t("saveCrop")}
        </button>
      </footer>
    </Modal>
  );
}
