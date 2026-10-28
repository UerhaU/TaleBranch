import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  BookOpen,
  BriefcaseBusiness,
  Camera,
  CircleUserRound,
  Edit3,
  HeartHandshake,
  ImagePlus,
  MoreHorizontal,
  PawPrint,
  Plus,
  RotateCcw,
  Trash2,
  UsersRound,
} from "lucide-react";
import type { Character, Project } from "../types";
import { useI18n } from "../i18n";
import type { LinkEdit } from "./LinkDialog";
import { CatalogValue } from "./CatalogDisplay";
import { GameIcon } from "./CatalogPicker";
import { Avatar } from "./CharacterNode";
import { relationIcons } from "./RelationshipEdge";
import { CharacterMenuItems, type CharacterActions } from "./shell/CharacterMenu";
import { PanelShell } from "./shell/PanelShell";
import { Popover } from "./shell/Popover";
import { ageEntry, catalogEntry } from "../lib/catalog";
import { useCatalog } from "../hooks/useCatalog";
import { genderChoice, genderChoices } from "../lib/gender";

const tabs = [
  ["main", "main", CircleUserRound],
  ["stages", "lifeStages", Camera],
  ["traits", "characteristics", BookOpen],
  ["career", "career", BriefcaseBusiness],
  ["family", "family", UsersRound],
  ["relations", "relations", HeartHandshake],
] as const;
const tones = ["accent", "pink", "wheat", "sky", "mint"];

/** A titled block of the panel; nothing is shown when it is empty. */
function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="tb-section">
      <div className="tb-section-head">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function RelationIcon({ icon, color }: { icon: string; color: string }) {
  return (
    <i className="tb-rel-chip" style={{ "--rc": color } as CSSProperties}>
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path d={relationIcons[icon] ?? relationIcons.heart} />
      </svg>
    </i>
  );
}

