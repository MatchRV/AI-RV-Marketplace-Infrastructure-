import { useState, useEffect, useCallback, Component } from "react";
import type { ReactNode } from "react";
import { useSearch, Link } from "wouter";
import { SEO } from "@/components/seo";
import { Caravan, Smartphone, Ruler, RotateCcw, Info, X, ChevronDown, QrCode, ArrowLeft, Monitor } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

interface RVModel {
  id: string;
  label: string;
  glb: string;
  usdz?: string;
  lengthFt: number;
  widthFt: number;
  heightFt: number;
  poster?: string;
}

const RV_PRESETS: RVModel[] = [
  {
    id: "travel-trailer-28",
    label: "28' Travel Trailer",
    glb: "/models/rv-travel-trailer.glb",
    lengthFt: 28,
    widthFt: 8,
    heightFt: 11,
  },
  {
    id: "fifth-wheel-36",
    label: "36' Fifth Wheel",
    glb: "/models/rv-fifth-wheel.glb",
    lengthFt: 36,
    widthFt: 8.5,
    heightFt: 13,
  },
  {
    id: "class-a-40",
    label: "40' Class A Motorhome",
    glb: "/models/rv-class-a.glb",
    lengthFt: 40,
    widthFt: 8.5,
    heightFt: 12.5,
  },
  {
    id: "class-c-25",
    label: "25' Class C Motorhome",
    glb: "/models/rv-class-c.glb",
    lengthFt: 25,
    widthFt: 8,
    heightFt: 11,
  },
  {
    id: "class-b-19",
    label: "19' Class B Van",
    glb: "/models/rv-class-b.glb",
    lengthFt: 19,
    widthFt: 7,
    heightFt: 9.5,
  },
  {
    id: "toy-hauler-38",
    label: "38' Toy Hauler",
    glb: "/models/rv-toy-hauler.glb",
    lengthFt: 38,
    widthFt: 8.5,
    heightFt: 13,
  },
];

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

class ModelViewerErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function HowItWorksModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 relative shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600"
        >
          <X className="h-5 w-5" />
        </button>
        <h3 className="text-lg font-bold text-[#161d1d] mb-4">How It Works</h3>
        <ol className="space-y-3 text-sm text-zinc-600">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#0B1117] text-white text-xs flex items-center justify-center font-bold">1</span>
            <span>Select an RV size from the dropdown, or arrive here from a listing page with dimensions pre-loaded.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#0B1117] text-white text-xs flex items-center justify-center font-bold">2</span>
            <span>Tap <strong>"Place RV in My Driveway"</strong> and allow camera access when prompted.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#0B1117] text-white text-xs flex items-center justify-center font-bold">3</span>
            <span>Point your phone at the ground. Move slowly so the AR system can detect the surface.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#0B1117] text-white text-xs flex items-center justify-center font-bold">4</span>
            <span>Tap the driveway to place the RV. One finger to move, two fingers to rotate.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#0B1117] text-white text-xs flex items-center justify-center font-bold">5</span>
            <span>Check if it fits! Dimension labels are overlaid on the model for reference.</span>
          </li>
        </ol>
        <button
          onClick={onClose}
          className="mt-5 w-full py-3 bg-[#0B1117] text-white rounded-xl font-semibold hover:bg-[#003320] transition"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

function NoWebGLFallback({ model }: { model: RVModel }) {
  return (
    <div className="w-full h-[400px] bg-zinc-100 rounded-2xl flex flex-col items-center justify-center gap-4 px-6 text-center border-2 border-dashed border-zinc-300">
      <Monitor className="h-10 w-10 text-zinc-400" />
      <div>
        <p className="font-semibold text-zinc-600 mb-1">3D viewer requires a compatible device</p>
        <p className="text-sm text-zinc-400 max-w-xs">
          Open this page on your phone or a desktop with a modern GPU to use the interactive 3D and AR viewer.
        </p>
      </div>
      <div className="bg-white rounded-xl px-4 py-2 flex gap-4 text-xs text-zinc-500">
        <span><strong>{model.lengthFt}ft</strong> long</span>
        <span><strong>{model.widthFt}ft</strong> wide</span>
        <span><strong>{model.heightFt}ft</strong> tall</span>
      </div>
    </div>
  );
}

