import { Modal } from "../Modal";
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
            <strong>{character.displayName}</strong>
            <small>
              {t(character.type)} · {valueLabel(character.lifeStage)} · {t(character.status)}
            </small>
          </button>
        ))}
        {!project.characters.length && <p>{t("emptyTree")}</p>}
      </div>
    </Modal>
  );
}
