import { useEffect, useId, useState, type CSSProperties } from "react";
import { Bone, Check, CircleUserRound, Ghost, HeartPulse, PawPrint, Plus, Skull, Sparkles, Trash2 } from "lucide-react";
import type { CareerPeriod, Character, CharacterCatalog, CharacterStatus, CharacterType } from "../types";
import { createCharacter } from "../lib/project";
import {
  ageEntry,
  catalogEntry,
  catalogOptions,
  changeCharacterKind,
  gameCatalog,
  prepareCatalogDraft,
  speciesId,
  traitConflicts,
} from "../lib/catalog";
import { makeId } from "../lib/id";
import { validPetOwnerIds } from "../lib/relationships";
import { genderChoice, genderChoices } from "../lib/gender";
import { CharacterPhotoInput } from "./CharacterPhotoInput";
import { CatalogPicker, GameIcon } from "./CatalogPicker";
import { Avatar } from "./CharacterNode";
import { PanelShell } from "./shell/PanelShell";
import { displayColor } from "../lib/colors";
import { useI18n } from "../i18n";
import { localizedCatalogEntry } from "../lib/catalogLocalization";

/** The bright palette of the theme; the saved value is the hex color. */
const colors = [
  ["#5565DC", "blue"],
  ["#8F4FC0", "violet"],
  ["#D0517E", "rose"],
  ["#E0664F", "coral"],
  ["#C9781C", "amber"],
  ["#1F8A78", "teal"],
  ["#2F86B8", "sky"],
  ["#B04A8F", "plum"],
] as const;
const typeIcons = { sim: CircleUserRound, pet: PawPrint, custom: Sparkles };
const statusIcons = { alive: HeartPulse, dead: Skull, missing: Ghost, unknown: Bone };
function ListInput({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const [text, setText] = useState(value.join(", "));
  return (
    <input
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        onChange(
          event.target.value
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
        );
      }}
    />
  );
}

