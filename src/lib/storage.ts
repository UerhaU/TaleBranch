import type { Project } from "../types";
import { makeId } from "./id";
import { parseProject } from "./validation";

/** The dynasty.json and export format. */
async function contentHash(project: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(project));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function serializeProject(project: Project): Promise<string> {
  return JSON.stringify(
    { app: "dynasty-chronicles", formatVersion: 1, contentHash: await contentHash(project), project },
    null,
    2,
  );
}

export async function readProjectDocument(text: string): Promise<Project> {
  const raw = JSON.parse(text);
  if (!raw || raw.app !== "dynasty-chronicles" || raw.formatVersion !== 1) throw new Error("INVALID_PROJECT_FORMAT");
  if (raw.contentHash !== undefined && raw.contentHash !== (await contentHash(raw.project)))
    throw new Error("PROJECT_CHECKSUM_MISMATCH");
  const project = parseProject(raw.project);
  if (
    raw.checksum !== undefined &&
    raw.checksum !== `${project.characters.length}:${project.parentLinks.length}:${project.pairLinks.length}`
  )
    throw new Error("PROJECT_CHECKSUM_MISMATCH");
  return project;
}

/** A .dynasty-tree export: the same manifest that import accepts. */
export async function exportDocument(project: Project): Promise<{ filename: string; contents: string }> {
  const manifest = {
    app: "dynasty-chronicles",
    formatVersion: project.formatVersion,
    exportedAt: new Date().toISOString(),
    checksum: `${project.characters.length}:${project.parentLinks.length}:${project.pairLinks.length}`,
    contentHash: await contentHash(project),
    project,
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