/** The selected character on the right: header, tabs and only the filled-in sections. */
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
  onSelect,
  actions,
}: {
  character: Character;
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
  onSelect?: (id: string) => void;
  actions?: CharacterActions;
}) {
  const { t, valueLabel, locale } = useI18n();
  // Catalog lists arrive a moment after the panel opens; until then old texts are not compared with them.
  const catalogLoaded = useCatalog(locale);
  const unmatched = (values: string[], known: (value: string) => boolean) =>
    catalogLoaded ? values.filter((value) => !known(value)) : [];
  const [tab, setTab] = useState<(typeof tabs)[number][0]>("main");
  const [activePhotoStage, setActivePhotoStage] = useState(character.lifeStage);
  const [showMore, setShowMore] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setActivePhotoStage(character.lifeStage);
    setTab("main");
    setShowMore(false);
  }, [character.id]);

  useEffect(() => {
    if (!character.stages.some((stage) => stage.name === activePhotoStage)) setActivePhotoStage(character.lifeStage);
  }, [character.stages, character.lifeStage, activePhotoStage]);

  useEffect(() => {
    if (tab !== "stages") return;
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

  const byId = (id: string) => project.characters.find((item) => item.id === id);
  const characterName = (id: string) => byId(id)?.displayName ?? t("unknownCharacter");
  const parents = project.parentLinks.filter((link) => link.childId === character.id);
  const children = project.parentLinks.filter((link) => link.parentId === character.id);
  const pairs = project.pairLinks.filter((link) => link.aId === character.id || link.bId === character.id);
  const pets = project.characters.filter((item) => item.type === "pet" && item.ownerIds?.includes(character.id));
  const owners = (character.ownerIds ?? []).map(byId).filter((item): item is Character => Boolean(item));
  const catalog = character.catalog;
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
    if (!file || !file.type.startsWith("image/")) return;
    onPhoto(file, activePhotoStage || character.lifeStage);
  };

  const personRow = (person: Character | undefined, id: string, role: string, extra?: ReactNode, tail?: ReactNode) => (
    <div className="tb-person-row" key={`${role}:${id}:${String(extra ? "x" : "")}`}>
      <button className="tb-person-main" disabled={!person || !onSelect} onClick={() => person && onSelect?.(id)}>
        {person ? <Avatar character={person} size={38} /> : <span className="tb-avatar-placeholder" />}
        <span>
          <b>{person?.displayName ?? t("unknownCharacter")}</b>
          <small>{role}</small>
        </span>
      </button>
      {extra}
      {tail}
    </div>
  );

  const occultIds = catalog?.occultIds ?? [];
  const facts = (
    [
      ["firstName", character.firstName],
      ["lastName", character.lastName],
      ["aliases", character.aliases.join(", ")],
      ["pronouns", character.pronouns],
      [character.type === "pet" ? "petSex" : "gender", character.gender ? t(genderLabel ?? "notDefined") : ""],
      ["education", character.education],
    ] as const
  ).filter(([, value]) => value);
  const catalogFacts: Array<[string, ReactNode]> = [];
  const customOccults = catalog?.customOccults ?? [];
  if (occultIds.length || customOccults.length)
    catalogFacts.push([
      "occultType",
      <>
        {occultIds.map((id) => (
          <CatalogValue key={id} kind="occults" id={id} character={character} />
        ))}
        {customOccults.map((value, index) => (
          <CatalogValue key={`custom-${index}`} kind="occults" value={value} character={character} />
        ))}
      </>,
    ]);
  if (catalog?.deathCauseId || catalog?.customDeathCause)
    catalogFacts.push([
      "deathCause",
      <CatalogValue
        kind="deathCauses"
        id={catalog?.deathCauseId}
        value={catalog?.customDeathCause || undefined}
        character={character}
      />,
    ]);
  if (catalog?.breedId || catalog?.customBreed)
    catalogFacts.push([
      "breed",
      <CatalogValue
        kind="breeds"
        id={catalog?.breedId}
        value={catalog?.customBreed || undefined}
        character={character}
      />,
    ]);
  if (character.type === "pet" && catalog && catalog.neutered !== "unknown")
    catalogFacts.push(["neutered", t(catalog.neutered)]);

  const traitIds = catalog?.traitIds ?? [];
  const legacyTraits = unmatched(catalog?.customTraits ?? [], (value) =>
    traitIds.some((id) => catalogEntry("traits", id)?.label === value),
  );
  const hasGoal = character.type !== "pet" && Boolean(catalog?.aspirationId || catalog?.customAspiration);
  const links = [
    ...parents.map((link) => [link.parentId, valueLabel(link.parentRole)] as const),
    ...children.map((link) => [link.childId, valueLabel(link.childRole)] as const),
    ...pairs.map(
      (pair) =>
        [
          pair.aId === character.id ? pair.bId : pair.aId,
          pair.labels.map((label) => valueLabel(label.name)).join(", "),
        ] as const,
    ),
    ...pets.map((pet) => [pet.id, t("pet")] as const),
    ...owners.map((owner) => [owner.id, t("petOwners")] as const),
  ];
  const mainEmpty =
    !facts.length &&
    !catalogFacts.length &&
    !hasGoal &&
    !traitIds.length &&
    !legacyTraits.length &&
    !character.biography &&
    !character.notes &&
    !links.length;

  const skills = catalog?.skills ?? [];
  const preferences = catalog?.preferences ?? [];
  const legacySkills = unmatched(catalog?.customSkills ?? [], (value) =>
    skills.some((item) => catalogEntry("skills", item.id)?.label === value),
  );
  const legacyPreferences = unmatched(catalog?.customPreferences ?? [], (value) =>
    preferences.some((item) => catalogEntry("preferences", item.id)?.label === value),
  );
  const traitsEmpty =
    !traitIds.length &&
    !legacyTraits.length &&
    !skills.length &&
    !legacySkills.length &&
    !preferences.length &&
    !legacyPreferences.length &&
    !character.tags.length;

  const empty = (
    <div className="tb-empty-note">
      <b>{t("profileEmpty")}</b>
      <span>{t("profileEmptyHint")}</span>
      <button className="button subtle" onClick={onEdit}>
        <Edit3 size={16} /> {t("edit")}
      </button>
    </div>
  );

  return (
    <PanelShell
      color={character.color}
      label={character.displayName}
      closeLabel={`${t("closeProfile")} (Esc)`}
      onClose={onClose}
    >
      <div className="tb-panel-head">
        <span className="tb-panel-photo">
          <Avatar character={character} size={96} ring />
          <i className="tb-type-badge" title={t(character.type)}>
            {character.type === "pet" ? <PawPrint size={15} /> : <CircleUserRound size={15} />}
          </i>
        </span>
        {character.type === "pet" && <span className="eyebrow">{valueLabel(character.species) || t("pet")}</span>}
        <h2>{character.displayName}</h2>
        <p className="profile-age">
          <GameIcon entry={ageEntry(character)} />
          {valueLabel(character.lifeStage)}
          {character.status !== "alive"
            ? ` · ${t(character.status === "unknown" ? "notDefined" : character.status)}`
            : ""}
        </p>
        <div className="tb-panel-actions">
          <button className="tb-soft-btn" onClick={onEdit} title={`${t("edit")} (Enter)`}>
            <Edit3 size={17} /> {t("edit")}
          </button>
          {actions && (
            <Popover
              open={showMore}
              onOpenChange={setShowMore}
              align="end"
              label={t("moreActions")}
              trigger={
                <button
                  className={`tb-icon-btn ${showMore ? "is-open" : ""}`}
                  aria-label={t("moreActions")}
                  title={t("moreActions")}
                  aria-haspopup="menu"
                  aria-expanded={showMore}
                  onClick={() => setShowMore((value) => !value)}
                >
                  <MoreHorizontal size={18} />
                </button>
              }
            >
              <CharacterMenuItems
                character={character}
                actions={actions}
                withEdit={false}
                onDone={() => setShowMore(false)}
              />
            </Popover>
          )}
          <button
            className="tb-icon-btn danger-ghost"
            onClick={onDelete}
            aria-label={t("moveToTrash")}
            title={`${t("moveToTrash")} (Delete)`}
          >
            <Trash2 size={17} />
          </button>
        </div>
      </div>
      <nav className="tb-tabs tb-panel-tabs" aria-label={t("profileSections")}>
        {tabs
          .filter(([id]) => character.type !== "pet" || id !== "career")
          .map(([id, labelKey, Icon]) => (
            <button
              key={id}
              className={`tb-tab ${tab === id ? "active" : ""}`}
              aria-pressed={tab === id}
              onClick={() => setTab(id)}
              title={t(labelKey)}
            >
              <Icon size={17} />
              <span>{t(labelKey)}</span>
            </button>
          ))}
      </nav>
      <div className="tb-panel-body">
        {tab === "main" && (
          <>
            {mainEmpty && empty}
            {(!!facts.length || !!catalogFacts.length) && (
              <dl className="tb-facts">
                {facts.map(([key, value]) => (
                  <div key={key}>
                    <dt>{t(key)}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
                {catalogFacts.map(([key, value]) => (
                  <div key={key} className="wide">
                    <dt>{t(key)}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {hasGoal && (
              <Section title={t("goal")}>
                <div className="tb-goal">
                  <CatalogValue
                    kind="aspirations"
                    id={catalog?.aspirationId}
                    value={catalog?.customAspiration || undefined}
                    character={character}
                  />
                </div>
              </Section>
            )}
            {(!!traitIds.length || !!legacyTraits.length) && (
              <Section
                title={t("traits")}
                action={
                  <button className="tb-link-btn" onClick={() => setTab("traits")}>
                    {t("allTraits")}
                  </button>
                }
              >
                <div className="tb-chips">
                  {traitIds.map((id, index) => (
                    <span key={id} className={`tb-chip tone-${tones[index % tones.length]}`}>
                      <CatalogValue kind="traits" id={id} character={character} />
                    </span>
                  ))}
                  {legacyTraits.map((value, index) => (
                    <span key={`custom:${index}`} className="tb-chip tone-wheat">
                      <CatalogValue kind="traits" value={value} character={character} />
                    </span>
                  ))}
                </div>
              </Section>
            )}
            {character.biography && (
              <Section title={t("story")}>
                <p className="tb-prose preserve-lines">{character.biography}</p>
              </Section>
            )}
            {character.notes && (
              <Section title={t("notes")}>
                <p className="tb-prose preserve-lines">{character.notes}</p>
              </Section>
            )}
            {!!links.length && (
              <Section title={t("connections")}>
                <div className="tb-people">
                  {links.map(([id, role], index) => (
                    <div key={`${id}:${index}`}>{personRow(byId(id), id, role)}</div>
                  ))}
                </div>
              </Section>
            )}
          </>
        )}
        {tab === "stages" && (
          <Section title={t("lifeTimeline")}>
            <p className="tb-hint">{t("lifeTimelineHint")}</p>
            <div className="tb-stages">
              {character.stages.map((stage) => (
                <button
                  key={stage.id}
                  className={`${activePhotoStage === stage.name ? "active" : ""} ${stage.name === character.lifeStage ? "current" : ""}`}
                  aria-pressed={activePhotoStage === stage.name}
                  onClick={() => setActivePhotoStage(stage.name)}
                >
                  <span className="tb-stage-thumb">
                    {stage.photo?.edited ? (
                      <img src={stage.photo.edited} alt="" />
                    ) : ageEntry(character, stage.name) ? (
                      <GameIcon entry={ageEntry(character, stage.name)} />
                    ) : (
                      <ImagePlus size={20} />
                    )}
                  </span>
                  <strong>
                    {valueLabel(stage.name)}
                    {stage.name === character.lifeStage ? <em> · {t("currentStage")}</em> : ""}
                  </strong>
                  <small>{stage.photo ? t("photoAdded") : t("noPhoto")}</small>
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
                  <button className="button ghost danger-text" onClick={() => onRemovePhoto(activePhotoStage)}>
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
          </Section>
        )}
        {tab === "traits" && (
          <>
            {traitsEmpty && empty}
            {(!!traitIds.length || !!legacyTraits.length) && (
              <Section title={t("traits")}>
                <div className="tb-tiles">
                  {traitIds.map((id) => (
                    <div className="tb-tile" key={id}>
                      <CatalogValue kind="traits" id={id} character={character} />
                    </div>
                  ))}
                  {legacyTraits.map((value, index) => (
                    <div className="tb-tile" key={`custom:${index}`}>
                      <CatalogValue kind="traits" value={value} character={character} />
                    </div>
                  ))}
                </div>
              </Section>
            )}
            {(!!preferences.length || !!legacyPreferences.length) && (
              <Section title={t("preferences")}>
                <div className="tb-chips">
                  {preferences.map((item) => {
                    const attraction = catalogEntry("preferences", item.id)?.preferenceKind === "attraction";
                    const rating = t(
                      attraction
                        ? item.rating === "like"
                          ? "turnOn"
                          : "turnOff"
                        : item.rating === "like"
                          ? "likes"
                          : "dislikes",
                    );
                    return (
                      <span key={item.id} className={`tb-chip tone-${item.rating === "like" ? "mint" : "pink"}`}>
                        <CatalogValue kind="preferences" id={item.id} character={character} />
                        <small>{rating}</small>
                      </span>
                    );
                  })}
                  {legacyPreferences.map((value, index) => (
                    <span key={`custom:${index}`} className="tb-chip tone-wheat">
                      <CatalogValue kind="preferences" value={value} character={character} />
                    </span>
                  ))}
                </div>
              </Section>
            )}
            {(!!skills.length || !!legacySkills.length) && (
              <Section title={t("skills")}>
                {skills.map((item) => {
                  const max = catalogEntry("skills", item.id)?.maxLevel ?? 10;
                  return (
                    <div className="tb-skill" key={item.id}>
                      <CatalogValue kind="skills" id={item.id} character={character} />
                      <span className="tb-bar">
                        <i style={{ width: `${Math.min(100, (item.level / max) * 100)}%` }} />
                      </span>
                      <b title={t("level")}>{item.level}</b>
                    </div>
                  );
                })}
                {!!legacySkills.length && (
                  <div className="tb-chips">
                    {legacySkills.map((value, index) => (
                      <span key={`custom:${index}`} className="tb-chip tone-wheat">
                        <CatalogValue kind="skills" value={value} character={character} />
                      </span>
                    ))}
                  </div>
                )}
              </Section>
            )}
            {!!character.tags.length && (
              <Section title={t("tags")}>
                <div className="tb-chips">
                  {character.tags.map((tag, index) => (
                    <span key={`${index}:${tag}`} className="tb-chip tone-wheat">
                      #{tag}
                    </span>
                  ))}
                </div>
              </Section>
            )}
          </>
        )}
        {tab === "career" &&
          (catalog?.careers.length ? (
            <Section title={t("careerHistory")}>
              {catalog.careers.map((period) => (
                <article className="tb-career" key={period.id}>
                  <CatalogValue
                    kind="careers"
                    id={period.careerId}
                    value={period.customName || undefined}
                    character={character}
                  />
                  {period.level !== undefined && (
                    <small>
                      {t("level")} {period.level}
                    </small>
                  )}
                  {period.notes && <p className="preserve-lines">{period.notes}</p>}
                </article>
              ))}
            </Section>
          ) : (
            empty
          ))}
        {tab === "family" && (
          <Section title={t("familyLinks")}>
            <div className="tb-people">
              {[...parents, ...children].map((link) => {
                const otherId = link.childId === character.id ? link.parentId : link.childId;
                const role = [
                  valueLabel(link.childId === character.id ? link.parentRole : link.childRole),
                  valueLabel(link.kind),
                  !link.active ? t("endedConnection") : "",
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <div key={link.id}>
                    {personRow(
                      byId(otherId),
                      otherId,
                      role,
                      undefined,
                      <div className="link-actions">
                        <button
                          className="tb-icon-btn"
                          aria-label={t("editConnection")}
                          title={t("editConnection")}
                          onClick={() => onEditLink({ kind: "parent", link })}
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          className="tb-icon-btn danger-ghost"
                          aria-label={t("removeConnection")}
                          title={t("removeConnection")}
                          onClick={() => onRemoveLink("parent", link.id)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>,
                    )}
                    {link.comment && <p className="tb-row-note preserve-lines">{link.comment}</p>}
                  </div>
                );
              })}
              {pets.map((pet) => personRow(pet, pet.id, t("pet")))}
              {owners.map((owner) => personRow(owner, owner.id, t("petOwners")))}
              {!parents.length && !children.length && !pets.length && !owners.length && (
                <p className="tb-hint">{t("noFamilyLinks")}</p>
              )}
            </div>
            <button className="button subtle" onClick={() => onAddLink("parent")}>
              <Plus size={16} /> {t("addFamily")}
            </button>
          </Section>
        )}
        {tab === "relations" && (
          <Section title={t("personalRelations")}>
            <div className="tb-people">
              {pairs.flatMap((pair) => {
                const otherId = pair.aId === character.id ? pair.bId : pair.aId;
                return pair.labels.map((label) => {
                  const direction =
                    label.direction === "mutual"
                      ? t("mutual")
                      : `${characterName(label.direction === "a-to-b" ? pair.aId : pair.bId)} → ${characterName(label.direction === "a-to-b" ? pair.bId : pair.aId)}`;
                  const role = [
                    `${valueLabel(label.name)}${label.publicity === "secret" ? t("secretSuffix") : ""}`,
                    !label.active ? t("endedConnection") : "",
                    direction,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <div key={label.id}>
                      {personRow(
                        byId(otherId),
                        otherId,
                        role,
                        <RelationIcon icon={label.icon} color={label.color} />,
                        <div className="link-actions">
                          <button
                            className="tb-icon-btn"
                            aria-label={t("editConnection")}
                            title={t("editConnection")}
                            onClick={() => onEditLink({ kind: "pair", pair, label })}
                          >
                            <Edit3 size={15} />
                          </button>
                          <button
                            className="tb-icon-btn danger-ghost"
                            aria-label={t("removeConnection")}
                            title={t("removeConnection")}
                            onClick={() => onRemoveLink("pair", pair.id, label.id)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>,
                      )}
                      {label.comment && <p className="tb-row-note preserve-lines">{label.comment}</p>}
                    </div>
                  );
                });
              })}
              {!pairs.length && <p className="tb-hint">{t("noPersonalRelations")}</p>}
            </div>
            <button className="button subtle" onClick={() => onAddLink("pair")}>
              <Plus size={16} /> {t("addRelations")}
            </button>
          </Section>
        )}
        {onRestore && (
          <button className="button subtle" onClick={onRestore}>
            <RotateCcw size={16} /> {t("restoreTrash")}
          </button>
        )}
      </div>
    </PanelShell>
  );
}
