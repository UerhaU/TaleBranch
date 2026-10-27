import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Bone, CircleUserRound, Ghost, PawPrint, Skull } from "lucide-react";
import type { Character } from "../types";
import { useI18n } from "../i18n";

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

export function CharacterNode({ data }: NodeProps) {
  const { t } = useI18n();
  const nodeData = data as CharacterNodeData;
  const { character, pets, onOpen } = nodeData;
  const photo = activePhoto(character);

  return (
    <article
      className={`character-node portrait-node portrait-status-${character.status} ${nodeData.selected ? "is-selected" : ""}`}
      style={{ "--node-accent": character.color } as React.CSSProperties}
      title={character.displayName}
      aria-label={character.displayName}
      onDoubleClick={() => onOpen(character.id)}
    >
      <Handle type="target" position={Position.Top} className="node-handle" isConnectable={false} />
      <div className="main-portrait">
        {photo ? (
          <img src={photo} alt="" draggable={false} />
        ) : (
          <span>{initials(character) || <CircleUserRound />}</span>
        )}
        {character.status !== "alive" && (
          <i className="portrait-status" title={t(character.status)}>
            {character.status === "dead" ? (
              <Skull size={13} />
            ) : character.status === "missing" ? (
              <Ghost size={13} />
            ) : (
              <Bone size={13} />
            )}
          </i>
        )}
      </div>
      <div className="pet-orbit" aria-label={t("petsOf", { name: character.displayName })}>
        {pets.map((pet, index) => {
          const angle = -45 + index * (360 / Math.max(pets.length, 1));
          const radius = 58;
          const x = Math.cos((angle * Math.PI) / 180) * radius;
          const y = Math.sin((angle * Math.PI) / 180) * radius;
          const petPhoto = activePhoto(pet);
          return (
            <button
              type="button"
              key={pet.id}
              className={`pet-portrait ${nodeData.selectedPetId === pet.id ? "is-selected" : ""}`}
              style={{ "--pet-x": `${x}px`, "--pet-y": `${y}px`, "--pet-accent": pet.color } as React.CSSProperties}
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
                <span>{initials(pet) || <PawPrint size={14} />}</span>
              )}
              <i>
                <PawPrint size={9} />
              </i>
            </button>
          );
        })}
      </div>
      <Handle type="source" position={Position.Bottom} className="node-handle" isConnectable={false} />
    </article>
  );
}
