import type { CharacterType, LifeStage } from "../types";
import { makeId } from "./id";

const simStages = [
  "Новорождённый",
  "Младенец",
  "Малыш",
  "Ребёнок",
  "Подросток",
  "Молодой взрослый",
  "Взрослый",
  "Пожилой",
];

const petStages = ["Детёныш", "Взрослый", "Пожилой"];

export function createStages(type: CharacterType): LifeStage[] {
  const names = type === "sim" ? simStages : type === "pet" ? petStages : ["Начало", "Расцвет", "Поздний этап"];
  return names.map((name, order) => ({ id: makeId("stage"), name, order }));
}

export function defaultStage(type: CharacterType): string {
  return type === "sim" ? "Молодой взрослый" : type === "pet" ? "Взрослый" : "Расцвет";
}
