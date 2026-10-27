import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
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
import { Plus, Search } from "lucide-react";
import { CharacterNode, type CharacterNodeData } from "../CharacterNode";
import { RelationshipEdge } from "../RelationshipEdge";
import { FamilyEdge } from "../FamilyEdge";
import { useI18n } from "../../i18n";
import type { ProjectApi } from "../../hooks/projectApi";
import type { Dialogs } from "../../hooks/useDialogs";
import type { TreeView } from "../../hooks/useTreeView";
import { MapIsland } from "./MapIsland";

const nodeTypes = { character: CharacterNode };
const edgeTypes = { relationship: RelationshipEdge, family: FamilyEdge };

export type FlowInstance = ReactFlowInstance<Node<CharacterNodeData>, Edge>;

/** Room for «Show all» so the cards do not end up under the floating panels. */
export function fitPadding() {
  const inspector = document.querySelector(".tb-inspector")?.getBoundingClientRect().width ?? 0;
  return { top: "96px", bottom: "120px", left: "32px", right: `${inspector ? inspector + 48 : 32}px` } as const;
}

/** The tree field across the whole window: cards, lines, the map island and the empty state. */
export function TreeCanvas({
  app,
  view,
  dialogs,
  flowInstance,
  onAddCharacter,
  onShowAll,
  onAutoLayout,
}: {
  app: ProjectApi;
  view: TreeView;
  dialogs: Dialogs;
  flowInstance: RefObject<FlowInstance | null>;
  onAddCharacter: () => void;
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
      {!view.visiblePeople.length && (
        <div className="tb-island canvas-empty">
          <Search size={26} />
          <h3>{project.characters.length ? t("emptySearch") : t("emptyTree")}</h3>
          <p>{project.characters.length ? t("emptySearchHint") : t("emptyTreeHint")}</p>
          <button
            className="button primary"
            disabled={app.loadError}
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
        onShowAll={onShowAll}
        onAutoLayout={onAutoLayout}
      />
    </ReactFlowProvider>
  );
}
