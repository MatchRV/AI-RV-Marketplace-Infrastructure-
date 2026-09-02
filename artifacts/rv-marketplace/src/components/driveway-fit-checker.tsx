import { useState } from "react";
import { Check, X, Save, Home, Ruler } from "lucide-react";
import { Button, Input } from "@/components/ui-elements";
import { useDriveway } from "@/hooks/use-driveway";
import { useAppAuth } from "@/contexts/auth-context";
import type { Listing } from "@workspace/api-client-react";

interface Props {
  listing: Listing;
}

export function DrivewayFitChecker({ listing }: Props) {
  const { isAuthenticated, login } = useAppAuth();
  const { dims, saving, saveDims } = useDriveway();

  const [length, setLength] = useState(dims?.drivewayLengthFt?.toString() ?? "");
  const [width, setWidth] = useState(dims?.drivewayWidthFt?.toString() ?? "");
  const [checked, setChecked] = useState(false);
  const [saved, setSaved] = useState(false);

  const rvLength = listing.length ?? 0;
  const rvWidth = listing.widthFt ?? 8.5;

  const parsedLen = parseInt(length, 10);
  const parsedWid = parseInt(width, 10);
  const canCheck = parsedLen >= 10 && parsedWid >= 6;

  const lengthOk = checked && canCheck ? rvLength <= parsedLen : null;
  const widthOk = checked && canCheck ? rvWidth <= parsedWid : null;
  const fits = lengthOk && widthOk;

  async function handleSave() {
    if (!isAuthenticated) { login(); return; }
    const ok = await saveDims(parsedLen, parsedWid);
    if (ok) setSaved(true);
  }

  const D_W = 260;
  const D_H = 160;
  const PADDING = 16;

  const innerW = D_W - PADDING * 2;
  const innerH = D_H - PADDING * 2;

  const scaleX = canCheck ? innerW / parsedLen : 1;
  const scaleY = canCheck ? innerH / parsedLen : 1;
  const scale = Math.min(scaleX, scaleY);

  const driveW = Math.min(parsedWid * scale, innerW);
  const driveH = Math.min(parsedLen * scale, innerH);
  const rvW = Math.min(rvWidth * scale, innerW);
  const rvH = Math.min(rvLength * scale, innerH);

  const overflowsLen = checked && canCheck && rvLength > parsedLen;
  const overflowsWid = checked && canCheck && rvWidth > parsedWid;

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="p-5 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <Home className="w-5 h-5 text-primary" />
          <h3 className="font-display font-bold text-lg">Will It Fit?</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Enter your driveway dimensions to see if this {rvLength > 0 ? `${rvLength}′` : ""} RV will fit.
        </p>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Driveway Length (ft)</label>
            <Input
              type="number"
              min={10}
              max={200}
              placeholder="e.g. 40"
              value={length}
              onChange={(e) => { setLength(e.target.value); setChecked(false); setSaved(false); }}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Driveway Width (ft)</label>
            <Input
              type="number"
              min={6}
              max={50}
              placeholder="e.g. 12"
              value={width}
              onChange={(e) => { setWidth(e.target.value); setChecked(false); setSaved(false); }}
            />
          </div>
        </div>

        <Button
          className="w-full gap-2"
          disabled={!canCheck}
          onClick={() => setChecked(true)}
        >
          <Ruler className="w-4 h-4" /> Check Fit
        </Button>

        {checked && canCheck && (
          <>
            <div className={`rounded-xl p-4 flex items-start gap-3 ${fits ? "bg-green-50 border border-green-200 dark:bg-green-950/30 dark:border-green-800" : "bg-red-50 border border-red-200 dark:bg-red-950/30 dark:border-red-800"}`}>
              <div className={`mt-0.5 flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${fits ? "bg-green-500" : "bg-red-500"}`}>
                {fits ? <Check className="w-4 h-4 text-white" /> : <X className="w-4 h-4 text-white" />}
              </div>
              <div>
                <div className={`font-bold text-base ${fits ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                  {fits ? "It fits your driveway!" : "Too big for your driveway"}
                </div>
                <div className="text-sm mt-1 space-y-0.5 text-muted-foreground">
                  <div className={lengthOk ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}>
                    {lengthOk ? "✓" : "✗"} Length: {rvLength}′ RV vs {parsedLen}′ driveway
                  </div>
                  <div className={widthOk ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}>
                    {widthOk ? "✓" : "✗"} Width: {rvWidth}′ RV vs {parsedWid}′ driveway
                  </div>
                </div>
              </div>
            </div>

            <FitDiagram
              driveW={driveW}
              driveH={driveH}
              rvW={overflowsWid ? Math.min(rvW, innerW) : rvW}
              rvH={overflowsLen ? Math.min(rvH, innerH) : rvH}
              overflowsLen={overflowsLen}
              overflowsWid={overflowsWid}
              fits={!!fits}
              totalW={D_W}
              totalH={D_H}
              padding={PADDING}
            />

            {!saved ? (
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 text-sm text-primary hover:underline py-1 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? "Saving..." : isAuthenticated ? "Save driveway to profile" : "Sign in to save for all listings"}
              </button>
            ) : (
              <div className="flex items-center justify-center gap-2 text-sm text-green-600">
                <Check className="w-4 h-4" /> Saved — fit badge now shows on all listings
              </div>
            )}
          </>
        )}

        {dims && !checked && (
          <div className="text-xs text-muted-foreground text-center">
            Saved driveway: {dims.drivewayLengthFt}′ × {dims.drivewayWidthFt}′ —{" "}
            <button className="text-primary hover:underline" onClick={() => { setLength(String(dims.drivewayLengthFt)); setWidth(String(dims.drivewayWidthFt)); }}>
              use saved
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function FitDiagram({
  driveW, driveH, rvW, rvH, overflowsLen, overflowsWid, fits,
  totalW, totalH, padding,
}: {
  driveW: number; driveH: number; rvW: number; rvH: number;
  overflowsLen: boolean; overflowsWid: boolean; fits: boolean;
  totalW: number; totalH: number; padding: number;
}) {
  const driveX = (totalW - driveW) / 2;
  const driveY = (totalH - driveH) / 2;
  const rvX = driveX + (driveW - rvW) / 2;
  const rvY = driveY + (driveH - rvH) / 2;

  const rvColor = fits ? "#22c55e" : "#ef4444";
  const rvFill = fits ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)";

  return (
    <div className="rounded-xl overflow-hidden border border-border bg-muted/30">
      <svg width={totalW} height={totalH} className="w-full" viewBox={`0 0 ${totalW} ${totalH}`}>
        <rect x={padding} y={padding} width={totalW - padding * 2} height={totalH - padding * 2} rx={4} fill="#e2e8f0" stroke="#cbd5e1" strokeWidth={1} />
        <text x={totalW / 2} y={padding - 4} textAnchor="middle" fontSize={9} fill="#94a3b8">Driveway</text>

        <rect
          x={driveX}
          y={driveY}
          width={driveW}
          height={driveH}
          rx={3}
          fill="#f8fafc"
          stroke="#64748b"
          strokeWidth={1.5}
          strokeDasharray="4,2"
        />

        <rect
          x={rvX}
          y={rvY}
          width={Math.min(rvW, totalW - padding - rvX)}
          height={Math.min(rvH, totalH - padding - rvY)}
          rx={2}
          fill={rvFill}
          stroke={rvColor}
          strokeWidth={2}
        />

        {overflowsLen && (
          <rect x={rvX} y={driveY + driveH} width={rvW} height={Math.min(rvH - driveH, 12)} rx={1} fill="rgba(239,68,68,0.25)" stroke="#ef4444" strokeWidth={1} strokeDasharray="3,2" />
        )}
        {overflowsWid && (
          <rect x={driveX + driveW} y={rvY} width={Math.min(rvW - driveW, 12)} height={rvH} rx={1} fill="rgba(239,68,68,0.25)" stroke="#ef4444" strokeWidth={1} strokeDasharray="3,2" />
        )}

        <text x={rvX + rvW / 2} y={rvY + rvH / 2 + 4} textAnchor="middle" fontSize={10} fontWeight="bold" fill={rvColor}>RV</text>
      </svg>
      <div className="flex items-center justify-center gap-4 px-4 py-2 text-xs text-muted-foreground border-t border-border">
        <span className="flex items-center gap-1"><span className="w-3 h-px border-t-2 border-dashed border-slate-400 inline-block" /> Driveway</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 rounded" style={{ backgroundColor: rvColor }} /> RV Footprint</span>
      </div>
    </div>
  );
}