/** Editing or creating a character inside the right panel, with every field of the profile. */
export function CharacterEditor({
  character,
  initialType = "sim",
  initialLastName,
  ownerCandidates = [],
  onClose,
  onSave,
}: {
  character?: Character;
  initialType?: CharacterType;
  initialLastName?: string;
  ownerCandidates?: Character[];
  onClose: () => void;
  onSave: (character: Character) => void;
}) {
  const { t, valueLabel, locale } = useI18n();
  const displayEntry = (kind: Parameters<typeof catalogEntry>[0], id: string) => {
    const entry = catalogEntry(kind, id);
    return entry && localizedCatalogEntry(kind, entry, locale);
  };
  const [draft, setDraft] = useState(() =>
    prepareCatalogDraft(character ?? { ...createCharacter("", initialType), lastName: initialLastName ?? "" }),
  );
  const [tab, setTab] = useState("main"),
    [allAges, setAllAges] = useState(false);
  const ownerHintId = useId();
  const owners = ownerCandidates.filter((item) => item.id !== draft.id && item.type !== "pet");
  const selectedOwnerIds = validPetOwnerIds(draft, ownerCandidates);
  const needsOwner = draft.type === "pet" && selectedOwnerIds.length === 0;
  const currentStage = draft.stages.find((stage) => stage.name === draft.lifeStage);
  const selectedGender = genderChoice(draft.gender);
  const [photoReading, setPhotoReading] = useState(false);
  // Read while rendering, before the name field takes focus.
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));
  useEffect(() => {
    // After «Save» or «Cancel» keyboard focus goes back where the editor was opened from,
    // or to «Edit» of the panel that replaces the editor.
    return () => {
      window.setTimeout(() => {
        if (document.activeElement && document.activeElement !== document.body) return;
        const target = opener?.isConnected && opener !== document.body ? opener : null;
        (target ?? document.querySelector<HTMLElement>(".tb-inspector .tb-soft-btn"))?.focus();
      });
    };
  }, [opener]);
  const settings = draft.catalog!;
  const setCatalog = (patch: Partial<CharacterCatalog>) =>
    setDraft((current) => ({ ...current, catalog: { ...current.catalog!, ...patch } }));
  const options = (kind: Parameters<typeof catalogOptions>[0]) => catalogOptions(kind, draft, allAges);
  const updateCareer = (id: string, patch: Partial<CareerPeriod>) =>
    setDraft((current) => ({
      ...current,
      catalog: {
        ...current.catalog!,
        careers: current.catalog!.careers.map((period) => (period.id === id ? { ...period, ...patch } : period)),
      },
    }));
  const save = () => {
    if (!draft.displayName.trim() || needsOwner || photoReading) {
      setTab("main");
      return;
    }
    const [firstName, ...lastName] = draft.displayName.trim().split(/\s+/);
    onSave({
      ...draft,
      displayName: draft.displayName.trim(),
      firstName: draft.firstName || firstName,
      lastName: draft.lastName || lastName.join(" "),
      ownerIds: draft.type === "pet" ? selectedOwnerIds : draft.ownerIds,
      gender: draft.type === "pet" && selectedGender === "other" ? "" : draft.gender,
      catalog: {
        ...settings,
        careers: settings.careers.filter((period) => period.careerId || period.customName.trim()),
      },
      updatedAt: new Date().toISOString(),
    });
  };
  const conflicts = traitConflicts(settings.traitIds).map((pair) =>
    pair.map((entry) => localizedCatalogEntry("traits", entry, locale)),
  );
  const tabs = [
    ["main", "main"],
    ["traits", "characteristics"],
    ["skills", "skillsAndPreferences"],
    ...(draft.type === "pet" ? [] : [["career", "career"]]),
    ["story", "story"],
  ];
  const customLists = (field: "traits" | "skills" | "preferences") => ({
    customValues: draft[field],
    onCustomValuesChange: (values: string[]) => setDraft((current) => ({ ...current, [field]: values })),
  });
  return (
    <PanelShell
      className="is-editing"
      color={draft.color}
      label={character ? t("editCharacter") : t("newCharacter")}
      closeLabel={`${t("cancel")} (Esc)`}
      onClose={onClose}
    >
      <div className="tb-panel-head">
        <span className="tb-panel-photo">
          <Avatar character={draft} size={72} ring />
        </span>
        <h2>{draft.displayName.trim() || t(character ? "editCharacter" : "newCharacter")}</h2>
      </div>
      <nav className="tb-tabs tb-panel-tabs" aria-label={t("profileSections")}>
        {tabs.map(([id, label]) => (
          <button
            key={id}
            className={`tb-tab ${tab === id ? "active" : ""}`}
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
          >
            {t(label)}
          </button>
        ))}
      </nav>
      <div className="tb-panel-body tb-form character-form-body">
        {tab === "main" && (
          <div className="form-grid">
            <label className="field span-2">
              <span>{t("displayName")}</span>
              <input
                autoFocus
                value={draft.displayName}
                onChange={(event) => setDraft({ ...draft, displayName: event.target.value })}
                placeholder={t("displayNameExample")}
              />
            </label>
            <div className="field span-2">
              <span>{t("typeCharacter")}</span>
              <div className="segmented">
                {(["sim", "pet", "custom"] as CharacterType[]).map((type) => {
                  const TypeIcon = typeIcons[type];
                  return (
                    <button
                      key={type}
                      className={draft.type === type ? "active" : ""}
                      aria-pressed={draft.type === type}
                      onClick={() =>
                        setDraft((current) =>
                          changeCharacterKind(
                            current,
                            type,
                            type === "pet" ? current.species || "Кошка" : current.species,
                          ),
                        )
                      }
                    >
                      <TypeIcon size={16} />
                      {t(type)}
                    </button>
                  );
                })}
              </div>
            </div>
            {draft.type === "pet" && (
              <>
                <label className="field">
                  <span>{t("petSpecies")}</span>
                  <select
                    value={speciesId(draft) ?? "other"}
                    onChange={(event) =>
                      setDraft((current) =>
                        changeCharacterKind(
                          current,
                          "pet",
                          gameCatalog.species.find((sp) => sp.id === event.target.value)?.label ?? "",
                        ),
                      )
                    }
                  >
                    {gameCatalog.species
                      .filter((sp) => sp.type === "pet")
                      .map((sp) => (
                        <option key={sp.id} value={sp.id}>
                          {valueLabel(sp.label)}
                        </option>
                      ))}
                    <option value="other">{t("customSpecies")}</option>
                  </select>
                </label>
                {!speciesId(draft) && (
                  <label className="field">
                    <span>{t("customSpecies")}</span>
                    <input
                      value={draft.species}
                      onChange={(event) => setDraft({ ...draft, species: event.target.value })}
                    />
                  </label>
                )}
                <div className="span-2">
                  <CatalogPicker
                    label={t("breed")}
                    kind="breeds"
                    options={options("breeds")}
                    selected={settings.breedId ? [settings.breedId] : []}
                    onChange={(ids) => setCatalog({ breedId: ids[0] ?? "" })}
                    customValue={settings.customBreed}
                    onCustomChange={(customBreed) => setCatalog({ customBreed })}
                  />
                </div>
                <label className="field">
                  <span>{t("neutered")}</span>
                  <select
                    value={settings.neutered}
                    onChange={(event) => setCatalog({ neutered: event.target.value as CharacterCatalog["neutered"] })}
                  >
                    <option value="unknown">{t("notDefined")}</option>
                    <option value="yes">{t("yes")}</option>
                    <option value="no">{t("no")}</option>
                  </select>
                </label>
                <fieldset
                  className="field span-2 owner-options"
                  aria-invalid={needsOwner || undefined}
                  aria-describedby={needsOwner ? ownerHintId : undefined}
                >
                  <legend>{t("petOwners")} *</legend>
                  <small>{t("ownersHint")}</small>
                  {owners.map((item) => (
                    <label className="check-row" key={item.id}>
                      <input
                        type="checkbox"
                        checked={selectedOwnerIds.includes(item.id)}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            ownerIds: event.target.checked
                              ? [...(draft.ownerIds ?? []), item.id]
                              : draft.ownerIds?.filter((id) => id !== item.id),
                          })
                        }
                      />
                      {item.displayName}
                    </label>
                  ))}
                </fieldset>
              </>
            )}
            <label className="field">
              <span>{t(draft.type === "pet" ? "petSex" : "gender")}</span>
              <select
                value={draft.type === "pet" && selectedGender === "other" ? "" : selectedGender}
                onChange={(event) => setDraft({ ...draft, gender: event.target.value })}
              >
                <option value="">{t("notDefined")}</option>
                {genderChoices
                  .filter((choice) => draft.type !== "pet" || choice.value !== "other")
                  .map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {t(draft.type === "pet" ? (choice.value === "female" ? "petFemale" : "petMale") : choice.label)}
                    </option>
                  ))}
              </select>
            </label>
            <div className="field span-2">
              <span>{t("lifeStage")}</span>
              <div className="tb-stage-pick" role="group" aria-label={t("lifeStage")}>
                {draft.stages.map((stage) => (
                  <button
                    key={stage.id}
                    className={draft.lifeStage === stage.name ? "active" : ""}
                    aria-pressed={draft.lifeStage === stage.name}
                    title={valueLabel(stage.name)}
                    onClick={() => setDraft({ ...draft, lifeStage: stage.name })}
                  >
                    <GameIcon entry={ageEntry(draft, stage.name)} />
                    <span>{valueLabel(stage.name)}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="field span-2">
              <span>{t("status")}</span>
              <div className="segmented wrap" role="group" aria-label={t("status")}>
                {(["alive", "dead", "missing", "unknown"] as const).map((status) => {
                  const StatusIcon = statusIcons[status];
                  return (
                    <button
                      key={status}
                      className={draft.status === status ? "active" : ""}
                      aria-pressed={draft.status === status}
                      onClick={() => setDraft({ ...draft, status: status as CharacterStatus })}
                    >
                      <StatusIcon size={16} />
                      {t(status === "unknown" ? "notDefined" : status)}
                    </button>
                  );
                })}
              </div>
            </div>
            {currentStage && (
              <CharacterPhotoInput
                key={currentStage.id}
                stage={currentStage}
                onReadingChange={setPhotoReading}
                onChange={(stageId, photo) =>
                  setDraft((current) => ({
                    ...current,
                    stages: current.stages.map((stage) => (stage.id === stageId ? { ...stage, photo } : stage)),
                  }))
                }
              />
            )}
            {(
              [
                ["firstName", "firstName"],
                ["lastName", "lastName"],
                ...(draft.type !== "pet" ? [["pronouns", "pronouns"]] : []),
              ] as [keyof Pick<Character, "firstName" | "lastName" | "pronouns">, string][]
            ).map(([key, label]) => (
              <label className="field" key={key}>
                <span>{t(label)}</span>
                <input value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} />
              </label>
            ))}
            <div className="field span-2">
              <span>{t("cardColor")}</span>
              <div className="color-list">
                {colors.map(([color, name]) => {
                  const active =
                    draft.color.toLowerCase() === color.toLowerCase() ||
                    displayColor(draft.color) === `var(--tb-p-${name})`;
                  return (
                    <button
                      key={color}
                      aria-label={t("color", { color })}
                      aria-pressed={active}
                      className={active ? "active" : ""}
                      style={{ "--pc": `var(--tb-p-${name})` } as CSSProperties}
                      onClick={() => setDraft({ ...draft, color })}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        )}
        {tab === "traits" && (
          <div className="catalog-form-stack">
            <label className="check-row">
              <input type="checkbox" checked={allAges} onChange={(event) => setAllAges(event.target.checked)} />
              {t("showAllAges")}
            </label>
            <p className="section-hint">{t("catalogRulesHint")}</p>
            <CatalogPicker
              label={t("traits")}
              kind="traits"
              options={options("traits")}
              selected={settings.traitIds}
              onChange={(traitIds) => setCatalog({ traitIds })}
              multiple
              {...customLists("traits")}
            />
            {!!conflicts.length && (
              <p className="catalog-warning" role="status">
                {t("conflictingTraits")}: {conflicts.map(([a, b]) => `${a.label} / ${b.label}`).join("; ")}.{" "}
                {t("storyChoiceAllowed")}
              </p>
            )}
            {draft.type !== "pet" && (
              <CatalogPicker
                label={t("goal")}
                kind="aspirations"
                options={options("aspirations")}
                selected={settings.aspirationId ? [settings.aspirationId] : []}
                onChange={(ids) => setCatalog({ aspirationId: ids[0] ?? "" })}
                customValue={draft.aspiration}
                onCustomChange={(aspiration) => setDraft((current) => ({ ...current, aspiration }))}
              />
            )}
            <CatalogPicker
              label={t("occultType")}
              kind="occults"
              options={options("occults")}
              selected={settings.occultIds}
              onChange={(occultIds) => setCatalog({ occultIds })}
              multiple
              customValues={draft.occultType ? [draft.occultType] : []}
              onCustomValuesChange={(values) => setDraft((current) => ({ ...current, occultType: values.join(", ") }))}
            />
            <CatalogPicker
              label={t("deathCause")}
              kind="deathCauses"
              options={options("deathCauses")}
              selected={settings.deathCauseId ? [settings.deathCauseId] : []}
              onChange={(ids) => setCatalog({ deathCauseId: ids[0] ?? "" })}
              customValue={draft.deathCause}
              onCustomChange={(deathCause) => setDraft((current) => ({ ...current, deathCause }))}
            />
          </div>
        )}
        {tab === "skills" && (
          <div className="catalog-form-stack">
            <label className="check-row">
              <input type="checkbox" checked={allAges} onChange={(event) => setAllAges(event.target.checked)} />
              {t("showAllAges")}
            </label>
            <CatalogPicker
              label={t("skills")}
              kind="skills"
              options={options("skills")}
              selected={settings.skills.map((item) => item.id)}
              multiple
              onChange={(ids) =>
                setCatalog({
                  skills: ids.map((id) => settings.skills.find((item) => item.id === id) ?? { id, level: 1 }),
                })
              }
              {...customLists("skills")}
            />
            {!!settings.skills.length && (
              <div className="catalog-value-list">
                {settings.skills.map((skill) => {
                  const entry = displayEntry("skills", skill.id);
                  return (
                    <label className="catalog-value-row" key={skill.id}>
                      <GameIcon entry={entry} />
                      <span>
                        {entry?.label ?? t("catalogUnknown")}
                        <small>{t("levelLimit", { max: entry?.maxLevel ?? "—" })}</small>
                      </span>
                      <input
                        aria-label={`${t("level")} ${entry?.label ?? t("catalogUnknown")}`}
                        type="number"
                        min="0"
                        max={entry?.maxLevel}
                        step="1"
                        value={skill.level}
                        onChange={(event) =>
                          setCatalog({
                            skills: settings.skills.map((item) =>
                              item.id === skill.id
                                ? {
                                    ...item,
                                    level: Math.max(
                                      0,
                                      Math.min(entry?.maxLevel ?? Infinity, Number(event.target.value)),
                                    ),
                                  }
                                : item,
                            ),
                          })
                        }
                      />
                    </label>
                  );
                })}
              </div>
            )}
            {draft.type !== "pet" && (
              <>
                <CatalogPicker
                  label={t("preferences")}
                  kind="preferences"
                  options={options("preferences")}
                  selected={settings.preferences.map((item) => item.id)}
                  multiple
                  onChange={(ids) =>
                    setCatalog({
                      preferences: ids.map(
                        (id) => settings.preferences.find((item) => item.id === id) ?? { id, rating: "like" },
                      ),
                    })
                  }
                  {...customLists("preferences")}
                />
                {!!settings.preferences.length && (
                  <div className="catalog-value-list">
                    {settings.preferences.map((preference) => {
                      const entry = displayEntry("preferences", preference.id);
                      const attraction = entry?.preferenceKind === "attraction";
                      return (
                        <label className="catalog-value-row" key={preference.id}>
                          <GameIcon entry={entry} />
                          <span>{entry?.label ?? t("catalogUnknown")}</span>
                          <select
                            aria-label={`${t("preferenceRating")} ${entry?.label ?? t("catalogUnknown")}`}
                            value={preference.rating}
                            onChange={(event) =>
                              setCatalog({
                                preferences: settings.preferences.map((item) =>
                                  item.id === preference.id
                                    ? { ...item, rating: event.target.value as "like" | "dislike" }
                                    : item,
                                ),
                              })
                            }
                          >
                            <option value="like">{t(attraction ? "turnOn" : "likes")}</option>
                            <option value="dislike">{t(attraction ? "turnOff" : "dislikes")}</option>
                          </select>
                        </label>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {tab === "career" && (
          <div className="catalog-form-stack">
            <p className="section-hint">{t("careerHint")}</p>
            {settings.careers.map((period, index) => (
              <section className="career-period" key={period.id}>
                <div className="section-heading">
                  <span>{t("careerPeriod", { number: index + 1 })}</span>
                  <button
                    className="tb-icon-btn danger-ghost"
                    aria-label={t("removeCareerPeriod", { number: index + 1 })}
                    onClick={() => setCatalog({ careers: settings.careers.filter((item) => item.id !== period.id) })}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <CatalogPicker
                  label={t("career")}
                  kind="careers"
                  options={options("careers")}
                  selected={period.careerId ? [period.careerId] : []}
                  onChange={(ids) => updateCareer(period.id, { careerId: ids[0] ?? "" })}
                  customValue={period.customName}
                  onCustomChange={(customName) => updateCareer(period.id, { customName })}
                />
                <div className="form-grid">
                  <label className="field">
                    <span>{t("level")}</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={period.level ?? ""}
                      onChange={(event) =>
                        updateCareer(period.id, {
                          level: event.target.value === "" ? undefined : Math.max(0, Number(event.target.value)),
                        })
                      }
                    />
                  </label>
                  <label className="field span-2">
                    <span>{t("notes")}</span>
                    <textarea
                      rows={2}
                      value={period.notes}
                      onChange={(event) => updateCareer(period.id, { notes: event.target.value })}
                    />
                  </label>
                </div>
              </section>
            ))}
            <button
              className="button subtle"
              onClick={() =>
                setCatalog({
                  careers: [
                    ...settings.careers,
                    {
                      id: makeId("career"),
                      careerId: "",
                      customName: "",
                      branch: "",
                      title: "",
                      start: "",
                      end: "",
                      current: true,
                      notes: "",
                    },
                  ],
                })
              }
            >
              <Plus size={16} />
              {t("addCareerPeriod")}
            </button>
          </div>
        )}
        {tab === "story" && (
          <div className="form-grid">
            <label className="field span-2">
              <span>{t("shortBiography")}</span>
              <textarea
                rows={5}
                value={draft.biography}
                onChange={(event) => setDraft({ ...draft, biography: event.target.value })}
              />
            </label>
            <label className="field span-2">
              <span>{t("notes")}</span>
              <textarea
                rows={5}
                value={draft.notes}
                onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
              />
            </label>
            {draft.type !== "pet" && (
              <label className="field span-2">
                <span>{t("education")}</span>
                <input
                  value={draft.education}
                  onChange={(event) => setDraft({ ...draft, education: event.target.value })}
                />
              </label>
            )}
            <label className="field">
              <span>{t("aliases")}</span>
              <ListInput value={draft.aliases} onChange={(aliases) => setDraft({ ...draft, aliases })} />
            </label>
            <label className="field">
              <span>{t("tags")}</span>
              <ListInput value={draft.tags} onChange={(tags) => setDraft({ ...draft, tags })} />
            </label>
          </div>
        )}
      </div>
      <footer className="tb-panel-foot character-dialog-footer">
        {needsOwner && (
          <p id={ownerHintId} className="pet-owner-required" role="status">
            {t(owners.length ? "petOwnerRequired" : "petOwnerCreateFirst")}
          </p>
        )}
        <button className="button ghost" onClick={onClose}>
          {t("cancel")}
        </button>
        <button
          className="button primary"
          onClick={save}
          disabled={!draft.displayName.trim() || needsOwner || photoReading}
          aria-describedby={needsOwner ? ownerHintId : undefined}
        >
          {character ? <Check size={17} /> : <Plus size={17} />}
          {character ? t("save") : t("addToTree")}
        </button>
      </footer>
    </PanelShell>
  );
}
