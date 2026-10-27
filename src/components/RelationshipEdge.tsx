import { BaseEdge, type Edge, type EdgeProps } from "@xyflow/react";

export type RelationshipEdgeData = { text: string };

export function RelationshipEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerStart,
  markerEnd,
  style,
  data,
  selected,
}: EdgeProps<Edge<RelationshipEdgeData>>) {
  const dx = targetX - sourceX,
    dy = targetY - sourceY;
  const distance = Math.hypot(dx, dy) || 1;
  // Curve personal connections away from the straight/stepped parent–child path.
  const bend = Math.min(150, Math.max(90, distance * 0.25));
  const cx = (sourceX + targetX) / 2 - (dy / distance) * bend;
  const cy = (sourceY + targetY) / 2 + (dx / distance) * bend;
  const labelX = sourceX * 0.25 + cx * 0.5 + targetX * 0.25;
  const labelY = sourceY * 0.25 + cy * 0.5 + targetY * 0.25;
  return (
    <BaseEdge
      id={id}
      path={`M ${sourceX} ${sourceY} Q ${cx} ${cy} ${targetX} ${targetY}`}
      markerStart={markerStart}
      markerEnd={markerEnd}
      style={{ ...style, strokeOpacity: selected ? 0.7 : 0.35 }}
      label={data?.text}
      labelX={labelX}
      labelY={labelY}
      labelStyle={{ fill: "var(--text)", fontSize: 11 }}
      labelBgStyle={{ fill: "var(--panel)", fillOpacity: 0.9 }}
      labelBgPadding={[7, 4]}
      labelBgBorderRadius={5}
    />
  );
}
