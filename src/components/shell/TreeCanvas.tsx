import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type RefObject } from "react";
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  type AriaLabelConfig,
  type Edge,
  type Node,
  type OnNodesChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import { Maximize, Network, Plus, Search } from "lucide-react";
import { Avatar, CharacterNode, QuickLinkContext, type CharacterNodeData, type QuickKind } from "../CharacterNode";
import { RelationshipEdge } from "../RelationshipEdge";
import { FamilyEdge } from "../FamilyEdge";
import { useI18n } from "../../i18n";
import type { ProjectApi } from "../../hooks/projectApi";
import type { Dialogs } from "../../hooks/useDialogs";
import type { TreeView } from "../../hooks/useTreeView";
import { MapIsland } from "./MapIsland";
import { ContextMenu } from "./ContextMenu";
import { CharacterMenuItems, type CharacterActions } from "./CharacterMenu";

const nodeTypes = { character: CharacterNode };
const edgeTypes = { relationship: RelationshipEdge, family: FamilyEdge };

export type FlowInstance = ReactFlowInstance<Node<CharacterNodeData>, Edge>;
type Point = { x: number; y: number };
type MenuState = Point & ({ kind: "person"; id: string } | { kind: "empty"; at: Point });
type QuickDrag = { from: Point; to: Point };

/** Room for «Show all» so the cards do not end up under the floating panels. */
export function fitPadding() {
  const inspector = document.querySelector(".tb-inspector")?.getBoundingClientRect().width ?? 0;
  return { top: "96px", bottom: "120px", left: "32px", right: `${inspector ? inspector + 48 : 32}px` } as const;
}

