import { useState, useRef } from "react";
import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { Button, Input } from "@/components/ui-elements";
import { Truck, Check, Upload, Sparkles, Loader2, X } from "lucide-react";

const RV_TYPES = [
  { value: "class_a", label: "Class A" },
  { value: "class_b", label: "Class B" },
  { value: "class_c", label: "Class C" },
  { value: "fifth_wheel", label: "Fifth Wheel" },
  { value: "travel_trailer", label: "Travel Trailer" },
  { value: "toy_hauler", label: "Toy Hauler" },
  { value: "popup_camper", label: "Popup Camper" },
];

const CONDITIONS = [
  { value: "excellent", label: "Excellent" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "needs_work", label: "Needs Work" },
];

type FeatureItem = {
  label: string;
  detail?: string; // if set → shows an inline text input when selected; this is the placeholder
};

const FEATURE_GROUPS: { group: string; items: FeatureItem[] }[] = [
  {
    group: "Power & Energy",
    items: [
      { label: "Solar Panels", detail: "e.g. 400W" },
      { label: "Generator", detail: "e.g. 5,500W propane" },
      { label: "Shore Power (30 amp)" },
      { label: "Shore Power (50 amp)" },
      { label: "Lithium Batteries", detail: "e.g. 200Ah" },
      { label: "Inverter", detail: "e.g. 2,000W" },
    ],
  },
  {
    group: "Slides & Layout",
    items: [
      { label: "Slide-outs", detail: "How many?" },
      { label: "Bunkhouse" },
      { label: "Separate Bedroom" },
      { label: "Murphy Bed" },
      { label: "Loft" },
    ],
  },
  {
    group: "Comfort & Climate",
    items: [
      { label: "A/C Units", detail: "How many?" },
      { label: "Heated Floors" },
      { label: "Fireplace" },
      { label: "Washer/Dryer" },
      { label: "Washer/Dryer Prep" },
    ],
  },
  {
    group: "Kitchen & Living",
    items: [
      { label: "Outdoor Kitchen" },
      { label: "Residential Refrigerator" },
      { label: "Convection Oven" },
      { label: "Dishwasher" },
      { label: "Wet Bar / Island" },
    ],
  },
  {
    group: "Tech & Entertainment",
    items: [
      { label: "TVs", detail: "How many?" },
      { label: "Surround Sound" },
      { label: "Backup Camera" },
      { label: "WiFi Booster" },
      { label: "USB Charging Ports" },
      { label: "GPS" },
    ],
  },
  {
    group: "Exterior & Towing",
    items: [
      { label: "Automatic Leveling" },
      { label: "Hydraulic Jacks" },
      { label: "Patio Awning" },
      { label: "Slide-out Awning", detail: "How many?" },
      { label: "Tow Package" },
      { label: "Bike Rack" },
      { label: "Spare Tire" },
    ],
  },
  {
    group: "Water & Utilities",
    items: [
      { label: "On-demand Water Heater" },
      { label: "Water Softener" },
      { label: "Outdoor Shower" },
      { label: "Extra Fresh Water Tank", detail: "e.g. 100 gal" },
    ],
  },
  {
    group: "Storage & Safety",
    items: [
      { label: "Pass-through Storage" },
      { label: "Basement Storage" },
      { label: "Garage / Toy Hauler Bay", detail: "e.g. 12 ft" },
      { label: "Keyless Entry" },
      { label: "Safe" },
      { label: "Alarm System" },
    ],
  },
];

