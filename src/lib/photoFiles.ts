import type { PhotoTransform, Project, StagePhoto } from "../types";

/** Pictures live in "<dynasty>/photos"; dynasty.json keeps only their file names. */
export const PHOTO_FOLDER = "photos";
/** Only files named by their content belong to the application; anything else in the folder is left alone. */
const PHOTO_FILE = /^[0-9a-f]{64}\.(?:jpg|png|webp)$/;
const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

export const isPhotoFile = (name: string) => PHOTO_FILE.test(name);

/** A photo in dynasty.json and exports. The crop is drawn again from the original and its transform. */
export interface StoredPhoto {
  file: string;
  /** Only for old photos saved without crop settings: their crop cannot be drawn again. */
  editedFile?: string;
  transform?: PhotoTransform;
  updatedAt: string;
}

/** The picture files of one dynasty folder. */
export interface PhotoFiles {
  list(): Promise<string[]>;
  /** A data URL, or undefined when the file is missing. */
  read(name: string): Promise<string | undefined>;
  write(name: string, dataUrl: string): Promise<void>;
  remove(name: string): Promise<void>;
}

const base64Of = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(",") + 1).replace(/\s+/g, "");
export const photoType = (name: string) => TYPES[name.slice(name.lastIndexOf(".") + 1)] ?? "image/jpeg";

export function dataUrlBytes(dataUrl: string): Uint8Array {
  const binary = atob(base64Of(dataUrl));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
export function bytesDataUrl(bytes: Uint8Array, type: string): string {
  let binary = "";
  // Chunks keep String.fromCharCode below the argument limit for large photos.
  for (let index = 0; index < bytes.length; index += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return `data:${type};base64,${btoa(binary)}`;
}

// The same picture string is kept by the project between saves; hash it only once.
const names = new Map<string, string>();
export async function photoFileName(dataUrl: string): Promise<string> {
  const known = names.get(dataUrl);
  if (known) return known;
  const type = dataUrl.slice(5, dataUrl.indexOf(";"));
  const hash = await crypto.subtle.digest("SHA-256", dataUrlBytes(dataUrl) as BufferSource);
  const hex = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const name = `${hex}.${EXTENSIONS[type] ?? "jpg"}`;
  if (names.size > 2000) names.clear();
  names.set(dataUrl, name);
  return name;
}

const fileReference = (name: string) => `${PHOTO_FOLDER}/${name}`;
/** "photos/<name>" from dynasty.json, or undefined for anything that is not one of our files. */
export function referencedFile(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.startsWith(`${PHOTO_FOLDER}/`)) return undefined;
  const name = value.slice(PHOTO_FOLDER.length + 1);
  return isPhotoFile(name) ? name : undefined;
}

export const hasPhotos = (project: Project) =>
  project.characters.some((character) => character.stages.some((stage) => stage.photo));

/** Replaces pictures with file names. `files` receives every picture the project refers to. */
export async function storePhotos(project: Project): Promise<{ project: Project; files: Map<string, string> }> {
  const files = new Map<string, string>();
  const store = async (photo: StagePhoto): Promise<StoredPhoto> => {
    const file = await photoFileName(photo.original);
    files.set(file, photo.original);
    let editedFile: string | undefined;
    if (!photo.transform && photo.edited && photo.edited !== photo.original) {
      editedFile = await photoFileName(photo.edited);
      files.set(editedFile, photo.edited);
    }
    return {
      file: fileReference(file),
      ...(editedFile ? { editedFile: fileReference(editedFile) } : {}),
      ...(photo.transform ? { transform: photo.transform } : {}),
      updatedAt: photo.updatedAt,
    };
  };
  const characters = await Promise.all(
    project.characters.map(async (character) =>
      character.stages.some((stage) => stage.photo)
        ? {
            ...character,
            stages: await Promise.all(
              character.stages.map(async (stage) =>
                stage.photo ? { ...stage, photo: (await store(stage.photo)) as unknown as StagePhoto } : stage,
              ),
            ),
          }
        : character,
    ),
  );
  return { project: { ...project, characters }, files };
}

/**
 * Puts the pictures back into a raw project before it is validated.
 * A missing file drops only its own photo; the rest of the dynasty still opens.
 */
export async function loadPhotos(raw: unknown, read: (name: string) => Promise<string | undefined>): Promise<unknown> {
  const cache = new Map<string, Promise<string | undefined>>();
  // One read per file, and one shared string when several stages use the same picture.
  const load = (name: string) => {
    let picture = cache.get(name);
    if (!picture) cache.set(name, (picture = read(name)));
    return picture;
  };
  const characters = (raw as { characters?: unknown })?.characters;
  if (!Array.isArray(characters)) return raw;
  for (const character of characters) {
    const stages = (character as { stages?: unknown })?.stages;
    if (!Array.isArray(stages)) continue;
    for (const stage of stages as Array<{ photo?: Record<string, unknown> }>) {
      const photo = stage?.photo;
      if (!photo || typeof photo !== "object" || photo.file === undefined) continue;
      const file = referencedFile(photo.file);
      if (!file) throw new Error("INVALID_PROJECT_FORMAT");
      const original = await load(file);
      if (!original) {
        console.warn(`Missing photo file ${file}`);
        delete stage.photo;
        continue;
      }
      const editedFile = photo.editedFile === undefined ? undefined : referencedFile(photo.editedFile);
      if (photo.editedFile !== undefined && !editedFile) throw new Error("INVALID_PROJECT_FORMAT");
      const edited = editedFile ? await load(editedFile) : undefined;
      stage.photo = { original, ...(edited ? { edited } : {}), transform: photo.transform, updatedAt: photo.updatedAt };
    }
  }
  return raw;
}
