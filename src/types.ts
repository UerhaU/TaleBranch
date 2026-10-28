export type CharacterType = "sim" | "pet" | "custom";
export type CharacterStatus = "alive" | "dead" | "missing" | "unknown";
export type Theme = "dark" | "light";

export interface StagePhoto {
  original: string;
  edited: string;
  updatedAt: string;
  transform?: PhotoTransform;
}

export interface PhotoTransform {
  zoom: number;
  x: number;
  y: number;
  rotation: number;
  flipped: boolean;
}

export interface SkillValue {
  id: string;
  level: number;
}
export interface PreferenceValue {
  id: string;
  rating: "like" | "dislike";
}
export interface CareerPeriod {
  id: string;
  careerId: string;
  customName: string;
  branch: string;
  title: string;
  level?: number;
  start: string;
  end: string;
  current: boolean;
  notes: string;
}

/** Only references and character values; the shared game catalog is not copied into projects. */
export interface CharacterCatalog {
  version: 1;
  traitIds: string[];
  aspirationId: string;
  occultIds: string[];
  breedId: string;
  customBreed: string;
  neutered: "unknown" | "yes" | "no";
  deathCauseId: string;
  skills: SkillValue[];
  preferences: PreferenceValue[];
  careers: CareerPeriod[];
  /** The user's own values that are not in the game catalog. */
  customTraits: string[];
  customAspiration: string;
  customOccults: string[];
  customDeathCause: string;
  customSkills: string[];
  customPreferences: string[];
}

export interface LifeStage {
  id: string;
  name: string;
  order: number;
  photo?: StagePhoto;
}

export interface Character {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  aliases: string[];
  type: CharacterType;
  species: string;
  lifeStage: string;
  status: CharacterStatus;
  pronouns: string;
  gender: string;
  birthDate: string;
  deathDate: string;
  generation: number;
  household: string;
  world: string;
  lot: string;
  education: string;
  biography: string;
  notes: string;
  tags: string[];
  color: string;
  ownerIds?: string[];
  catalog?: CharacterCatalog;
  stages: LifeStage[];
  createdAt: string;
  updatedAt: string;
}

export interface ParentLink {
  id: string;
  parentId: string;
  childId: string;
  kind: string;
  parentRole: string;
  childRole: string;
  biological: "yes" | "no" | "unknown";
  active: boolean;
  comment: string;
}

export type RelationshipDirection = "mutual" | "a-to-b" | "b-to-a";

export interface RelationshipLabel {
  id: string;
  name: string;
  color: string;
  icon: string;
  direction: RelationshipDirection;
  active: boolean;
  publicity: "open" | "secret" | "unknown";
  comment: string;
}

export interface PairLink {
  id: string;
  aId: string;
  bId: string;
  labels: RelationshipLabel[];
}

export interface NodePosition {
  x: number;
  y: number;
}

export interface Project {
  formatVersion: 1;
  id: string;
  name: string;
  description: string;
  worldName: string;
  createdAt: string;
  updatedAt: string;
  characters: Character[];
  parentLinks: ParentLink[];
  pairLinks: PairLink[];
  positions: Record<string, NodePosition>;
  trashedCharacters: Character[];
  trashLinks?: { parentLinks: ParentLink[]; pairLinks: PairLink[]; positions: Record<string, NodePosition> };
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  worldName: string;
  updatedAt: string;
  characterCount: number;
}

export interface HistoryState {
  past: Project[];
  present: Project;
  future: Project[];
}