export function Sell() {
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  // feature key → detail string ("" = selected but no detail)
  const [features, setFeatures] = useState<Record<string, string>>({});
  const [extraNotes, setExtraNotes] = useState("");
  const [generating, setGenerating] = useState(false);
  const detailRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [form, setForm] = useState({
    year: "",
    make: "",
    model: "",
    type: "",
    condition: "",
    vin: "",
    mileage: "",
    askingPrice: "",
    description: "",
    name: "",
    email: "",
    phone: "",
  });

  const update = (key: string, value: string) => setForm((p) => ({ ...p, [key]: value }));

  const toggleFeature = (label: string, hasDetail: boolean) => {
    setFeatures((prev) => {
      if (label in prev) {
        const next = { ...prev };
        delete next[label];
        return next;
      }
      const next = { ...prev, [label]: "" };
      if (hasDetail) {
        // focus the detail input after state settles
        setTimeout(() => detailRefs.current[label]?.focus(), 50);
      }
      return next;
    });
  };

  const setFeatureDetail = (label: string, value: string) => {
    setFeatures((prev) => ({ ...prev, [label]: value }));
  };

  const featureStrings = Object.entries(features).map(([label, detail]) =>
    detail.trim() ? `${label} (${detail.trim()})` : label
  );

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setPhotos((prev) => [...prev, ...Array.from(e.target.files!)]);
  };

  const generateDescription = async () => {
    setGenerating(true);
    try {
      const r = await fetch("/api/generate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: form.year,
          make: form.make,
          model: form.model,
          type: form.type,
          condition: form.condition,
          mileage: form.mileage,
          price: form.askingPrice,
          features: featureStrings,
          extraNotes,
        }),
      });
      if (r.ok) {
        const { description } = await r.json();
        update("description", description);
      }
    } catch (err) {
      console.error("Failed to generate description", err);
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmit = async () => {
    const r = await fetch("/api/sell", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, features: featureStrings }),
    });
    if (r.ok) setSubmitted(true);
  };

  if (submitted) {
    return (
      <Layout>
        <div className="flex-1 flex flex-col items-center justify-center py-20 text-center px-4">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-6">
            <Check className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-3xl font-display font-bold mb-3">Submission Received!</h1>
          <p className="text-muted-foreground max-w-md">
            Thank you for listing your RV with MatchRV. Our team will review your submission and reach out within 1–2 business days.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <SEO
        title="Sell Your RV — List for Free on MatchRV"
        description="List your Class A, B, C, Travel Trailer, or Fifth Wheel on MatchRV for free. Reach serious buyers with AI-powered pricing and connect with dealers nationwide."
        canonical="https://matchrv.com/sell"
      />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <Truck className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl font-display font-bold mb-3">List Your RV</h1>
          <p className="text-lg text-muted-foreground">
            Reach thousands of RV buyers across the Pacific Northwest.
          </p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${s <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                {s < step ? <Check className="w-4 h-4" /> : s}
              </div>
              {s < 3 && <div className={`w-12 h-0.5 ${s < step ? "bg-primary" : "bg-muted"}`} />}
            </div>
          ))}
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 sm:p-8">

          {/* ── Step 1: RV Details ── */}
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-xl font-semibold mb-4">RV Details</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">Year *</label>
                  <Input type="number" placeholder="2023" value={form.year} onChange={(e) => update("year", e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">Make *</label>
                  <Input placeholder="e.g. Winnebago" value={form.make} onChange={(e) => update("make", e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">Model *</label>
                <Input placeholder="e.g. Travato 59KL" value={form.model} onChange={(e) => update("model", e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">RV Type *</label>
                <select
                  className="h-11 w-full rounded-lg border-2 border-border bg-background px-4 text-sm font-medium outline-none focus:border-primary"
                  value={form.type}
                  onChange={(e) => update("type", e.target.value)}
                >
                  <option value="">Select type...</option>
                  {RV_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">Condition *</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {CONDITIONS.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => update("condition", c.value)}
                      className={`py-2 px-3 rounded-lg border-2 text-sm font-medium transition-colors ${form.condition === c.value ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/50"}`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">VIN</label>
                <Input placeholder="e.g. 1FDXE45P96HA00001" value={form.vin} onChange={(e) => update("vin", e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">Mileage / Hours</label>
                <Input type="number" placeholder="e.g. 45000" value={form.mileage} onChange={(e) => update("mileage", e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">Asking Price</label>
                <Input type="number" placeholder="$" value={form.askingPrice} onChange={(e) => update("askingPrice", e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">Photos</label>
                <label className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-primary/50 transition-colors cursor-pointer flex flex-col items-center gap-2">
                  <Upload className="w-7 h-7 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Click to select photos</span>
                  <span className="text-xs text-muted-foreground/70">JPG, PNG — multiple allowed</span>
                  <input type="file" multiple accept="image/*" className="hidden" onChange={handlePhotoChange} />
                </label>
                {photos.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {photos.map((f, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex items-center gap-2">
                        <Upload className="w-3 h-3 shrink-0" />{f.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <Button
                className="w-full"
                disabled={!form.year || !form.make || !form.model || !form.type || !form.condition}
                onClick={() => setStep(2)}
              >
                Continue
              </Button>
            </div>
          )}

          {/* ── Step 2: Features & Description ── */}
          {step === 2 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold">Features & Description</h2>

              {/* Feature groups */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-3 block">
                  Select every feature on your RV
                  <span className="ml-2 text-xs text-muted-foreground/60">— tap once to add, type to specify</span>
                </label>
                <div className="space-y-5">
                  {FEATURE_GROUPS.map((group) => (
                    <div key={group.group}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/50 mb-2">
                        {group.group}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {group.items.map((item) => {
                          const selected = item.label in features;
                          const detail = features[item.label] ?? "";
                          return (
                            <div key={item.label} className="flex items-center">
                              {/* Toggle pill */}
                              <button
                                type="button"
                                onClick={() => toggleFeature(item.label, !!item.detail)}
                                className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border-2 transition-all ${
                                  selected
                                    ? item.detail
                                      ? "rounded-l-full border-r-0 border-primary bg-primary text-primary-foreground"
                                      : "rounded-full border-primary bg-primary text-primary-foreground"
                                    : "rounded-full border-border hover:border-primary/50 text-foreground"
                                }`}
                              >
                                {selected && !item.detail && <Check className="w-3 h-3" />}
                                {item.label}
                              </button>

                              {/* Inline detail input — only shown when selected + quantifiable */}
                              {selected && item.detail && (
                                <div className="flex items-center border-2 border-primary rounded-r-full bg-primary/5 overflow-hidden pr-1">
                                  <input
                                    ref={(el) => { detailRefs.current[item.label] = el; }}
                                    type="text"
                                    value={detail}
                                    onChange={(e) => setFeatureDetail(item.label, e.target.value)}
                                    placeholder={item.detail}
                                    className="w-24 bg-transparent text-xs px-2 py-1.5 outline-none placeholder:text-muted-foreground/50"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => toggleFeature(item.label, true)}
                                    className="text-primary/60 hover:text-primary transition-colors"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Selected summary */}
                {featureStrings.length > 0 && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{featureStrings.length} feature{featureStrings.length !== 1 ? "s" : ""} selected:</span>{" "}
                    {featureStrings.join(" · ")}
                  </p>
                )}
              </div>

              {/* Extra notes */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">
                  Anything else to mention?
                  <span className="ml-2 text-xs text-muted-foreground/60">Recent repairs, upgrades, why you're selling…</span>
                </label>
                <textarea
                  className="w-full min-h-[70px] rounded-lg border-2 border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary resize-y"
                  placeholder="e.g. New tires 2024, full service history, selling to upgrade..."
                  value={extraNotes}
                  onChange={(e) => setExtraNotes(e.target.value)}
                />
              </div>

              {/* AI generate button */}
              <div className="rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold mb-0.5">AI Description Generator</p>
                    <p className="text-xs text-muted-foreground mb-3">
                      Writes a professional dealer-style description using your RV details and selected features. Edit freely after.
                    </p>
                    <Button size="sm" onClick={generateDescription} disabled={generating} className="gap-2">
                      {generating
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</>
                        : <><Sparkles className="w-3.5 h-3.5" /> Generate Description</>}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Description textarea */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">
                  Description
                  {form.description && (
                    <span className="ml-2 text-xs text-green-600 font-normal">✓ AI generated — feel free to edit</span>
                  )}
                </label>
                <textarea
                  className="w-full min-h-[180px] rounded-lg border-2 border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary resize-y"
                  placeholder="Describe your RV's features, condition, history… or use the AI generator above."
                  value={form.description}
                  onChange={(e) => update("description", e.target.value)}
                />
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                <Button className="flex-1" onClick={() => setStep(3)}>Continue</Button>
              </div>
            </div>
          )}

          {/* ── Step 3: Contact ── */}
          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-xl font-semibold mb-4">Contact Information</h2>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">Full Name *</label>
                <Input placeholder="Your name" value={form.name} onChange={(e) => update("name", e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">Email *</label>
                <Input type="email" placeholder="you@example.com" value={form.email} onChange={(e) => update("email", e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">Phone</label>
                <Input type="tel" placeholder="(555) 123-4567" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
                <Button className="flex-1" disabled={!form.name || !form.email} onClick={handleSubmit}>
                  Submit Listing
                </Button>
              </div>
            </div>
          )}

        </div>
      </div>
    </Layout>
  );
}
