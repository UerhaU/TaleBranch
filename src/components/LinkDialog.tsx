import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRightLeft,
  ChevronDown,
  CircleUserRound,
  HeartHandshake,
  Link2,
  PawPrint,
  Plus,
  Search,
} from "lucide-react";
import type { Character, PairLink, ParentLink, Project, RelationshipDirection, RelationshipLabel } from "../types";
import { makeId } from "../lib/id";
import { wouldCreateAncestorCycle } from "../lib/project";
import { Modal } from "./Modal";
import { useI18n } from "../i18n";

const relationshipPresets = [
  ["Супруги", "rings", "#F6E0B6"],
  ["Помолвлены", "gem", "#A6BCC9"],
  ["Встречаются", "heart", "#7D6A9E"],
  ["Влюблены", "heart", "#B66A87"],
  ["Любовники", "flame", "#8B3F62"],
  ["Тайный роман", "mask", "#3D1534"],
  ["Обещаны друг другу", "scroll", "#D3B87C"],
  ["Лучшие друзья", "spark", "#8DAAB9"],
  ["Неприязнь", "bolt", "#6472A4"],
  ["Враги", "swords", "#5C294D"],
  ["Разведены", "broken", "#8096A6"],
] as const;
const familyKinds = [
  "Биологическое",
  "Усыновление",
  "Опека",
  "Приёмная семья",
  "Отчим / мачеха",
  "Донор",
  "Создатель",
  "Неизвестно",
];

export type LinkEdit =
  { kind: "parent"; link: ParentLink } | { kind: "pair"; pair: PairLink; label: RelationshipLabel };

function getCharacterPhoto(character?: Character) {
  if (!character) return undefined;
  const activeStage = character.stages.find((stage) => stage.name === character.lifeStage);
  return activeStage?.photo?.edited ?? activeStage?.photo?.original;
}

function CharacterAvatar({ character }: { character: Character }) {
  const photo = getCharacterPhoto(character);
  const initials = character.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <span className="character-picker-avatar" style={{ "--picker-accent": character.color } as React.CSSProperties}>
      {photo ? <img src={photo} alt="" draggable={false} /> : <b>{initials || <CircleUserRound size={18} />}</b>}
      <i>{character.type === "pet" ? <PawPrint size={10} /> : <CircleUserRound size={10} />}</i>
    </span>
  );
}

