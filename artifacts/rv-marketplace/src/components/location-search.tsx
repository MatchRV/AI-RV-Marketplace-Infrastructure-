import { useState, useEffect, useRef, useCallback } from "react";
import { MapPin, X, Loader2 } from "lucide-react";

declare global {
  interface Window {
    google: typeof google;
    __mapsReady?: boolean;
  }
}

let scriptLoadPromise: Promise<void> | null = null;

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (scriptLoadPromise) return scriptLoadPromise;
  scriptLoadPromise = new Promise((resolve, reject) => {
    if (window.__mapsReady) { resolve(); return; }
    const existing = document.querySelector(`script[src*="maps.googleapis.com"]`);
    const onReady = () => { window.__mapsReady = true; resolve(); };
    if (existing) {
      // Script already added; poll until google.maps is available
      const poll = setInterval(() => {
        if (window.google?.maps?.places) { clearInterval(poll); onReady(); }
      }, 50);
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.onload = () => {
      const poll = setInterval(() => {
        if (window.google?.maps?.places) { clearInterval(poll); onReady(); }
      }, 50);
    };
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

interface Suggestion {
  placeId: string;
  mainText: string;
  secondaryText: string;
}

interface LocationSearchProps {
  value: string;
  onSelect: (city: string, state: string, displayLabel: string) => void;
  onClear: () => void;
  placeholder?: string;
  className?: string;
}

export function LocationSearch({
  value,
  onSelect,
  onClear,
  placeholder = "City or state…",
  className = "",
}: LocationSearchProps) {
  const [query, setQuery] = useState(value || "");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [apiReady, setApiReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serviceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const apiKey = import.meta.env.VITE_GOOGLE_PLACES_API_KEY as string;

  useEffect(() => {
    if (!apiKey) return;
    loadGoogleMaps(apiKey).then(() => {
      serviceRef.current = new window.google.maps.places.AutocompleteService();
      setApiReady(true);
    }).catch(() => {/* fail silently */});
  }, [apiKey]);

  useEffect(() => { setQuery(value || ""); }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const search = useCallback((input: string) => {
    if (!apiReady || !serviceRef.current || input.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    serviceRef.current.getPlacePredictions(
      {
        input,
        types: ["(cities)"],
        componentRestrictions: { country: "us" },
      },
      (results, status) => {
        setLoading(false);
        if (status === window.google.maps.places.PlacesServiceStatus.OK && results) {
          setSuggestions(
            results.map((r) => ({
              placeId: r.place_id,
              mainText: r.structured_formatting.main_text,
              secondaryText: r.structured_formatting.secondary_text,
            }))
          );
          setOpen(true);
        } else {
          setSuggestions([]);
          setOpen(false);
        }
      }
    );
  }, [apiReady]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) { setSuggestions([]); setOpen(false); return; }
    debounceRef.current = setTimeout(() => search(val), 250);
  };

  const handleSelect = (s: Suggestion) => {
    // secondary is "WA, USA" or "Texas, USA" → extract first part as state
    const stateAbbr = s.secondaryText.split(",")[0]?.trim() ?? "";
    const display = `${s.mainText}, ${s.secondaryText}`.replace(", USA", "").replace(", United States", "");
    setQuery(display);
    setSuggestions([]);
    setOpen(false);
    onSelect(s.mainText, stateAbbr, display);
  };

  const handleClear = () => {
    setQuery("");
    setSuggestions([]);
    setOpen(false);
    onClear();
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2a6a4a]" />
        <input
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className="w-full pl-9 pr-8 py-2.5 rounded-xl border-2 border-[#E2E8F0] bg-[#f4fbfa] text-sm font-medium text-[#161d1d] placeholder:text-[#b0b7b2] focus:outline-none focus:border-[#2a6a4a] transition-colors"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {loading && <Loader2 className="w-4 h-4 text-[#2a6a4a] animate-spin" />}
          {!loading && query && (
            <button onClick={handleClear} className="text-[#b0b7b2] hover:text-[#3b4949] transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#E2E8F0] rounded-xl shadow-xl z-50 overflow-hidden">
          {suggestions.map((s) => (
            <button
              key={s.placeId}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(s); }}
              className="w-full flex items-start gap-3 px-4 py-3 hover:bg-[#eef5f4] text-left transition-colors border-b border-[#eef5f4] last:border-0"
            >
              <MapPin className="w-4 h-4 text-[#2a6a4a] mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[#161d1d] truncate">{s.mainText}</div>
                {s.secondaryText && (
                  <div className="text-xs text-[#6b7a7a]">
                    {s.secondaryText.replace(", USA", "").replace(", United States", "")}
                  </div>
                )}
              </div>
            </button>
          ))}
          <div className="px-3 py-1.5 flex justify-end border-t border-[#eef5f4]">
            <img
              src="https://developers.google.com/static/maps/documentation/images/powered_by_google_on_white.png"
              alt="Powered by Google"
              className="h-4 opacity-50"
            />
          </div>
        </div>
      )}
    </div>
  );
}
