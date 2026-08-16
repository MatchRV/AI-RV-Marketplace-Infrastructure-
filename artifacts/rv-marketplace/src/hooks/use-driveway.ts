import { useState, useEffect } from "react";
import { useAppAuth } from "@/contexts/auth-context";

export interface DrivewayDims {
  drivewayLengthFt: number;
  drivewayWidthFt: number;
}

export function useDriveway() {
  const { isAuthenticated } = useAppAuth();
  const [dims, setDims] = useState<DrivewayDims | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) { setDims(null); return; }
    setLoading(true);
    fetch("/api/user/driveway", { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.driveway) setDims(d.driveway); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  async function saveDims(length: number, width: number): Promise<boolean> {
    setSaving(true);
    try {
      const r = await fetch("/api/user/driveway", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ drivewayLengthFt: length, drivewayWidthFt: width }),
      });
      if (!r.ok) return false;
      const d = await r.json();
      setDims({ drivewayLengthFt: d.drivewayLengthFt, drivewayWidthFt: d.drivewayWidthFt });
      return true;
    } catch { return false; }
    finally { setSaving(false); }
  }

  return { dims, loading, saving, saveDims };
}

export function checkFit(
  rvLength: number | null | undefined,
  rvWidth: number | null | undefined,
  driveway: DrivewayDims | null
): { fits: boolean; lengthOk: boolean; widthOk: boolean } | null {
  if (!driveway || !rvLength || !rvWidth) return null;
  const lengthOk = rvLength <= driveway.drivewayLengthFt;
  const widthOk = rvWidth <= driveway.drivewayWidthFt;
  return { fits: lengthOk && widthOk, lengthOk, widthOk };
}
