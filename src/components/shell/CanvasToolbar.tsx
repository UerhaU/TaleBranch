import type { RefObject } from "react";
import { Filter, Focus, ListFilter, Search, X } from "lucide-react";
import { useI18n } from "../../i18n";
import type { Dialogs } from "../../hooks/useDialogs";
import type { TreeView } from "../../hooks/useTreeView";
import type { CharacterStatus } from "../../types";

/** Search field, filter button and the filter panel that opens below. */
export function CanvasToolbar({
  view,
  dialogs,
  total,
  searchInput,
  onShowAll,
}: {
  view: TreeView;
  dialogs: Dialogs;
  total: number;
  searchInput: RefObject<HTMLInputElement | null>;
  onShowAll: () => void;
}) {
  const { t } = useI18n();
  const showFilters = Boolean(dialogs.state.filters);
  return (
    <>
      <section className="canvas-toolbar">
        <div className="search-box">
          <Search size={17} />
          <input
            ref={searchInput}
            value={view.search}
            onChange={(event) => view.setSearch(event.target.value)}
            placeholder={t("searchCharacter")}
            aria-label={t("searchCharacter")}
          />
          {view.search && (
            <button onClick={() => view.setSearch("")}>
              <X size={14} />
            </button>
          )}
          <kbd>Ctrl K</kbd>
        </div>
        <button className={showFilters ? "active" : ""} onClick={() => dialogs.toggle("filters")}>
          <ListFilter size={16} /> {t("filters")} {view.statusFilter !== "all" && <i />}
        </button>
        <button onClick={onShowAll}>
          <Focus size={16} /> {t("showAll")}
        </button>
        <div className="view-label">{t("visibleCharacters", { visible: view.visibleCharacters.length, total })}</div>
      </section>

      {showFilters && (
        <section className="filter-panel">
          <div className="filter-title">
            <Filter size={16} />
            <strong>{t("viewFilters")}</strong>
          </div>
          <label>
            {t("status")}
            <select
              value={view.statusFilter}
              onChange={(event) => view.setStatusFilter(event.target.value as CharacterStatus | "all")}
            >
              <option value="all">{t("all")}</option>
              <option value="alive">{t("alive")}</option>
              <option value="dead">{t("dead")}</option>
              <option value="missing">{t("missing")}</option>
            </select>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={view.showParents}
              onChange={(event) => view.setShowParents(event.target.checked)}
            />
            <span>{t("family")}</span>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={view.showRelations}
              onChange={(event) => view.setShowRelations(event.target.checked)}
            />
            <span>{t("relations")}</span>
          </label>
          <button className="icon-button" onClick={() => dialogs.close("filters")}>
            <X size={16} />
          </button>
        </section>
      )}
    </>
  );
}
