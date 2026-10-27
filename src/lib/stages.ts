import type { CharacterType, LifeStage } from "../types";
import { makeId } from "./id";
import { gameCatalog, speciesId } from "./catalog";

const simStages = ["Новорождённый", "Младенец", "Малыш", "Ребёнок", "Подросток", "Молодой", "Взрослый", "Пожилой"];

const petStages = ["Детёныш", "Взрослый", "Пожилой"];

export function createStages(type: CharacterType, species = ""): LifeStage[] {
  const sp = speciesId({ type, species });
  const catalogNames = gameCatalog.entries.ages
    .filter((entry) => entry.species.includes(sp ?? ""))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((entry) => entry.label);
  const names = catalogNames.length
    ? catalogNames
    : type === "sim"
      ? simStages
      : type === "pet"
        ? petStages
        : ["Начало", "Расцвет", "Поздний этап"];
  return names.map((name, order) => ({ id: makeId("stage"), name, order }));
}

export function defaultStage(type: CharacterType): string {
  return type === "sim" ? "Молодой" : type === "pet" ? "Взрослый" : "Расцвет";
}
