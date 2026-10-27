import { useState, type RefObject } from "react";
import { Search, X } from "lucide-react";
import { useI18n } from "../../i18n";
import type { TreeView } from "../../hooks/useTreeView";
import type { Character } from "../../types";
import { Avatar } from "../CharacterNode";

/** Search in the top capsule: filters the tree while typing and lists matches to fly to. */
export function SearchBox({
  view,
  searchInput,
  onPick,
}: {
  view: TreeView;
  searchInput: RefObject<HTMLInputElement | null>;
  onPick: (character: Character) => void;
}) {
  const { t } = useI18n();
  const [focused, setFocused] = useState(false);
  const matches = view.search.trim() ? view.visibleCharacters.slice(0, 8) : [];
  const pick = (character: Character) => {
    setFocused(false);
    searchInput.current?.blur();
    onPick(character);
  };
  return (
    <div
      className="tb-search"
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <Search size={18} />
      <input
        ref={searchInput}
        value={view.search}
        onChange={(event) => view.setSearch(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && matches[0]) pick(matches[0]);
          if (event.key === "Escape") {
            view.setSearch("");
            event.currentTarget.blur();
          }
        }}
        placeholder={t("searchCharacter")}
        aria-label={t("searchCharacter")}
      />
      {view.search ? (
        <button className="tb-icon-btn" onClick={() => view.setSearch("")} title={t("close")} aria-label={t("close")}>
          <X size={15} />
        </button>
      ) : (
        <kbd>Ctrl K</kbd>
      )}
      {focused && view.search.trim() && (
        <div className="tb-menu tb-search-results" role="listbox" aria-label={t("searchCharacter")}>
          {!matches.length && <p className="tb-menu-note">{t("emptySearch")}</p>}
          {matches.map((character) => (
            <button
              key={character.id}
              className="tb-menu-item"
              role="option"
              aria-selected={false}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(character)}
            >
              <Avatar character={character} size={30} />
              <span>
                <strong>{character.displayName}</strong>
                {character.type === "pet" && <small>{t("pet")}</small>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
