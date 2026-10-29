import type { Project } from "../types";
import { makeId } from "./id";
import { loadPhotos, storePhotos } from "./photoFiles";
import { parseProject } from "./validation";

/** The dynasty.json and export format. */
async function contentHash(project: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(project));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Version 2 means photos are separate files; a dynasty without photos stays readable by older versions. */
const documentVersion = (files: Map<string, string>) => (files.size ? 2 : 1);

/** dynasty.json text and the picture files it refers to by name. */
export async function serializeProject(project: Project): Promise<{ text: string; photos: Map<string, string> }> {
  const { project: stored, files } = await storePhotos(project);
  const text = JSON.stringify(
    {
      app: "dynasty-chronicles",
      formatVersion: documentVersion(files),
      contentHash: await contentHash(stored),
      project: stored,
    },
    null,
    2,
  );
  return { text, photos: files };
}

/**
 * Reads dynasty.json or an export. Photo files come from `readPhoto` (the dynasty folder)
 * or from the export itself; version 1 still has pictures inside the project.
 */
export async function readProjectDocument(
  text: string,
  readPhoto?: (name: string) => Promise<string | undefined>,
): Promise<Project> {
  const raw = JSON.parse(text);
  if (!raw || raw.app !== "dynasty-chronicles" || ![1, 2].includes(raw.formatVersion))
    throw new Error("INVALID_PROJECT_FORMAT");
  if (raw.contentHash !== undefined && raw.contentHash !== (await contentHash(raw.project)))
    throw new Error("PROJECT_CHECKSUM_MISMATCH");
  let body: unknown = raw.project;
  if (raw.formatVersion === 2) {
    const embedded: unknown = raw.photos;
    const read =
      embedded && typeof embedded === "object"
        ? async (name: string) => {
            const picture = (embedded as Record<string, unknown>)[name];
            return typeof picture === "string" && Object.hasOwn(embedded, name) ? picture : undefined;
          }
        : readPhoto;
    if (!read) throw new Error("PHOTOS_UNAVAILABLE");
    body = await loadPhotos(raw.project, read);
  }
  const project = parseProject(body);
  if (
    raw.checksum !== undefined &&
    raw.checksum !== `${project.characters.length}:${project.parentLinks.length}:${project.pairLinks.length}`
  )
    throw new Error("PROJECT_CHECKSUM_MISMATCH");
  return project;
}

/** A .dynasty-tree export: one file with every original photo inside, accepted by import. */
export async function exportDocument(project: Project): Promise<{ filename: string; contents: string }> {
  const { project: stored, files } = await storePhotos(project);
  const manifest = {
    app: "dynasty-chronicles",
    formatVersion: documentVersion(files),
    exportedAt: new Date().toISOString(),
    checksum: `${project.characters.length}:${project.parentLinks.length}:${project.pairLinks.length}`,
    contentHash: await contentHash(stored),
    project: stored,
    ...(files.size ? { photos: Object.fromEntries(files) } : {}),
  };
  const filename = `${project.name.replace(/[^\p{L}\p{N}_-]+/gu, "_") || "project"}.dynasty-tree`;
  return { filename, contents: JSON.stringify(manifest, null, 2) };
}

export async function importProject(file: File, copySuffix: string): Promise<Project> {
  const project = await readProjectDocument(await file.text());
  return {
    ...project,
    id: makeId("project"),
    name: `${project.name} — ${copySuffix}`,
    updatedAt: new Date().toISOString(),
  };
}
