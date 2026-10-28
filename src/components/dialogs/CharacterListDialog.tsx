import { Modal } from "../Modal";
import { Avatar } from "../CharacterNode";
import { useI18n } from "../../i18n";
import type { Character, Project } from "../../types";

export function CharacterListDialog({
  project,
  onPick,
  onClose,
}: {
  project: Project;
  onPick: (character: Character) => void;
  onClose: () => void;
}) {
  const { t, valueLabel } = useI18n();
  return (
    <Modal
      title={t("characterList")}
      subtitle={t("charactersCount", { count: project.characters.length })}
      onClose={onClose}
    >
      <div className="modal-body character-list">
        {project.characters.map((character) => (
          <button key={character.id} onClick={() => onPick(character)}>
            <Avatar character={character} size={40} />
            <span>
              <strong>{character.displayName}</strong>
              <small>
                {t(character.type)} · {valueLabel(character.lifeStage)}
                {character.status !== "alive"
                  ? ` · ${t(character.status === "unknown" ? "notDefined" : character.status)}`
                  : ""}
              </small>
            </span>
          </button>
        ))}
        {!project.characters.length && <p className="tb-hint">{t("emptyTree")}</p>}
      </div>
    </Modal>
  );
}