function ModelViewerInner({ model }: { model: RVModel }) {
  const [loaded, setLoaded] = useState(false);
  const [webglOk, setWebglOk] = useState<boolean | null>(null);

  useEffect(() => {
    const ok = hasWebGL();
    setWebglOk(ok);
    if (ok) {
      import("@google/model-viewer").then(() => setLoaded(true));
    }
  }, []);

  if (webglOk === false) return <NoWebGLFallback model={model} />;

  if (!loaded) {
    return (
      <div className="w-full h-[400px] bg-zinc-100 rounded-2xl flex items-center justify-center">
        <div className="text-center text-zinc-400">
          <div className="w-8 h-8 border-2 border-zinc-300 border-t-[#0B1117] rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm">Loading 3D viewer…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full">
      <model-viewer
        src={model.glb}
        ios-src={model.usdz || ""}
        alt={`3D model of ${model.label}`}
        ar
        ar-modes="webxr scene-viewer quick-look"
        ar-scale="fixed"
        camera-controls
        touch-action="pan-y"
        auto-rotate
        shadow-intensity="1"
        environment-image="neutral"
        style={{
          width: "100%",
          height: "400px",
          borderRadius: "1rem",
          backgroundColor: "#eef5f4",
        }}
      >
        <button
          slot="ar-button"
          style={{
            position: "absolute",
            bottom: "1rem",
            left: "50%",
            transform: "translateX(-50%)",
            padding: "0.75rem 1.5rem",
            background: "#0B1117",
            color: "white",
            borderRadius: "9999px",
            fontWeight: 600,
            fontSize: "0.875rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            border: "none",
            cursor: "pointer",
            boxShadow: "0 4px 16px rgba(0,67,41,0.4)",
          }}
        >
          📍 Place RV in My Driveway
        </button>
      </model-viewer>

      <div className="absolute top-3 right-3 bg-[#161d1d]/80 text-white text-xs rounded-xl px-3 py-2 space-y-1 backdrop-blur-sm">
        <div className="flex items-center gap-1.5">
          <Ruler className="h-3 w-3" />
          <span>{model.lengthFt} ft long</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Ruler className="h-3 w-3 rotate-90" />
          <span>{model.widthFt} ft wide</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Ruler className="h-3 w-3" />
          <span>{model.heightFt} ft tall</span>
        </div>
      </div>
    </div>
  );
}

function ARViewer({ model }: { model: RVModel }) {
  return (
    <ModelViewerErrorBoundary fallback={<NoWebGLFallback model={model} />}>
      <ModelViewerInner model={model} />
    </ModelViewerErrorBoundary>
  );
}

export function ARDriveway() {
  const search = useSearch();
  const params = new URLSearchParams(search);

  const [selectedModel, setSelectedModel] = useState<RVModel>(RV_PRESETS[0]);
  const [showHowTo, setShowHowTo] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    setIsMobile(mobile);
    const visited = localStorage.getItem("ar-driveway-visited");
    if (!visited && mobile) {
      setShowHowTo(true);
      localStorage.setItem("ar-driveway-visited", "true");
    }
  }, []);

  useEffect(() => {
    const lengthParam = params.get("length");
    const widthParam = params.get("width");
    const heightParam = params.get("height");
    const nameParam = params.get("name");
    if (lengthParam) {
      setSelectedModel((prev) => ({
        ...prev,
        id: "custom",
        label: nameParam || `${lengthParam}' RV`,
        lengthFt: parseFloat(lengthParam),
        widthFt: widthParam ? parseFloat(widthParam) : prev.widthFt,
        heightFt: heightParam ? parseFloat(heightParam) : prev.heightFt,
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const handleReset = useCallback(() => {
    setSelectedModel(RV_PRESETS[0]);
  }, []);

  const arUrl = typeof window !== "undefined" ? window.location.href : "";

  return (
    <>
      <SEO title="AR Driveway Fit Check" noIndex />
      {showHowTo && <HowItWorksModal onClose={() => setShowHowTo(false)} />}

      <div className="min-h-screen bg-[#f4fbfa]">
        <header className="border-b border-zinc-200 bg-white sticky top-0 z-40">
          <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/">
                <button className="text-zinc-400 hover:text-[#0B1117] transition mr-1">
                  <ArrowLeft className="h-5 w-5" />
                </button>
              </Link>
              <Caravan className="h-5 w-5 text-[#0B1117]" />
              <span className="font-display font-bold text-[#161d1d]">Driveway Fit Check</span>
            </div>
            <button
              onClick={() => setShowHowTo(true)}
              className="flex items-center gap-1 text-sm text-[#0B1117] hover:text-[#003320] font-medium"
            >
              <Info className="h-4 w-4" />
              How It Works
            </button>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 py-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-display font-black text-[#161d1d] mb-3 tracking-tight">
              See If This RV Fits<br />in Your Driveway
            </h1>
            <p className="text-zinc-500 max-w-md mx-auto text-sm leading-relaxed">
              Use your phone's camera to place a life-size RV model in your driveway.
              Check length, width, and clearance before you buy.
            </p>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-semibold text-zinc-700 mb-2">Select RV Size</label>
            <div className="relative">
              <select
                value={selectedModel.id}
                onChange={(e) => {
                  const found = RV_PRESETS.find((p) => p.id === e.target.value);
                  if (found) setSelectedModel(found);
                }}
                className="w-full appearance-none bg-white border border-zinc-300 rounded-xl px-4 py-3 pr-10 text-[#161d1d] font-medium focus:ring-2 focus:ring-[#0B1117] focus:border-[#0B1117] outline-none"
              >
                {RV_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label} — {preset.lengthFt}L × {preset.widthFt}W × {preset.heightFt}H ft
                  </option>
                ))}
                {selectedModel.id === "custom" && (
                  <option value="custom">{selectedModel.label} (from listing)</option>
                )}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400 pointer-events-none" />
            </div>
          </div>

          <ARViewer model={selectedModel} />

          {isMobile && (
            <p className="text-center text-sm text-[#0B1117] mt-3 font-semibold">
              Tap the green button on the 3D model above to start AR
            </p>
          )}

          {!isMobile && (
            <div className="mt-6 bg-[#0B1117] rounded-2xl p-8 text-center">
              <div className="flex items-center justify-center gap-2 mb-3">
                <QrCode className="h-5 w-5 text-[#00CED1]" />
                <h3 className="font-bold text-white">Scan to View in Your Driveway</h3>
              </div>
              <p className="text-sm text-white/70 mb-6 max-w-sm mx-auto">
                Scan this QR code with your phone's camera to open the AR experience
                and place this RV in your actual driveway.
              </p>
              <div className="inline-block bg-white p-4 rounded-2xl shadow-lg">
                <QRCodeSVG
                  value={arUrl}
                  size={180}
                  bgColor="#ffffff"
                  fgColor="#0B1117"
                  level="M"
                  includeMargin={false}
                />
              </div>
              <div className="mt-4 flex items-center justify-center gap-2 text-xs text-white/50">
                <Smartphone className="h-3.5 w-3.5" />
                <span>Works on iPhone and Android</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 mt-6">
            {[
              { label: "Length", value: selectedModel.lengthFt },
              { label: "Width", value: selectedModel.widthFt },
              { label: "Height", value: selectedModel.heightFt },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white border border-zinc-200 rounded-2xl p-4 text-center">
                <p className="text-2xl font-black text-[#0B1117]">
                  {value}<span className="text-sm font-normal text-zinc-400"> ft</span>
                </p>
                <p className="text-xs text-zinc-500 mt-1">{label}</p>
              </div>
            ))}
          </div>

          <button
            onClick={handleReset}
            className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 text-sm text-zinc-500 hover:text-[#0B1117] transition"
          >
            <RotateCcw className="h-4 w-4" />
            Reset to default size
          </button>

          <div className="mt-8 bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p className="text-xs text-amber-800 leading-relaxed">
              <strong>Visual guide only.</strong> Always measure your driveway and check local
              parking rules, HOA restrictions, and utility clearances before purchasing.
              The 3D model is approximate and may not reflect the exact shape of every RV.
              Actual dimensions vary by manufacturer and floor plan.
            </p>
          </div>

          <div className="mt-6 mb-12 space-y-3">
            <h3 className="font-semibold text-[#161d1d] text-sm">Tips for the best AR experience</h3>
            <ul className="text-xs text-zinc-500 space-y-2">
              {[
                "Go outside in good lighting — AR works best in daylight.",
                "Point your camera at the ground first and move slowly so the surface can be detected.",
                "Place the model at the start of your driveway to check total length.",
                "Walk around the model to check side clearance and height near garage doors.",
              ].map((tip, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-[#0B1117] font-bold">{i + 1}.</span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </main>
      </div>
    </>
  );
}
