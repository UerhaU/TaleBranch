/** Older muted character colors are shown with the bright theme palette; the saved value stays as it is. */
const brightPalette: Record<string, string> = {
  "#3e4b8e": "var(--tb-p-blue)",
  "#6472a4": "var(--tb-p-blue)",
  "#6d78b2": "var(--tb-p-violet)",
  "#7d6a9e": "var(--tb-p-violet)",
  "#3d1534": "var(--tb-p-plum)",
  "#5c294d": "var(--tb-p-plum)",
  "#6f4b68": "var(--tb-p-rose)",
  "#b66a87": "var(--tb-p-rose)",
  "#8b3f62": "var(--tb-p-coral)",
  "#8aa6b6": "var(--tb-p-sky)",
  "#8daab9": "var(--tb-p-sky)",
  "#a6bcc9": "var(--tb-p-sky)",
  "#8096a6": "var(--tb-p-teal)",
  "#c69d63": "var(--tb-p-amber)",
  "#d3b87c": "var(--tb-p-amber)",
  "#f6e0b6": "var(--tb-p-amber)",
};

export function displayColor(color: string): string {
  return brightPalette[color.toLowerCase()] ?? color;
}
