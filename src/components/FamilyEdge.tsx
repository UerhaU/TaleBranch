import { BaseEdge, useInternalNode, type Edge, type EdgeProps } from "@xyflow/react";
import { nodeBox } from "./RelationshipEdge";

export type FamilyEdgeData = {
  /** The child's other parent. When both parents stand in one row, a single line starts between them. */
  coParentId?: string;
  /** Only one of the two parents' edges draws the shared line. */
  drawsShared?: boolean;
};

const CORNER = 14;

/** Parent → child: down, across and down again with rounded corners. */
export function FamilyEdge({ id, source, target, data, style }: EdgeProps<Edge<FamilyEdgeData>>) {
  const parent = useInternalNode(source);
  const child = useInternalNode(target);
  const coParent = useInternalNode(data?.coParentId ?? "");
  if (!parent || !child) return null;
  const p = nodeBox(parent);
  const c = nodeBox(child);
  const q = coParent ? nodeBox(coParent) : undefined;
  const shared = q && Math.abs(q.cy - p.cy) < 4;
  if (shared && !data?.drawsShared) return null;
  const sx = shared ? (p.cx + q.cx) / 2 : p.cx;
  const sy = shared ? p.cy : p.bottom;
  const bottom = shared ? Math.max(p.bottom, q.bottom) : p.bottom;
  const tx = c.cx;
  const ty = c.y;
  const midY = ty > bottom ? (bottom + ty) / 2 : sy + CORNER * 2;
  const dx = tx - sx;
  const turn = Math.sign(dx);
  const path =
    Math.abs(dx) < 2 * CORNER
      ? `M${sx} ${sy} L${sx} ${midY} L${tx} ${midY} L${tx} ${ty}`
      : `M${sx} ${sy} L${sx} ${midY - CORNER} Q${sx} ${midY} ${sx + turn * CORNER} ${midY} L${tx - turn * CORNER} ${midY} Q${tx} ${midY} ${tx} ${midY + CORNER} L${tx} ${ty}`;
  return <BaseEdge id={id} path={path} style={style} />;
}
