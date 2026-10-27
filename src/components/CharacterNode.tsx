import type { CSSProperties, ReactNode } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Bone, CircleUserRound, Ghost, PawPrint, Skull } from "lucide-react";
import type { Character } from "../types";
import { useI18n } from "../i18n";
import { CatalogValue } from "./CatalogDisplay";
import { displayColor } from "../lib/colors";

export type CharacterNodeData = {
  character: Character;
  pets: Character[];
  selected: boolean;
  selectedPetId?: string;
  onOpen: (id: string) => void;
};

function activePhoto(character: Character) {
  const stage = character.stages.find((item) => item.name === character.lifeStage);
  return stage?.photo?.edited ?? stage?.photo?.original;
}

function initials(character: Character) {
  return character.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

/** Round portrait: photo of the current life stage or initials on the character's color. */
export function Avatar({
  character,
  size,
  ring = false,
  children,
}: {
  character: Character;
  size: number;
  ring?: boolean;
  children?: ReactNode;
}) {
  const photo = activePhoto(character);
  return (
    <span
      className={`tb-avatar ${ring ? "tb-avatar-ring" : ""}`}
      style={{ "--pc": displayColor(character.color), "--size": `${size}px` } as CSSProperties}
    >
      <span className="tb-avatar-in">
        {photo ? (
          <img src={photo} alt="" draggable={false} />
        ) : (
          initials(character) ||
          (character.type === "pet" ? <PawPrint size={size * 0.4} /> : <CircleUserRound size={size * 0.4} />)
        )}
      </span>
      {children}
    </span>
  );
}

const statusIcons = { dead: Skull, missing: Ghost, unknown: Bone };

export function CharacterNode({ data }: NodeProps) {
  const { t } = useI18n();
  const nodeData = data as CharacterNodeData;
  const { character, pets, onOpen } = nodeData;
  const StatusIcon = character.status !== "alive" ? statusIcons[character.status] : undefined;

  return (
    <article
      className={`tb-card character-node status-${character.status} ${nodeData.selected ? "is-selected" : ""}`}
      style={{ "--pc": displayColor(character.color) } as CSSProperties}
      title={character.displayName}
      aria-label={character.displayName}
      onDoubleClick={() => onOpen(character.id)}
    >
      <Handle type="target" position={Position.Top} className="node-handle" isConnectable={false} />
      <Avatar character={character} size={54} ring>
        {StatusIcon && (
          <i className="tb-avatar-mark" title={t(character.status)}>
            <StatusIcon size={12} />
          </i>
        )}
        {pets.map((pet, index) => {
          // The first pet sits top right, the others go around the portrait.
          const angle = ((-45 + index * (360 / pets.length)) * Math.PI) / 180;
          const radius = 36;
          const petPhoto = activePhoto(pet);
          return (
            <button
              type="button"
              key={pet.id}
              className={`tb-pet ${nodeData.selectedPetId === pet.id ? "is-selected" : ""}`}
              style={
                {
                  "--pet-x": `${(Math.cos(angle) * radius).toFixed(1)}px`,
                  "--pet-y": `${(Math.sin(angle) * radius).toFixed(1)}px`,
                  "--pet-accent": displayColor(pet.color),
                } as CSSProperties
              }
              aria-label={`${t("pet")}: ${pet.displayName}`}
              title={pet.displayName}
              onClick={(event) => {
                event.stopPropagation();
                onOpen(pet.id);
              }}
            >
              {petPhoto ? (
                <img src={petPhoto} alt="" draggable={false} />
              ) : (
                <span>{initials(pet) || <PawPrint size={12} />}</span>
              )}
              <i>
                <PawPrint size={9} />
              </i>
            </button>
          );
        })}
      </Avatar>
      <div className="tb-card-text">
        <strong className="tb-card-name">{character.displayName}</strong>
        <span className="tb-card-stage">
          <CatalogValue
            kind="ages"
            value={character.lifeStage}
            character={character}
            suffix={character.status !== "alive" ? t(character.status) : undefined}
          />
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} className="node-handle" isConnectable={false} />
    </article>
  );
}