function CharacterPicker({
  label,
  candidates,
  value,
  onChange,
  disabled,
}: {
  label: string;
  candidates: Character[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const { t, valueLabel, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const selected = candidates.find((character) => character.id === value) ?? candidates[0];
  const normalize = (text: string) => text.normalize("NFKC").toLocaleLowerCase(locale).replaceAll("ё", "е");
  const tokens = normalize(search).trim().split(/\s+/).filter(Boolean);
  const filtered = candidates.filter((character) => {
    const names = normalize(
      [character.displayName, character.firstName, character.lastName, ...character.aliases].join(" "),
    );
    return tokens.every((token) => names.includes(token));
  });
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const choose = (id: string) => {
    onChange(id);
    close();
  };

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", closeOnOutside);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutside);
    };
  }, [open]);

  return (
    <div className="field character-picker-field" ref={root}>
      <span>{label}</span>
      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        className="character-picker-trigger"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        onClick={() => {
          setSearch("");
          setOpen((current) => !current);
        }}
      >
        {selected && <CharacterAvatar character={selected} />}
        <span>
          <strong>{selected?.displayName ?? t("chooseCharacter")}</strong>
          {selected && <small>{valueLabel(selected.lifeStage)}</small>}
        </span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div
          className="character-picker-menu"
          data-escape-layer
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              close();
            }
          }}
        >
          <div className="character-picker-search">
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              autoFocus
              value={search}
              placeholder={t("searchCharacter")}
              aria-label={`${t("searchCharacter")} ${label}`}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  root.current?.querySelector<HTMLButtonElement>('[role="option"]')?.focus();
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (filtered.length === 1) choose(filtered[0].id);
                }
              }}
            />
          </div>
          <div
            className="character-picker-options"
            id={listId}
            role="listbox"
            aria-label={label}
            onKeyDown={(event) => {
              if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
              event.preventDefault();
              const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'));
              if (!options.length) return;
              const index = options.indexOf(document.activeElement as HTMLButtonElement);
              options[(index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length]?.focus();
            }}
          >
            {filtered.map((character) => (
              <button
                type="button"
                role="option"
                aria-selected={character.id === value}
                className={character.id === value ? "active" : ""}
                key={character.id}
                onClick={() => choose(character.id)}
              >
                <CharacterAvatar character={character} />
                <span>
                  <strong>{character.displayName}</strong>
                  <small>{valueLabel(character.lifeStage)}</small>
                </span>
              </button>
            ))}
          </div>
          {!filtered.length && (
            <p className="character-picker-empty" role="status">
              {t("emptySearch")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function LinkDialog({
  project,
  selectedId,
  initialKind = "parent",
  editing,
  onClose,
  onParent,
  onPair,
}: {
  project: Project;
  selectedId?: string;
  initialKind?: "parent" | "pair";
  editing?: LinkEdit;
  onClose: () => void;
  onParent: (link: ParentLink) => void;
  onPair: (link: PairLink) => void;
}) {
  const { t, valueLabel } = useI18n();
  const [kind, setKind] = useState<"parent" | "pair">(editing?.kind ?? initialKind);
  const editedParent = editing?.kind === "parent" ? editing.link : undefined;
  const editedLabel = editing?.kind === "pair" ? editing.label : undefined;
  const editedPair = editing?.kind === "pair" ? editing.pair : undefined;
  const candidates = useMemo(() => project.characters, [project.characters]);
  const [fromId, setFromId] = useState(
    editedParent?.parentId ?? editedPair?.aId ?? selectedId ?? candidates[0]?.id ?? "",
  );
  const [toId, setToId] = useState(
    editedParent?.childId ?? editedPair?.bId ?? candidates.find((item) => item.id !== fromId)?.id ?? fromId,
  );
  const [parentKind, setParentKind] = useState(editedParent?.kind ?? "Биологическое");
  const [parentRole, setParentRole] = useState(editedParent?.parentRole ?? "Родитель");
  const [childRole, setChildRole] = useState(editedParent?.childRole ?? "Ребёнок");
  const [relationship, setRelationship] = useState<{ name: string; icon: string; color: string }>(
    editedLabel ?? {
      name: relationshipPresets[0][0],
      icon: relationshipPresets[0][1],
      color: relationshipPresets[0][2],
    },
  );
  const [direction, setDirection] = useState<RelationshipDirection>(editedLabel?.direction ?? "mutual");
  const [secret, setSecret] = useState(editedLabel?.publicity === "secret");
  const [active, setActive] = useState(editedParent?.active ?? editedLabel?.active ?? true);
  const [comment, setComment] = useState(editedParent?.comment ?? editedLabel?.comment ?? "");
  const [biological, setBiological] = useState<ParentLink["biological"]>(editedParent?.biological ?? "yes");
  const [acknowledged, setAcknowledged] = useState(false);
  const cycle =
    kind === "parent" &&
    Boolean(
      fromId &&
      toId &&
      wouldCreateAncestorCycle(
        { ...project, parentLinks: project.parentLinks.filter((link) => link.id !== editedParent?.id) },
        fromId,
        toId,
      ),
    );
  const warning = cycle || (Boolean(fromId) && fromId === toId);
  useEffect(() => setAcknowledged(false), [fromId, toId, kind]);

  const save = () => {
    if (!fromId || !toId || (warning && !acknowledged) || (kind === "pair" && !relationship.name.trim())) return;
    if (kind === "parent") {
      onParent({
        id: editedParent?.id ?? makeId("parent"),
        parentId: fromId,
        childId: toId,
        kind: parentKind,
        parentRole,
        childRole,
        biological,
        active,
        comment,
      });
    } else {
      onPair({
        id: editedPair?.id ?? makeId("pair"),
        aId: fromId,
        bId: toId,
        labels: [
          {
            id: editedLabel?.id ?? makeId("rel"),
            name: relationship.name.trim(),
            icon: relationship.icon,
            color: relationship.color,
            direction,
            active,
            publicity: secret ? "secret" : editedLabel?.publicity === "unknown" ? "unknown" : "open",
            comment,
          },
        ],
      });
    }
  };

  return (
    <Modal title={t(editing ? "editConnection" : "newConnection")} subtitle={t("connectionSubtitle")} onClose={onClose}>
      <div className="modal-body">
        {!editing && (
          <div className="segmented relation-kind">
            <button className={kind === "parent" ? "active" : ""} onClick={() => setKind("parent")}>
              <ArrowDown size={16} /> {t("family")}
            </button>
            <button className={kind === "pair" ? "active" : ""} onClick={() => setKind("pair")}>
              <HeartHandshake size={16} /> {t("relations")}
            </button>
          </div>
        )}
        <div className="connection-picker">
          <CharacterPicker
            label={kind === "parent" ? t("parent") : t("characterA")}
            candidates={candidates}
            value={fromId}
            onChange={setFromId}
            disabled={Boolean(editing)}
          />
          {kind === "parent" ? (
            <button
              type="button"
              className="connection-symbol connection-swap"
              aria-label={t("swapParentChild")}
              title={t("swapParentChild")}
              disabled={Boolean(editing) || !fromId || !toId || fromId === toId}
              onClick={() => {
                setFromId(toId);
                setToId(fromId);
              }}
            >
              <ArrowRightLeft size={20} aria-hidden="true" />
            </button>
          ) : (
            <div className="connection-symbol">
              <Link2 />
            </div>
          )}
          <CharacterPicker
            label={kind === "parent" ? t("child") : t("characterB")}
            candidates={candidates}
            value={toId}
            onChange={setToId}
            disabled={Boolean(editing)}
          />
        </div>
        {warning && (
          <div className="warning-box">
            <strong>{t("unusualConnection")}</strong>
            <p>{t("unusualConnectionHint")}</p>
            <label className="check-row">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
              {t("confirmUnusualConnection")}
            </label>
          </div>
        )}
        {kind === "parent" ? (
          <div className="form-grid">
            <label className="field span-2">
              <span>{t("familyType")}</span>
              <input
                list="family-kinds"
                value={valueLabel(parentKind)}
                onChange={(event) => {
                  const canonical =
                    familyKinds.find((kind) => valueLabel(kind) === event.target.value) ?? event.target.value;
                  setParentKind(canonical);
                  setBiological(canonical === "Биологическое" ? "yes" : "no");
                }}
              />
              <datalist id="family-kinds">
                {familyKinds.map((value) => (
                  <option key={value} value={valueLabel(value)} />
                ))}
              </datalist>
            </label>
            <label className="field span-2">
              <span>{t("biologicalLink")}</span>
              <select
                value={biological}
                onChange={(event) => setBiological(event.target.value as ParentLink["biological"])}
              >
                <option value="yes">{t("yes")}</option>
                <option value="no">{t("no")}</option>
                <option value="unknown">{t("unknown")}</option>
              </select>
            </label>
            <label className="field">
              <span>{t("parentRole")}</span>
              <input value={valueLabel(parentRole)} onChange={(event) => setParentRole(event.target.value)} />
            </label>
            <label className="field">
              <span>{t("childRole")}</span>
              <input value={valueLabel(childRole)} onChange={(event) => setChildRole(event.target.value)} />
            </label>
          </div>
        ) : (
          <div className="form-stack">
            <div className="field">
              <span>{t("relationshipLabel")}</span>
              <div className="relationship-presets">
                {relationshipPresets.map((preset) => (
                  <button
                    key={preset[0]}
                    className={relationship.name === preset[0] ? "active" : ""}
                    style={{ "--rel-color": preset[2] } as React.CSSProperties}
                    onClick={() => setRelationship({ name: preset[0], icon: preset[1], color: preset[2] })}
                  >
                    <i /> {valueLabel(preset[0])}
                  </button>
                ))}
              </div>
            </div>
            <label className="field">
              <span>{t("customRelationship")}</span>
              <input
                value={valueLabel(relationship.name)}
                onChange={(event) => setRelationship({ ...relationship, name: event.target.value })}
              />
            </label>
            <label className="field">
              <span>{t("direction")}</span>
              <select value={direction} onChange={(event) => setDirection(event.target.value as RelationshipDirection)}>
                <option value="mutual">{t("mutual")}</option>
                <option value="a-to-b">{t("fromAToB")}</option>
                <option value="b-to-a">{t("fromBToA")}</option>
              </select>
            </label>
            <label className="check-row">
              <input type="checkbox" checked={secret} onChange={(event) => setSecret(event.target.checked)} />
              <span>{t("secretRelations")}</span>
            </label>
          </div>
        )}
        <div className="form-stack connection-details">
          <label className="check-row">
            <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
            {t("activeConnection")}
          </label>
          <label className="field">
            <span>{t("comment")}</span>
            <textarea rows={3} value={comment} onChange={(event) => setComment(event.target.value)} />
          </label>
        </div>
      </div>
      <footer className="modal-footer">
        <button className="button ghost" onClick={onClose}>
          {t("cancel")}
        </button>
        <button
          className="button primary"
          onClick={save}
          disabled={!fromId || !toId || (warning && !acknowledged) || (kind === "pair" && !relationship.name.trim())}
        >
          <Plus size={17} /> {t(editing ? "save" : "addConnection")}
        </button>
      </footer>
    </Modal>
  );
}
