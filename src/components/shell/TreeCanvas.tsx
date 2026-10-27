import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  applyNodeChanges,
  type AriaLabelConfig,
  type Edge,
  type Node,
  type OnNodesChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import { Link2, Plus, Search } from "lucide-react";
import { CharacterNode, type CharacterNodeData } from "../CharacterNode";
import { RelationshipEdge } from "../RelationshipEdge";
import { useI18n } from "../../i18n";
import type { ProjectApi } from "../../hooks/projectApi";
import type { TreeView } from "../../hooks/useTreeView";
import type { Theme } from "../../types";

const nodeTypes = { character: CharacterNode };
const edgeTypes = { relationship: RelationshipEdge };

export type FlowInstance = ReactFlowInstance<Node<CharacterNodeData>, Edge>;

/** The tree field: cards, lines, mini map, legend and the empty state. */
export function TreeCanvas({
  app,
  view,
  theme,
  flowInstance,
  onAddCharacter,
  onAddLink,
}: {
  app: ProjectApi;
  view: TreeView;
  theme: Theme;
  flowInstance: RefObject<FlowInstance | null>;
  onAddCharacter: () => void;
  onAddLink: () => void;
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
    <div className="flow-wrap">
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
        fitViewOptions={{ padding: 0.2 }}
        ariaLabelConfig={graphAriaLabels}
        selectionOnDrag
        panOnScroll
        deleteKeyCode={null}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
        <MiniMap
          pannable
          zoomable
          className="mini-map"
          nodeColor={(node) => (node.data as CharacterNodeData).character.color}
          maskColor={theme === "dark" ? "rgba(22,11,24,.74)" : "rgba(232,238,241,.72)"}
        />
        <Controls showInteractive={false} position="bottom-left" />
      </ReactFlow>
      {!view.visiblePeople.length && (
        <div className="canvas-empty">
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
      <div className="legend">
        <span className="eyebrow">{t("legend")}</span>
        <div>
          <i className="line family" /> {t("family")}
        </div>
        <div>
          <i className="line pair" /> {t("relations")}
        </div>
      </div>
      <button className="floating-link" onClick={onAddLink} disabled={project.characters.length < 1}>
        <Link2 size={17} /> {t("addConnection")}
      </button>
    </div>
  );
}
