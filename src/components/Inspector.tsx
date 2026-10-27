import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  BriefcaseBusiness,
  Camera,
  ChevronRight,
  CircleUserRound,
  Edit3,
  HeartHandshake,
  ImagePlus,
  MoreHorizontal,
  PawPrint,
  RotateCcw,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import type { Character, Project } from "../types";
import { useI18n } from "../i18n";
import type { LinkEdit } from "./LinkDialog";
import { CatalogValue, CatalogValues } from "./CatalogDisplay";
import { GameIcon } from "./CatalogPicker";
import { ageEntry, catalogEntry } from "../lib/catalog";
import { genderChoice, genderChoices } from "../lib/gender";

const tabs = [
  ["main", "main", CircleUserRound],
  ["stages", "lifeStages", Camera],
  ["traits", "characteristics", BookOpen],
  ["career", "career", BriefcaseBusiness],
  ["family", "family", UsersRound],
  ["relations", "relations", HeartHandshake],
] as const;

export function Inspector({
  character,
  project,
  onClose,
  onEdit,
  onDelete,
  onAddLink,
  onRestore,
  onPhoto,
  onLifeStage,
  onEditPhoto,
  onRemovePhoto,
  onEditLink,
  onRemoveLink,
  onPasteError,
}: {
  character?: Character;
  project: Project;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddLink: (kind: "parent" | "pair") => void;
  onRestore?: () => void;
  onPhoto: (file: File, stageName: string) => void;
  onLifeStage: (stage: string) => void;
  onEditPhoto: (stage: string) => void;
  onRemovePhoto: (stage: string) => void;
  onEditLink: (edit: LinkEdit) => void;
  onRemoveLink: (kind: "parent" | "pair", id: string, labelId?: string) => void;
  onPasteError: () => void;
}) {
  const { t, valueLabel } = useI18n();
  const [tab, setTab] = useState<(typeof tabs)[number][0]>("main");
  const [activePhotoStage, setActivePhotoStage] = useState(character?.lifeStage ?? "");
  const [showMore, setShowMore] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setActivePhotoStage(character?.lifeStage ?? "");
    setTab("main");
    setShowMore(false);
  }, [character?.id]);

  useEffect(() => {
    if (character && !character.stages.some((stage) => stage.name === activePhotoStage))
      setActivePhotoStage(character.lifeStage);
  }, [character?.stages, character?.lifeStage, activePhotoStage]);

  useEffect(() => {
    if (!character || tab !== "stages") return;
    const paste = (event: ClipboardEvent) => {
      const active = document.activeElement;
      if (
        document.querySelector('[role="dialog"]') ||
        (active instanceof Element && active.closest('input, textarea, [contenteditable="true"]'))
      )
        return;
      const file =
        Array.from(event.clipboardData?.items ?? [])
          .find((item) => item.type.startsWith("image/"))
          ?.getAsFile() ?? Array.from(event.clipboardData?.files ?? []).find((item) => item.type.startsWith("image/"));
      if (!file) {
        onPasteError();
        return;
      }
      event.preventDefault();
      onPhoto(file, activePhotoStage || character.lifeStage);
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  }, [character, tab, activePhotoStage, onPhoto, onPasteError]);

  if (!character)
    return (
      <aside className="tb-inspector inspector inspector-empty">
        <div className="empty-orbit">
          <CircleUserRound size={28} />
        </div>
        <h3>{t("selectCharacter")}</h3>
        <p>{t("selectCharacterHint")}</p>
      </aside>
    );

  const currentStage = character.stages.find((stage) => stage.name === character.lifeStage);
  const initials = character.displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
  const parents = project.parentLinks.filter((link) => link.childId === character.id);
  const children = project.parentLinks.filter((link) => link.parentId === character.id);
  const pairs = project.pairLinks.filter((link) => link.aId === character.id || link.bId === character.id);
  const characterName = (id: string) =>
    project.characters.find((item) => item.id === id)?.displayName ?? t("unknownCharacter");
  const selectedPhotoStage = character.stages.find((stage) => stage.name === activePhotoStage);
  const gender = genderChoice(character.gender);
  const genderLabel =
    character.type === "pet"
      ? gender === "female"
        ? "petFemale"
        : gender === "male"
          ? "petMale"
          : undefined
      : genderChoices.find((choice) => choice.value === gender)?.label;

  const acceptFile = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    onPhoto(file, activePhotoStage || character.lifeStage);
  };

  return (
    <aside className="tb-inspector inspector">
      <header className="inspector-header">
        <div className="profile-portrait" style={{ "--profile-accent": character.color } as React.CSSProperties}>
          {currentStage?.photo?.edited ? <img src={currentStage.photo.edited} alt="" /> : <span>{initials}</span>}
          <i>{character.type === "pet" ? <PawPrint size={15} /> : <CircleUserRound size={15} />}</i>
        </div>
        <div className="profile-title">
          {character.type === "pet" && <span className="eyebrow">{valueLabel(character.species) || t("pet")}</span>}
          <h2>{character.displayName}</h2>
          <p className="profile-age">
            <GameIcon entry={ageEntry(character)} />
            {valueLabel(character.lifeStage)} · {t(character.status)}
          </p>
        </div>
        <button className="icon-button" onClick={onClose} aria-label={t("closeProfile")}>
          <X size={18} />
        </button>
      </header>
      <div className="profile-actions">
        <button onClick={onEdit}>
          <Edit3 size={15} /> {t("edit")}
        </button>
        <button aria-label={t("moreActions")} title={t("moreActions")} onClick={() => setShowMore((value) => !value)}>
          <MoreHorizontal size={17} />
        </button>
        <button className="danger-ghost" onClick={onDelete} aria-label={t("moveToTrash")}>
          <Trash2 size={15} />
        </button>
        {showMore && (
          <div className="profile-more-menu">
            <button
              onClick={() => {
                setShowMore(false);
                onAddLink("parent");
              }}
            >
              <UsersRound size={15} />
              <span>
                <strong>{t("addFamily")}</strong>
                <small>{t("parentOrChild")}</small>
              </span>
            </button>
            <button
              onClick={() => {
                setShowMore(false);
                onAddLink("pair");
              }}
            >
              <HeartHandshake size={15} />
              <span>
                <strong>{t("addRelations")}</strong>
                <small>{t("friendshipRomanceDislike")}</small>
              </span>
            </button>
          </div>
        )}
      </div>
      <nav className="profile-tabs">
        {tabs
          .filter(([id]) => character.type !== "pet" || id !== "career")
          .map(([id, labelKey, Icon]) => (
            <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)} title={t(labelKey)}>
              <Icon size={17} />
              <span>{t(labelKey)}</span>
            </button>
          ))}
      </nav>
      <div className="inspector-scroll">
        {tab === "main" && (
          <>
            <section className="profile-section prose">
              <div className="section-heading">
                <span>{t("story")}</span>
              </div>
              <p>{character.biography || t("storyEmpty")}</p>
            </section>
            <section className="profile-section prose">
              <div className="section-heading">
                <span>{t("notes")}</span>
              </div>
              <p className="preserve-lines">{character.notes || t("notFilled")}</p>
              <dl className="facts">
                {(
                  [
                    ["firstName", character.firstName],
                    ["lastName", character.lastName],
                    ["aliases", character.aliases.join(", ")],
                    ["pronouns", character.pronouns],
                    [
                      character.type === "pet" ? "petSex" : "gender",
                      character.gender ? t(genderLabel ?? "notDefined") : "",
                    ],
                    ["education", character.education],
                  ] as const
                )
                  .filter(([, value]) => value)
                  .map(([key, value]) => (
                    <div key={key}>
                      <dt>{t(key)}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                {character.catalog?.occultIds.length || character.occultType ? (
                  <div>
                    <dt>{t("occultType")}</dt>
                    <dd>
                      <CatalogValues
                        kind="occults"
                        ids={character.catalog?.occultIds}
                        legacy={character.occultType ? [character.occultType] : []}
                        character={character}
                      />
                    </dd>
                  </div>
                ) : null}
                {(character.catalog?.deathCauseId || character.deathCause) && (
                  <div>
                    <dt>{t("deathCause")}</dt>
                    <dd>
                      <CatalogValue
                        kind="deathCauses"
                        id={character.catalog?.deathCauseId}
                        value={character.deathCause || undefined}
                        character={character}
                      />
                    </dd>
                  </div>
                )}
                {(character.catalog?.breedId || character.catalog?.customBreed) && (
                  <div>
                    <dt>{t("breed")}</dt>
                    <dd>
                      <CatalogValue
                        kind="breeds"
                        id={character.catalog?.breedId}
                        value={character.catalog?.customBreed || undefined}
                        character={character}
                      />
                    </dd>
                  </div>
                )}
                {character.type === "pet" && character.catalog && (
                  <div>
                    <dt>{t("neutered")}</dt>
                    <dd>{t(character.catalog.neutered === "unknown" ? "notDefined" : character.catalog.neutered)}</dd>
                  </div>
                )}
              </dl>
            </section>
            {character.type !== "pet" && (
              <section className="profile-section">
                <div className="section-heading">
                  <span>{t("aboutCharacter")}</span>
                </div>
                <dl className="facts">
                  <div>
                    <dt>{t("goal")}</dt>
                    <dd>
                      {character.catalog?.aspirationId || character.aspiration ? (
                        <CatalogValue
                          kind="aspirations"
                          id={character.catalog?.aspirationId}
                          value={character.aspiration || undefined}
                          character={character}
                        />
                      ) : (
                        t("notSpecified")
                      )}
                    </dd>
                  </div>
                </dl>
              </section>
            )}
            <section className="profile-section">
              <div className="section-heading">
                <span>{t("traits")}</span>
                <button onClick={() => setTab("traits")}>
                  {t("allTraits")} <ChevronRight size={14} />
                </button>
              </div>
              <CatalogValues
                kind="traits"
                ids={character.catalog?.traitIds}
                legacy={character.traits}
                character={character}
              />
            </section>
          </>
        )}
        {tab === "stages" && (
          <section className="profile-section stage-section">
            <div className="section-heading">
              <span>{t("lifeTimeline")}</span>
            </div>
            <p className="section-hint">{t("lifeTimelineHint")}</p>
            <div className="stage-timeline">
              {character.stages.map((stage) => (
                <button
                  key={stage.id}
                  className={activePhotoStage === stage.name ? "active" : ""}
                  onClick={() => {
                    setActivePhotoStage(stage.name);
                  }}
                >
                  <div className="stage-thumb">
                    {stage.photo?.edited ? (
                      <img src={stage.photo.edited} alt="" />
                    ) : ageEntry(character, stage.name) ? (
                      <GameIcon entry={ageEntry(character, stage.name)} />
                    ) : (
                      <ImagePlus size={18} />
                    )}
                  </div>
                  <div>
                    <strong>
                      {valueLabel(stage.name)}
                      {stage.name === character.lifeStage ? ` · ${t("currentStage")}` : ""}
                    </strong>
                    <small>{stage.photo ? t("photoAdded") : t("noPhoto")}</small>
                  </div>
                </button>
              ))}
            </div>
            <div className="stage-actions">
              <button
                className="button subtle"
                disabled={!selectedPhotoStage || activePhotoStage === character.lifeStage}
                onClick={() => onLifeStage(activePhotoStage)}
              >
                {t("makeCurrentStage")}
              </button>
              {selectedPhotoStage?.photo && (
                <>
                  <button className="button subtle" onClick={() => onEditPhoto(activePhotoStage)}>
                    {t("editPhoto")}
                  </button>
                  <button className="button ghost danger-ghost" onClick={() => onRemovePhoto(activePhotoStage)}>
                    {t("removePhoto")}
                  </button>
                </>
              )}
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(event) => {
                acceptFile(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
            <button
              className="upload-zone"
              onClick={() => fileInput.current?.click()}
              onDrop={(event) => {
                event.preventDefault();
                acceptFile(event.dataTransfer.files[0]);
              }}
              onDragOver={(event) => event.preventDefault()}
            >
              <Camera size={20} />
              <span>{t("addPhotoStage", { stage: valueLabel(activePhotoStage) })}</span>
              <small>{t("photoDropHint")}</small>
            </button>
          </section>
        )}
        {tab === "traits" && (
          <section className="profile-section">
            <div className="section-heading">
              <span>{t("characteristics")}</span>
            </div>
            <div className="trait-group">
              <h4>{t("traits")}</h4>
              <CatalogValues
                kind="traits"
                ids={character.catalog?.traitIds}
                legacy={character.traits}
                character={character}
              />
            </div>
            <div className="trait-group">
              <h4>{t("preferences")}</h4>
              <CatalogValues
                kind="preferences"
                ids={character.catalog?.preferences.map((item) => item.id)}
                legacy={character.preferences}
                character={character}
                suffixes={Object.fromEntries(
                  (character.catalog?.preferences ?? []).map((item) => [
                    item.id,
                    t(
                      catalogEntry("preferences", item.id)?.preferenceKind === "attraction"
                        ? item.rating === "like"
                          ? "turnOn"
                          : "turnOff"
                        : item.rating === "like"
                          ? "likes"
                          : "dislikes",
                    ),
                  ]),
                )}
              />
            </div>
            <div className="trait-group">
              <h4>{t("skills")}</h4>
              <CatalogValues
                kind="skills"
                ids={character.catalog?.skills.map((item) => item.id)}
                legacy={character.skills}
                character={character}
                suffixes={Object.fromEntries(
                  (character.catalog?.skills ?? []).map((item) => [item.id, `${t("level")} ${item.level}`]),
                )}
              />
            </div>
            <div className="trait-group">
              <h4>{t("tags")}</h4>
              <div className="large-chips">
                {character.tags.map((tag, index) => (
                  <span key={`${index}:${tag}`}>{tag}</span>
                ))}
              </div>
            </div>
          </section>
        )}
        {tab === "career" && (
          <section className="profile-section">
            <div className="section-heading">
              <span>{t("careerHistory")}</span>
            </div>
            {!character.catalog?.careers.length && <p className="section-hint">{t("careerHint")}</p>}
            {character.catalog?.careers.map((period) => (
              <article className="career-profile-period" key={period.id}>
                <h4>
                  <CatalogValue
                    kind="careers"
                    id={period.careerId}
                    value={period.customName || undefined}
                    character={character}
                  />
                </h4>
                {period.level !== undefined && (
                  <p>
                    {t("level")} {period.level}
                  </p>
                )}
                {period.notes && <p className="preserve-lines">{period.notes}</p>}
              </article>
            ))}
            <button className="button subtle" onClick={onEdit}>
              {t("fillProfile")}
            </button>
          </section>
        )}
        {tab === "family" && (
          <section className="profile-section">
            <div className="section-heading">
              <span>{t("familyLinks")}</span>
            </div>
            <div className="link-list">
              {[...parents, ...children.filter((child) => !parents.some((parent) => parent.id === child.id))].map(
                (link) => (
                  <div className="editable-family-link" key={link.id}>
                    <i className={`family-mark ${link.parentId === character.id ? "child" : ""}`} />
                    <span>
                      <small>
                        {valueLabel(link.childId === character.id ? link.parentRole : link.childRole)}
                        {!link.active ? ` · ${t("endedConnection")}` : ""}
                      </small>
                      {characterName(link.childId === character.id ? link.parentId : link.childId)}
                      <small>{valueLabel(link.kind)}</small>
                      {link.comment && <small>{link.comment}</small>}
                    </span>
                    <div className="link-actions">
                      <button
                        className="icon-button"
                        aria-label={t("editConnection")}
                        onClick={() => onEditLink({ kind: "parent", link })}
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        className="icon-button danger-ghost"
                        aria-label={t("removeConnection")}
                        onClick={() => onRemoveLink("parent", link.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ),
              )}
              <button className="button subtle" onClick={() => onAddLink("parent")}>
                {t("addFamily")}
              </button>
              {!parents.length && !children.length && <p className="empty-inline">{t("noFamilyLinks")}</p>}
            </div>
          </section>
        )}
        {tab === "relations" && (
          <section className="profile-section">
            <div className="section-heading">
              <span>{t("personalRelations")}</span>
            </div>
            <div className="relation-list">
              {pairs.map((pair) => {
                const otherId = pair.aId === character.id ? pair.bId : pair.aId;
                return (
                  <div key={pair.id}>
                    <strong>{characterName(otherId)}</strong>
                    <div className="editable-relations">
                      {pair.labels.map((label) => (
                        <div className="relation-entry" key={label.id}>
                          <span style={{ "--tag": label.color } as React.CSSProperties}>
                            {valueLabel(label.name)}
                            {label.publicity === "secret" ? t("secretSuffix") : ""}
                            {!label.active ? ` · ${t("endedConnection")}` : ""}
                          </span>
                          <small>
                            {label.direction === "mutual"
                              ? t("mutual")
                              : `${characterName(label.direction === "a-to-b" ? pair.aId : pair.bId)} → ${characterName(label.direction === "a-to-b" ? pair.bId : pair.aId)}`}
                          </small>
                          {label.comment && <small className="preserve-lines">{label.comment}</small>}
                          <div className="link-actions">
                            <button
                              className="icon-button"
                              aria-label={t("editConnection")}
                              onClick={() => onEditLink({ kind: "pair", pair, label })}
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              className="icon-button danger-ghost"
                              aria-label={t("removeConnection")}
                              onClick={() => onRemoveLink("pair", pair.id, label.id)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {!pairs.length && <p className="empty-inline">{t("noPersonalRelations")}</p>}
              <button className="button subtle" onClick={() => onAddLink("pair")}>
                {t("addRelations")}
              </button>
            </div>
          </section>
        )}
        {onRestore && (
          <button className="button subtle" onClick={onRestore}>
            <RotateCcw size={16} /> {t("restoreTrash")}
          </button>
        )}
      </div>
    </aside>
  );
}
