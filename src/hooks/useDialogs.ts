import { useCallback, useMemo, useReducer } from "react";
import type { LinkEdit } from "../components/LinkDialog";
import type { Character, CharacterType, PhotoTransform } from "../types";

export type PhotoDraft = { original: string; stageName: string; characterId: string; transform?: PhotoTransform };
export type DeleteDraft = { character: Character; family: number; pairs: number; photos: number };
export type PermanentDeleteDraft = { projectId: string } & (
  { kind: "character"; id: string; name: string } | { kind: "trash"; ids: string[] } | { kind: "dynasty"; name: string }
);
export type ConfirmAction = { title: string; run: () => void };
export type LinkDialogState = { kind: "parent" | "pair"; editing?: LinkEdit };
export type UtilityPanel = "guide" | "updates" | "donation";

/**
 * Every window, menu and panel of the main screen that can be opened.
 * `true` means the window needs no extra data. Several can be open at once,
 * for example the trash and the permanent delete confirmation above it.
 */
type DialogValues = {
  projectMenu: true;
  filters: true;
  addCharacter: { type: CharacterType };
  editCharacter: Character;
  link: LinkDialogState;
  photo: PhotoDraft;
  confirm: ConfirmAction;
  settings: true;
  characterList: true;
  deleteCharacter: DeleteDraft;
  trash: true;
  catalog: true;
  about: true;
  utility: UtilityPanel;
  permanentDelete: PermanentDeleteDraft;
};
export type DialogName = keyof DialogValues;
export type DialogState = { [K in DialogName]?: DialogValues[K] };

type DialogAction =
  { type: "open"; name: DialogName; value: DialogValues[DialogName] } | { type: "close"; names: DialogName[] };

function reducer(state: DialogState, action: DialogAction): DialogState {
  if (action.type === "open") return { ...state, [action.name]: action.value };
  if (action.names.every((name) => state[name] === undefined)) return state;
  const next = { ...state };
  action.names.forEach((name) => delete next[name]);
  return next;
}

export function useDialogs() {
  const [state, dispatch] = useReducer(reducer, {});
  const open = useCallback(
    <K extends DialogName>(name: K, ...value: DialogValues[K] extends true ? [] : [DialogValues[K]]) =>
      dispatch({ type: "open", name, value: value.length ? value[0] : true } as DialogAction),
    [],
  );
  const close = useCallback((...names: DialogName[]) => dispatch({ type: "close", names }), []);
  const toggle = useCallback(
    (name: { [K in DialogName]: DialogValues[K] extends true ? K : never }[DialogName]) =>
      dispatch(state[name] ? { type: "close", names: [name] } : { type: "open", name, value: true }),
    [state],
  );
  return useMemo(() => ({ state, open, close, toggle }), [state, open, close, toggle]);
}

export type Dialogs = ReturnType<typeof useDialogs>;
