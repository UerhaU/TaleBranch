import { MiniMap, useReactFlow, useViewport } from "@xyflow/react";
import { Eye, Maximize, Minus, Network, Plus } from "lucide-react";
import { useI18n } from "../../i18n";
import type { Dialogs } from "../../hooks/useDialogs";
import type { TreeView } from "../../hooks/useTreeView";
import type { CharacterNodeData } from "../CharacterNode";
import type { CharacterStatus } from "../../types";
import { Popover } from "./Popover";
import { displayColor } from "../../lib/colors";

/** Bottom right island: zoom, «Show all», auto layout, the «View ▾» menu and the mini map. */
export function MapIsland({
  view,
  dialogs,
  total,
  loadError,
  showMinimap = true,
  onShowAll,
  onAutoLayout,
}: {
  view: TreeView;
  dialogs: Dialogs;
  total: number;
  loadError: boolean;
  showMinimap?: boolean;
  onShowAll: () => void;
  onAutoLayout: () => void;
}) {
  const { t } = useI18n();
  const flow = useReactFlow();
  const { zoom } = useViewport();
  const viewOpen = Boolean(dialogs.state.filters);
  const filtered = view.statusFilter !== "all" || !view.showParents || !view.showRelations || Boolean(view.search);
  const statuses: Array<[CharacterStatus | "all", string]> = [
    ["all", t("all")],
    ["alive", t("alive")],
    ["dead", t("dead")],
    ["missing", t("missing")],
  ];
  return (
    <div className="tb-island tb-map tb-no-export">
      <div className="tb-map-tools">
        <button className="tb-icon-btn" title={t("graphZoomOut")} onClick={() => void flow.zoomOut({ duration: 200 })}>
          <Minus size={18} />
        </button>
        <span className="tb-zoom-value" aria-live="polite">
          {Math.round(zoom * 100)}%
        </span>
        <button className="tb-icon-btn" title={t("graphZoomIn")} onClick={() => void flow.zoomIn({ duration: 200 })}>
          <Plus size={18} />
        </button>
        <button className="tb-icon-btn" title={`${t("showAll")} (F)`} onClick={onShowAll}>
          <Maximize size={17} />
        </button>
        <button
          className="tb-icon-btn tb-autolayout"
          disabled={loadError}
          onClick={onAutoLayout}
          title={t("arrangeAuto")}
          aria-label={t("arrangeAuto")}
        >
          <Network size={17} />
        </button>
        <Popover
          open={viewOpen}
          onOpenChange={(open) => (open ? dialogs.open("filters") : dialogs.close("filters"))}
          placement="up"
          align="end"
          menuClassName="tb-view-menu filter-panel"
          label={t("viewFilters")}
          trigger={
            <button
              className={`tb-pill-btn ${viewOpen ? "is-open" : ""}`}
              aria-haspopup="menu"
              aria-expanded={viewOpen}
              title={filtered ? t("visibleCharacters", { visible: view.visibleCharacters.length, total }) : t("view")}
              onClick={() => dialogs.toggle("filters")}
            >
              <Eye size={17} />
              <span>{t("view")}</span>
              {filtered && <i className="tb-dot" />}
            </button>
          }
        >
          <label className="tb-toggle">
            <span>{t("family")}</span>
            <input
              type="checkbox"
              checked={view.showParents}
              onChange={(event) => view.setShowParents(event.target.checked)}
            />
            <i />
          </label>
          <label className="tb-toggle">
            <span>{t("relations")}</span>
            <input
              type="checkbox"
              checked={view.showRelations}
              onChange={(event) => view.setShowRelations(event.target.checked)}
            />
            <i />
          </label>
          <div className="tb-menu-sep" />
          <div className="tb-menu-label">{t("status")}</div>
          <div className="tb-seg" role="group" aria-label={t("status")}>
            {statuses.map(([value, label]) => (
              <button
                key={value}
                className={view.statusFilter === value ? "active" : ""}
                aria-pressed={view.statusFilter === value}
                onClick={() => view.setStatusFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="tb-menu-note">{t("visibleCharacters", { visible: view.visibleCharacters.length, total })}</p>
          {(view.statusFilter !== "all" || view.search) && (
            <button className="tb-menu-item" onClick={view.resetFilters}>
              <span>{t("resetFilters")}</span>
            </button>
          )}
          <div className="tb-menu-sep" />
          <div className="tb-menu-label">{t("legend")}</div>
          <div className="tb-legend">
            <span>
              <i /> {t("family")}
            </span>
            <span>
              <i className="tb-legend-rel" /> {t("relations")}
            </span>
          </div>
        </Popover>
      </div>
      {showMinimap && (
        <MiniMap
          pannable
          zoomable
          className="mini-map"
          style={{ width: 210, height: 120 }}
          nodeColor={(node) => displayColor((node.data as CharacterNodeData).character.color)}
          nodeBorderRadius={40}
          maskColor="var(--tb-minimap-mask)"
        />
      )}
    </div>
  );
}
