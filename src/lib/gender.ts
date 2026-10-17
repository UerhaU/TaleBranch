export type GenderChoice = "female" | "male" | "other" | "";

/** Read both the new stored choices and values from older free-text profiles. */
export function genderChoice(value: string): GenderChoice {
  const normalized = value.trim().toLocaleLowerCase("ru");
  if (!normalized) return "";
  if (["female", "женский", "женщина", "ж"].includes(normalized)) return "female";
  if (["male", "мужской", "мужчина", "м"].includes(normalized)) return "male";
  return "other";
}

export const genderChoices = [
  { value: "female", label: "genderFemale" },
  { value: "male", label: "genderMale" },
  { value: "other", label: "genderOther" },
] as const;
