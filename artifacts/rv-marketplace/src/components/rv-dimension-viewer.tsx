interface Props {
  lengthFt: number;
  widthFt: number;
  heightFt: number;
  rvType: string;
}

const TYPE_COLORS: Record<string, { face: string; top: string; side: string; stroke: string }> = {
  class_a:        { face: "#3b5bdb", top: "#4c6ef5", side: "#364fc7", stroke: "#1c3faa" },
  class_b:        { face: "#0ca678", top: "#12b886", side: "#099268", stroke: "#087f5b" },
  class_c:        { face: "#7048e8", top: "#845ef7", side: "#5f3dc4", stroke: "#4c2889" },
  fifth_wheel:    { face: "#c92a2a", top: "#e03131", side: "#a61e1e", stroke: "#7d1a1a" },
  travel_trailer: { face: "#e67700", top: "#f59f00", side: "#b85c00", stroke: "#8c4400" },
  toy_hauler:     { face: "#2b8a3e", top: "#37b24d", side: "#1e6b30", stroke: "#165224" },
  popup_camper:   { face: "#1098ad", top: "#15aabf", side: "#0b7285", stroke: "#085f70" },
};

export function RvDimensionViewer({ lengthFt, widthFt, heightFt, rvType }: Props) {
  const colors = TYPE_COLORS[rvType] || TYPE_COLORS["travel_trailer"];

  const W = 300;
  const H = 200;

  const ISO_ANGLE = 30 * (Math.PI / 180);
  const MAX_DIM = Math.max(lengthFt, widthFt, heightFt);
  const SCALE = Math.min(60, 130 / MAX_DIM);

  const l = lengthFt * SCALE;
  const w = widthFt * SCALE;
  const h = heightFt * SCALE;

  const lx = Math.cos(ISO_ANGLE) * l;
  const ly = Math.sin(ISO_ANGLE) * l;
  const wx = Math.cos(Math.PI - ISO_ANGLE) * w;
  const wy = Math.sin(Math.PI - ISO_ANGLE) * w;

  const originX = W / 2 - (lx + wx) / 2;
  const originY = H / 2 + h / 2 + (ly + wy) / 2 - 10;

  const p = (dx: number, dy: number) =>
    [originX + dx, originY + dy].join(",");

  const frontBL = { x: originX, y: originY };
  const frontBR = { x: originX + lx, y: originY + ly };
  const frontTL = { x: originX, y: originY - h };
  const frontTR = { x: originX + lx, y: originY + ly - h };
  const backTL  = { x: originX + wx, y: originY + wy - h };
  const backTR  = { x: originX + lx + wx, y: originY + ly + wy - h };
  const backBR  = { x: originX + lx + wx, y: originY + ly + wy };

  function pts(...points: { x: number; y: number }[]) {
    return points.map((pt) => `${pt.x},${pt.y}`).join(" ");
  }

  const labelStyle = {
    fontSize: 10,
    fill: "#64748b",
    fontFamily: "sans-serif",
  };

  const lengthMidX = (frontBL.x + frontBR.x) / 2;
  const lengthMidY = (frontBL.y + frontBR.y) / 2 + 14;
  const widthMidX  = (frontBR.x + backBR.x) / 2 + 6;
  const widthMidY  = (frontBR.y + backBR.y) / 2 + 10;
  const heightMidX = frontTL.x - 28;
  const heightMidY = (frontTL.y + frontBL.y) / 2 + 4;

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="px-5 pt-5 pb-2">
        <h3 className="font-display font-bold text-lg">3D Dimensions</h3>
        <p className="text-xs text-muted-foreground">
          Scaled to this RV's actual proportions
        </p>
      </div>

      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full">
        <polygon points={pts(frontBL, frontBR, backBR, backTL)} fill={colors.top} opacity={0.92} />
        <polygon points={pts(frontBL, frontBR, frontTR, frontTL)} fill={colors.face} opacity={0.95} />
        <polygon points={pts(frontBR, backBR, backTR, frontTR)} fill={colors.side} opacity={0.92} />
        <polygon points={pts(frontBL, frontBR, backBR, backTL)} fill="none" stroke={colors.stroke} strokeWidth={1} />
        <polygon points={pts(frontBL, frontBR, frontTR, frontTL)} fill="none" stroke={colors.stroke} strokeWidth={1} />
        <polygon points={pts(frontBR, backBR, backTR, frontTR)} fill="none" stroke={colors.stroke} strokeWidth={1} />
        <line x1={backTL.x} y1={backTL.y} x2={backTR.x} y2={backTR.y} stroke={colors.stroke} strokeWidth={1} />
        <line x1={backTR.x} y1={backTR.y} x2={frontTR.x} y2={frontTR.y} stroke={colors.stroke} strokeWidth={1} />
        <line x1={backTR.x} y1={backTR.y} x2={backBR.x} y2={backBR.y} stroke={colors.stroke} strokeWidth={1} strokeDasharray="3,2" />

        <line x1={frontBL.x} y1={frontBL.y + 8} x2={frontBR.x} y2={frontBR.y + 8} stroke="#94a3b8" strokeWidth={0.8} markerEnd="url(#arr)" markerStart="url(#arrl)" />
        <text x={lengthMidX} y={lengthMidY} textAnchor="middle" {...labelStyle}>{lengthFt}′ long</text>

        <line x1={frontBR.x + 5} y1={frontBR.y + 3} x2={backBR.x + 5} y2={backBR.y + 3} stroke="#94a3b8" strokeWidth={0.8} />
        <text x={widthMidX} y={widthMidY} textAnchor="start" {...labelStyle}>{widthFt}′ wide</text>

        <line x1={frontTL.x - 8} y1={frontTL.y} x2={frontBL.x - 8} y2={frontBL.y} stroke="#94a3b8" strokeWidth={0.8} />
        <text x={heightMidX} y={heightMidY} textAnchor="end" {...labelStyle}>{heightFt}′</text>
        <text x={heightMidX} y={heightMidY + 11} textAnchor="end" {...labelStyle}>tall</text>
      </svg>

      <div className="flex items-center justify-center gap-4 px-5 pb-5 pt-1">
        <DimPill label="L" value={`${lengthFt}′`} color={colors.face} />
        <DimPill label="W" value={`${widthFt}′`} color={colors.side} />
        <DimPill label="H" value={`${heightFt}′`} color={colors.top} />
      </div>
    </div>
  );
}

function DimPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-1.5 bg-muted rounded-lg px-3 py-1.5">
      <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
      <span className="text-sm font-bold text-foreground">{value}</span>
    </div>
  );
}
