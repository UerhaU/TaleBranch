import { BaseEdge, useInternalNode, type Edge, type EdgeProps, type InternalNode } from "@xyflow/react";

export type RelationshipEdgeData = {
  text: string;
  icon: string;
  ended: boolean;
  toSource: boolean;
  toTarget: boolean;
};

// Line icons of the relationship presets (the same drawings as in the approved mockup).
export const relationIcons: Record<string, string> = {
  rings: "M4 14a5 5 0 1 0 10 0a5 5 0 1 0-10 0M10 14a5 5 0 1 0 10 0a5 5 0 1 0-10 0M10 5l2-2 2 2",
  gem: "M6 4h12l3 5-9 11L3 9zM3 9h18M9 4l3 16M15 4l-3 16",
  heart: "M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.5 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z",
  flame: "M12 21c-4 0-6-2.7-6-6 0-4 4-6 4-10 2 1.5 3 3 3 5 1-1 1.5-2 1.5-3 2 1.5 3.5 4.5 3.5 8 0 3.3-2 6-6 6z",
  mask: "M3 7c3-1 6-1 9 1 3-2 6-2 9-1 0 6-3 10-6 10-1.5 0-2.3-1.5-3-3-.7 1.5-1.5 3-3 3-3 0-6-4-6-10zM7 11h2M15 11h2",
  scroll: "M7 4h11a2 2 0 0 1 0 4h-2v10a3 3 0 0 1-3 3H6a2 2 0 0 1-2-2v-1h10M7 4a2 2 0 0 0-2 2v12",
  spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z",
  bolt: "M13 3L5 13h6l-1 8 8-10h-6z",
  swords: "M4 4l9 9M20 4l-9 9M4 4v4M4 4h4M20 4v4M20 4h-4M7 16l-3 3M17 16l3 3M9 14l-3 3 1 1 3-3M15 14l3 3-1 1-3-3",
  broken:
    "M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.5l-1.5 3 3 2-2 3 2 2M13.5 8.2A4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10",
};

export function nodeBox(node: InternalNode) {
  const { x, y } = node.internals.positionAbsolute;
  const width = node.measured.width ?? 240;
  const height = node.measured.height ?? 80;
  return { x, y, width, height, cx: x + width / 2, cy: y + height / 2, bottom: y + height };
}

function arrow(x: number, y: number, dir: number) {
  return `M${x} ${y} L${x - dir * 9} ${y - 5} L${x - dir * 9} ${y + 5} Z`;
}

/** Personal relationship: a dotted line from side to side with a label, or a round badge when there is no room. */
export function RelationshipEdge({ id, source, target, data, selected }: EdgeProps<Edge<RelationshipEdgeData>>) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (!sourceNode || !targetNode || !data) return null;
  const a = nodeBox(sourceNode);
  const b = nodeBox(targetNode);
  const forward = a.cx < b.cx;
  const [x1, y1] = forward ? [a.x + a.width, a.cy] : [a.x, a.cy];
  const [x2, y2] = forward ? [b.x, b.cy] : [b.x + b.width, b.cy];
  const mx = (x1 + x2) / 2;
  let my = (y1 + y2) / 2;
  const flat = Math.abs(y1 - y2) < 4;
  let path: string;
  if (flat && Math.abs(x2 - x1) < 80) path = `M${x1} ${y1} L${x2} ${y2}`;
  else if (flat) {
    path = `M${x1} ${y1} C${x1 + 40 * Math.sign(x2 - x1)} ${y1 - 50}, ${x2 - 40 * Math.sign(x2 - x1)} ${y2 - 50}, ${x2} ${y2}`;
    my -= 37;
  } else path = `M${x1} ${y1} C${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
  const dir = Math.sign(x2 - x1) || 1;
  const icon = relationIcons[data.icon] ?? relationIcons.heart;
  const labelWidth = data.text.length * 6.6 + 40;
  const roomy = Math.abs(x2 - x1) > labelWidth + 20;
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        className={`tb-rel-line ${data.ended ? "is-ended" : ""} ${selected ? "is-selected" : ""}`}
      />
      {data.toTarget && <path className="tb-rel-arrow" d={arrow(x2, y2, dir)} />}
      {data.toSource && <path className="tb-rel-arrow" d={arrow(x1, y1, -dir)} />}
      {roomy ? (
        <g className="tb-rel-label" transform={`translate(${mx - labelWidth / 2} ${my - 12})`}>
          <title>{data.text}</title>
          <rect width={labelWidth} height="24" rx="12" />
          <path className="tb-rel-icon" d={icon} transform="translate(8 5) scale(.58)" />
          <text x={labelWidth / 2 + 9} y="16">
            {data.text}
          </text>
        </g>
      ) : (
        <g className="tb-rel-label" transform={`translate(${mx - 12} ${my - 12})`}>
          <title>{data.text}</title>
          <circle cx="12" cy="12" r="12" />
          <path className="tb-rel-icon" d={icon} transform="translate(5 5) scale(.58)" />
        </g>
      )}
    </>
  );
}
