import { Check, X } from "lucide-react";
import { checkFit, useDriveway } from "@/hooks/use-driveway";

interface Props {
  rvLength: number | null | undefined;
  rvWidth: number | null | undefined;
}

export function DrivewayFitBadge({ rvLength, rvWidth }: Props) {
  const { dims } = useDriveway();
  const result = checkFit(rvLength, rvWidth, dims);
  if (!result) return null;

  return (
    <div
      className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold ${
        result.fits
          ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
          : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
      }`}
      title={result.fits ? "Fits your saved driveway" : "Too large for your saved driveway"}
    >
      {result.fits ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
      {result.fits ? "Fits driveway" : "Too large"}
    </div>
  );
}