/** The tree field across the whole window: cards, lines, right-click menus, the map island and the empty state. */
export function TreeCanvas({
  app,
  view,
  dialogs,
  flowInstance,
  actions,
  showMinimap,
  onAddCharacter,
  onShowAll,
  onAutoLayout,
}: {
  app: ProjectApi;
  view: TreeView;
  dialogs: Dialogs;
  flowInstance: RefObject<FlowInstance | null>;
  actions: CharacterActions;
  showMinimap: boolean;
  onAddCharacter: (position?: Point) => void;
  onShowAll: () => void;
  onAutoLayout: () => void;
}) {
  const { t } = useI18n();
  const { project } = app;
  const [localNodes, setLocalNodes] = useState<Node<CharacterNodeData>[]>([]);
  useEffect(() => setLocalNodes(view.nodes), [view.nodes]);
  const onNodesChange: OnNodesChange<Node<CharacterNodeData>> = useCallback((changes) => {
    setLocalNodes((current) => applyNodeChanges(changes, current));
  }, []);
  const [menu, setMenu] = useState<MenuState>();
  const [drag, setDrag] = useState<QuickDrag>();
  const dragged = useRef(false);
  const menuCharacter = menu?.kind === "person" ? project.characters.find((item) => item.id === menu.id) : undefined;

  const quick = useMemo(() => {
    const click = (kind: QuickKind, id: string) => {
      if (dragged.current) return;
      if (kind === "parent") actions.addParent(id);
      else if (kind === "child") actions.addChild(id);
      else actions.addRelation(id);
    };
    const start = (event: PointerEvent, kind: QuickKind, id: string) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      const from = { x: event.clientX, y: event.clientY };
      dragged.current = false;
      const move = (moveEvent: globalThis.PointerEvent) => {
        const to = { x: moveEvent.clientX, y: moveEvent.clientY };
        if (!dragged.current && Math.hypot(to.x - from.x, to.y - from.y) < 6) return;
        dragged.current = true;
        setDrag({ from, to });
      };
      const up = (upEvent: globalThis.PointerEvent) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        setDrag(undefined);
        if (!dragged.current) return;
        // The click that may follow a drag must not create a new character.
        window.setTimeout(() => (dragged.current = false), 0);
        const target = document
          .elementsFromPoint(upEvent.clientX, upEvent.clientY)
          .map((element) => element.closest<HTMLElement>("[data-character-id], .react-flow__node"))
          .find(Boolean);
        const other = target?.dataset.characterId ?? target?.dataset.id;
        if (!other || other === id) return;
        if (kind === "parent") dialogs.open("link", { kind: "parent", fromId: other, toId: id });
        else if (kind === "child") dialogs.open("link", { kind: "parent", fromId: id, toId: other });
        else dialogs.open("link", { kind: "pair", fromId: id, toId: other });
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    };
    return { start, click };
  }, [actions, dialogs]);

  const graphAriaLabels = useMemo<Partial<AriaLabelConfig>>(
    () => ({
      "node.a11yDescription.default": t("graphNodeSelect"),
      "node.a11yDescription.keyboardDisabled": t("graphNodeMove"),
      "node.a11yDescription.ariaLiveMessage": ({ direction, x, y }) => {
        const directionKey = (
          { up: "directionUp", down: "directionDown", left: "directionLeft", right: "directionRight" } as const
        )[direction as "up" | "down" | "left" | "right"];
        return t("graphNodeMoved", { direction: directionKey ? t(directionKey) : direction, x, y });
      },
      "edge.a11yDescription.default": t("graphEdgeSelect"),
      "controls.ariaLabel": t("graphControls"),
      "controls.zoomIn.ariaLabel": t("graphZoomIn"),
      "controls.zoomOut.ariaLabel": t("graphZoomOut"),
      "controls.fitView.ariaLabel": t("graphFitView"),
      "controls.interactive.ariaLabel": t("graphToggleInteractivity"),
      "minimap.ariaLabel": t("graphMiniMap"),
      "handle.ariaLabel": t("graphHandle"),
    }),
    [t],
  );

  return (
    <ReactFlowProvider>
      <QuickLinkContext.Provider value={app.loadError ? undefined : quick}>
        <div className="tb-field tb-canvas flow-wrap">
          <ReactFlow
            nodes={localNodes}
            edges={view.edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onInit={(instance) => {
              flowInstance.current = instance;
            }}
            onNodesChange={onNodesChange}
            onNodeClick={(_, node) => view.setSelectedId(node.id)}
            onNodeDragStop={(_, node) => app.updatePosition(node.id, node.position, true)}
            onPaneClick={() => view.setSelectedId(undefined)}
            onNodeContextMenu={(event, node) => {
              event.preventDefault();
              const pet = (event.target as HTMLElement).closest<HTMLElement>("[data-character-id]")?.dataset
                .characterId;
              const id = pet ?? node.id;
              view.setSelectedId(id);
              setMenu({ kind: "person", id, x: event.clientX, y: event.clientY });
            }}
            onPaneContextMenu={(event) => {
              event.preventDefault();
              const at = flowInstance.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY }) ?? {
                x: 0,
                y: 0,
              };
              setMenu({ kind: "empty", x: event.clientX, y: event.clientY, at });
            }}
            onMoveStart={() => setMenu(undefined)}
            minZoom={0.12}
            maxZoom={1.8}
            defaultViewport={{ x: 40, y: 25, zoom: 0.78 }}
            proOptions={{ hideAttribution: true }}
            fitView
            fitViewOptions={{ padding: fitPadding() }}
            ariaLabelConfig={graphAriaLabels}
            selectionOnDrag
            panOnScroll
            deleteKeyCode={null}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={2.6} />
          </ReactFlow>
        </div>
      </QuickLinkContext.Provider>
      {drag && (
        <svg className="tb-quick-line" aria-hidden="true">
          <line x1={drag.from.x} y1={drag.from.y} x2={drag.to.x} y2={drag.to.y} />
          <circle cx={drag.to.x} cy={drag.to.y} r={6} />
        </svg>
      )}
      {menu?.kind === "person" && menuCharacter && (
        <ContextMenu x={menu.x} y={menu.y} label={menuCharacter.displayName} onClose={() => setMenu(undefined)}>
          <div className="tb-menu-head">
            <Avatar character={menuCharacter} size={32} />
            <b>{menuCharacter.displayName}</b>
          </div>
          <CharacterMenuItems character={menuCharacter} actions={actions} onDone={() => setMenu(undefined)} />
        </ContextMenu>
      )}
      {menu?.kind === "empty" && (
        <ContextMenu x={menu.x} y={menu.y} label={t("tree")} onClose={() => setMenu(undefined)}>
          <button
            className="tb-menu-item"
            role="menuitem"
            disabled={app.loadError}
            onClick={() => {
              setMenu(undefined);
              onAddCharacter(menu.at);
            }}
          >
            <Plus size={18} />
            <span>{t("addCharacterHere")}</span>
            <kbd>N</kbd>
          </button>
          <button
            className="tb-menu-item"
            role="menuitem"
            disabled={app.loadError || !project.characters.length}
            onClick={() => {
              setMenu(undefined);
              onAutoLayout();
            }}
          >
            <Network size={18} />
            <span>{t("arrangeAuto")}</span>
          </button>
          <button
            className="tb-menu-item"
            role="menuitem"
            onClick={() => {
              setMenu(undefined);
              onShowAll();
            }}
          >
            <Maximize size={18} />
            <span>{t("showAll")}</span>
            <kbd>F</kbd>
          </button>
        </ContextMenu>
      )}
      {!view.visiblePeople.length && (
        <div className="tb-island canvas-empty">
          <Search size={26} />
          <h3>{project.characters.length ? t("emptySearch") : t("emptyTree")}</h3>
          <p>{project.characters.length ? t("emptySearchHint") : t("emptyTreeHint")}</p>
          <button
            className="button primary"
            disabled={app.loadError}
            title={project.characters.length ? undefined : `${t("addCharacter")} (N)`}
            onClick={() => (project.characters.length ? view.resetFilters() : onAddCharacter())}
          >
            {project.characters.length ? (
              t("resetFilters")
            ) : (
              <>
                <Plus size={16} /> {t("addCharacter")}
              </>
            )}
          </button>
        </div>
      )}
      <MapIsland
        view={view}
        dialogs={dialogs}
        total={project.characters.length}
        loadError={app.loadError}
        showMinimap={showMinimap}
        onShowAll={onShowAll}
        onAutoLayout={onAutoLayout}
      />
    </ReactFlowProvider>
  );
}
