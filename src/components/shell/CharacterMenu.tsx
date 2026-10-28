import { Camera, Edit3, HeartHandshake, Trash2, UserRoundPlus, UsersRound, type LucideIcon } from "lucide-react";
import { useI18n } from "../../i18n";
import type { Character } from "../../types";

/** What can be done with one character from its right-click menu, the «⋯» menu or the quick «+». */
export type CharacterActions = {
  edit: (id: string) => void;
  addChild: (id: string) => void;
  addParent: (id: string) => void;
  addRelation: (id: string) => void;
  photo: (id: string) => void;
  showRelatives: (id: string) => void;
  trash: (id: string) => void;
};

/** Menu items for one character; pets have no children or parents in the tree. */
export function CharacterMenuItems({
  character,
  actions,
  onDone,
  withEdit = true,
}: {
  character: Character;
  actions: CharacterActions;
  onDone: () => void;
  withEdit?: boolean;
}) {
  const { t } = useI18n();
  const items: Array<[LucideIcon, string, keyof CharacterActions, string?]> = [
    ...(withEdit ? [[Edit3, t("edit"), "edit", "Enter"] as [LucideIcon, string, keyof CharacterActions, string]] : []),
    ...(character.type === "pet"
      ? []
      : ([
          [UserRoundPlus, t("addChild"), "addChild"],
          [UserRoundPlus, t("addParent"), "addParent"],
        ] as Array<[LucideIcon, string, keyof CharacterActions]>)),
    [HeartHandshake, t("addRelations"), "addRelation"],
    [Camera, t("changePhoto"), "photo"],
    [UsersRound, t("showRelatives"), "showRelatives"],
  ];
  const run = (action: keyof CharacterActions) => {
    onDone();
    actions[action](character.id);
  };
  return (
    <>
      {items.map(([Icon, label, action, key]) => (
        <button key={action} className="tb-menu-item" role="menuitem" onClick={() => run(action)}>
          <Icon size={18} />
          <span>{label}</span>
          {key && <kbd>{key}</kbd>}
        </button>
      ))}
      <div className="tb-menu-sep" />
      <button className="tb-menu-item danger" role="menuitem" onClick={() => run("trash")}>
        <Trash2 size={18} />
        <span>{t("moveToTrash")}</span>
        <kbd>Delete</kbd>
      </button>
    </>
  );
}
