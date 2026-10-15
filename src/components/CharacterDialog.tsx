import { useMemo, useState } from "react";
import { Plus, UserRound } from "lucide-react";
import type { Character, CharacterStatus, CharacterType } from "../types";
import { createCharacter } from "../lib/project";
import { createStages, defaultStage } from "../lib/stages";
import { Modal } from "./Modal";
import { useI18n } from "../i18n";

const colors = ["#3E4B8E", "#3D1534", "#6D78B2", "#6F4B68", "#8AA6B6", "#C69D63"];

function ListInput({ value, onChange, placeholder }: { value: string[]; onChange: (value: string[]) => void; placeholder?: string }) {
  const [text, setText] = useState(value.join(", "));
  return <input value={text} placeholder={placeholder} onChange={(event) => {
    setText(event.target.value);
    onChange(event.target.value.split(",").map((item) => item.trim()).filter(Boolean));
  }} />;
}

export function CharacterDialog({
  character,
  ownerCandidates = [],
  onClose,
  onSave,
}: {
  character?: Character;
  ownerCandidates?: Character[];
  onClose: () => void;
  onSave: (character: Character) => void;
}) {
  const { t, valueLabel } = useI18n();
  const initial = useMemo(() => character ?? createCharacter("", "sim"), [character]);
  const [draft, setDraft] = useState(initial);

  const setType = (type: CharacterType) => {
    setDraft((current) => {
      if (type === current.type) return current;
      const hasPhotos = current.stages.some((stage) => stage.photo);
      const defaults = createStages(type);
      return { ...current, type,
        lifeStage: hasPhotos ? current.lifeStage : defaultStage(type),
        stages: hasPhotos ? [...current.stages, ...defaults.filter((stage) => !current.stages.some((old) => old.name === stage.name))] : defaults,
      };
    });
  };

  const save = () => {
    if (!draft.displayName.trim()) return;
    const [firstName, ...lastName] = draft.displayName.trim().split(/\s+/);
    onSave({
      ...draft,
      displayName: draft.displayName.trim(),
      firstName: draft.firstName || firstName,
      lastName: draft.lastName || lastName.join(" "),
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <Modal
      title={character ? t("editCharacter") : t("newCharacter")}
      subtitle={character ? t("editCharacterHint") : t("newCharacterHint")}
      onClose={onClose}
      wide
    >
      <div className="modal-body form-grid">
        <label className="field span-2">
          <span>{t("displayName")}</span>
          <input autoFocus value={draft.displayName} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} placeholder={t("displayNameExample")} />
        </label>
        <div className="field span-2">
          <span>{t("typeCharacter")}</span>
          <div className="segmented">
            {([
              ["sim", t("sim")],
              ["pet", t("pet")],
              ["custom", t("custom")],
            ] as [CharacterType, string][]).map(([value, label]) => (
              <button key={value} className={draft.type === value ? "active" : ""} onClick={() => setType(value)}>
                {value === "pet" ? "◆" : <UserRound size={15} />} {label}
              </button>
            ))}
          </div>
        </div>
        {draft.type === "pet" && (
          <>
            <label className="field">
              <span>{t("petSpecies")}</span>
              <input value={draft.species} onChange={(event) => setDraft({ ...draft, species: event.target.value })} placeholder={t("petSpeciesExample")} />
            </label>
            <fieldset className="field owner-options">
              <legend>{t("petOwners")}</legend>
              <small>{t("ownersHint")}</small>
              {ownerCandidates.filter((item) => item.id !== draft.id && item.type !== "pet").map((item) => (
                <label className="check-row" key={item.id}><input type="checkbox" checked={draft.ownerIds?.includes(item.id) ?? false} onChange={(event) => setDraft({ ...draft,
                  ownerIds: event.target.checked ? [...(draft.ownerIds ?? []), item.id] : draft.ownerIds?.filter((id) => id !== item.id),
                })} />{item.displayName}</label>
              ))}
            </fieldset>
          </>
        )}
        <label className="field">
          <span>{t("lifeStage")}</span>
          <select value={draft.lifeStage} onChange={(event) => setDraft({ ...draft, lifeStage: event.target.value })}>
            {draft.stages.map((stage) => <option key={stage.id} value={stage.name}>{valueLabel(stage.name)}</option>)}
          </select>
        </label>
        <label className="field">
          <span>{t("status")}</span>
          <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as CharacterStatus })}>
            <option value="alive">{t("alive")}</option>
            <option value="dead">{t("dead")}</option>
            <option value="missing">{t("missing")}</option>
            <option value="unknown">{t("notDefined")}</option>
          </select>
        </label>
        <label className="field">
          <span>{t("generation")}</span>
          <input type="number" min="0" max="99" value={draft.generation} onChange={(event) => setDraft({ ...draft, generation: Number(event.target.value) })} />
        </label>
        <label className="field">
          <span>{t("household")}</span>
          <input value={draft.household} onChange={(event) => setDraft({ ...draft, household: event.target.value })} placeholder={t("householdExample")} />
        </label>
        <label className="field">
          <span>{t("world")}</span>
          <input value={draft.world} onChange={(event) => setDraft({ ...draft, world: event.target.value })} placeholder={t("worldExample")} />
        </label>
        <label className="field span-2">
          <span>{t("traits")} <small>{t("commaSeparated")}</small></span>
          <ListInput value={draft.traits} onChange={(traits) => setDraft({ ...draft, traits })} placeholder={t("traitsExample")} />
        </label>
        <label className="field span-2">
          <span>{t("shortBiography")}</span>
          <textarea rows={3} value={draft.biography} onChange={(event) => setDraft({ ...draft, biography: event.target.value })} placeholder={t("biographyExample")} />
        </label>
        <details className="span-2 profile-details">
          <summary>{t("moreProfileFields")}</summary>
          <div className="form-grid">
            {([
              ["firstName", "firstName"], ["lastName", "lastName"], ["pronouns", "pronouns"], ["gender", "gender"],
              ["occultType", "occultType"], ["birthDate", "birthDate"], ["deathDate", "deathDate"], ["lot", "lot"],
              ["aspiration", "goal"], ["education", "education"], ["deathCause", "deathCause"],
            ] as const).map(([key, label]) => <label className="field" key={key}><span>{t(label)}</span><input value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} /></label>)}
            {([ ["aliases", "aliases"], ["preferences", "preferences"], ["skills", "skills"], ["tags", "tags"] ] as const).map(([key, label]) => (
              <label className="field" key={key}><span>{t(label)} <small>{t("commaSeparated")}</small></span><ListInput value={draft[key]} onChange={(values) => setDraft({ ...draft, [key]: values })} /></label>
            ))}
            <label className="field span-2"><span>{t("notes")}</span><textarea rows={5} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
          </div>
        </details>
        <div className="field span-2">
          <span>{t("cardColor")}</span>
          <div className="color-list">
            {colors.map((color) => (
              <button key={color} aria-label={t("color", { color })} className={draft.color === color ? "active" : ""} style={{ backgroundColor: color }} onClick={() => setDraft({ ...draft, color })} />
            ))}
          </div>
        </div>
      </div>
      <footer className="modal-footer">
        <button className="button ghost" onClick={onClose}>{t("cancel")}</button>
        <button className="button primary" onClick={save} disabled={!draft.displayName.trim()}><Plus size={17} /> {character ? t("save") : t("addToTree")}</button>
      </footer>
    </Modal>
  );
}
