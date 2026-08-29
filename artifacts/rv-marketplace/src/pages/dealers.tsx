import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Redirect, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart2,
  Bot,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  DatabaseZap,
  FileText,
  Filter,
  Gauge,
  Globe2,
  LayoutDashboard,
  Lock,
  Mail,
  MapPin,
  MessageSquare,
  Package,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserRound,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, BarChart, Bar } from "recharts";
import { trackEvent } from "@/lib/analytics";
import { clearDealerSession, getDealerSession, upgradeDealerTier, type DealerTier } from "@/lib/dealer-auth";

const BASE = import.meta.env.BASE_URL || "/";

type PortalSection = "Dashboard" | "Active Leads" | "Inventory Intelligence" | "AI Lead Agent" | "Performance" | "Dealer Settings";

const TIER_RANK: Record<DealerTier, number> = { free: 0, intelligence: 1, agent: 2 };
const SECTION_TIER: Record<PortalSection, DealerTier> = {
  "Dashboard": "free",
  "Active Leads": "free",
  "Inventory Intelligence": "intelligence",
  "AI Lead Agent": "agent",
  "Performance": "free",
  "Dealer Settings": "free",
};
type Accent = "primary" | "secondary";

interface ApiLead {
  id: number;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  message?: string | null;
  leadSource?: string | null;
  status?: string | null;
  crmSyncStatus?: string | null;
  createdAt?: string | null;
  listingSnapshot?: Record<string, unknown> | null;
  buyerProfile?: Record<string, unknown> | null;
}

interface DealerLead {
  id: string;
  name: string;
  leadId: string;
  email: string;
  phone: string;
  status: "New" | "Contacted" | "Quoted" | "Appointment" | "Won";
  source: string;
  createdAt: string;
  readinessScore: number;
  aiProfile: string;
  highlightText: string;
  tags: string[];
  accent: Accent;
  avatarGradient: string;
  targetRv: string;
  budget: string;
  lastAction: string;
  locationSignal?: string;
  filterSummary?: string;
  intentSignals?: string[];
  matchReportStatus?: "full" | "half" | "none";
}

const MOCK_LEADS: DealerLead[] = [
  {
    id: "1",
    name: "Marcus Thorne",
    leadId: "#EXPL-9922",
    email: "marcus.thorne@example.com",
    phone: "(206) 555-0198",
    status: "New",
    source: "Match Report",
    createdAt: "2026-05-17T08:24:00.000Z",
    readinessScore: 96,
    aiProfile:
      "Looking for Class A Diesel Pushers, off-grid capability, and seating for 4+ sleepers. High interest in solar-equipped units and 4-season insulation.",
    highlightText: "Class A Diesel Pushers",
    tags: ["Match Report ✓", "Solar Ready", "Ready to Finance"],
    accent: "primary",
    avatarGradient: "linear-gradient(135deg, #0B1117 0%, #002829 100%)",
    targetRv: "Class A Diesel Pusher",
    budget: "$180k-$260k",
    lastAction: "Completed Match Report — received 3 personalized matches",
    locationSignal: "Seattle, WA - dealer within 18 miles",
    filterSummary: "Class A, under $260k, 4-season, solar",
    intentSignals: ["Completed Match Report — 3 matches received", "Viewed 4 Class A listings", "Opened dealer contact form"],
    matchReportStatus: "full",
  },
  {
    id: "2",
    name: "Elena Rodriguez",
    leadId: "#EXPL-9854",
    email: "elena.rodriguez@example.com",
    phone: "(425) 555-0154",
    status: "Contacted",
    source: "AI Outfitter",
    createdAt: "2026-05-16T20:12:00.000Z",
    readinessScore: 73,
    aiProfile:
      "Actively searching for Class B Adventure Vans. Prefers Winnebago Revel or Storyteller Overland models. Focus on 4x4 capability and lithium power systems.",
    highlightText: "Class B Adventure Vans",
    tags: ["Core Q&A ✓", "4x4 Chassis", "Trade-in Pending"],
    accent: "secondary",
    avatarGradient: "linear-gradient(135deg, #924c00 0%, #fe9b49 100%)",
    targetRv: "Class B Adventure Van",
    budget: "$135k-$190k",
    lastAction: "Completed Match Report core Q&A — hasn't viewed matches yet",
    locationSignal: "Bellevue, WA - shopping nearby inventory",
    filterSummary: "Class B, 4x4, lithium power, used",
    intentSignals: ["Match Report core Q&A done", "Compared Storyteller and Revel", "Saved adventure van search"],
    matchReportStatus: "half",
  },
  {
    id: "3",
    name: "Daniel Park",
    leadId: "#EXPL-9801",
    email: "daniel.park@example.com",
    phone: "(253) 555-0167",
    status: "Quoted",
    source: "Browse Inventory",
    createdAt: "2026-05-15T17:45:00.000Z",
    readinessScore: 61,
    aiProfile:
      "Researching Fifth Wheel options for full-time living. Needs residential kitchen, master bedroom slide-out, and 50-amp service. Budget flexible up to $120k.",
    highlightText: "Fifth Wheel options",
    tags: ["Core Q&A ✓", "Full-Timer", "50-Amp"],
    accent: "primary",
    avatarGradient: "linear-gradient(135deg, #2a6a4a 0%, #93d5ad 100%)",
    targetRv: "Luxury Fifth Wheel",
    budget: "$90k-$120k",
    lastAction: "Saved 3 Keystone Montana listings",
    locationSignal: "Tacoma, WA - state filter active",
    filterSummary: "Fifth Wheel, residential kitchen, $120k max",
    intentSignals: ["Match Report core Q&A done", "Saved 3 Keystone Montana listings", "Filtered by slides and washer/dryer"],
    matchReportStatus: "half",
  },
  {
    id: "4",
    name: "Sarah Mitchell",
    leadId: "#EXPL-9768",
    email: "sarah.mitchell@example.com",
    phone: "(360) 555-0132",
    status: "Appointment",
    source: "Price Alert",
    createdAt: "2026-05-14T22:05:00.000Z",
    readinessScore: 91,
    aiProfile:
      "Weekend warrior looking for a compact Travel Trailer to match her Ford F-150. Focused on lightweight options under 7,500 lbs GVWR with outdoor kitchen.",
    highlightText: "Travel Trailer",
    tags: ["Match Report ✓", "Pre-approved", "Outdoor Kitchen"],
    accent: "secondary",
    avatarGradient: "linear-gradient(135deg, #745b00 0%, #ffe08b 100%)",
    targetRv: "Lightweight Travel Trailer",
    budget: "$38k-$62k",
    lastAction: "Completed Match Report — booked Saturday walkthrough",
    locationSignal: "Olympia, WA - close to dealership",
    filterSummary: "Travel Trailer, under 7,500 lbs, outdoor kitchen",
    intentSignals: ["Completed Match Report — 3 matches received", "Checked tow fit via MatchRV", "Booked Saturday walkthrough"],
    matchReportStatus: "full",
  },
];

const PERFORMANCE_SERIES = [
  { day: "Mon", leads: 9, quotes: 5, closes: 1 },
  { day: "Tue", leads: 12, quotes: 7, closes: 2 },
  { day: "Wed", leads: 8, quotes: 6, closes: 2 },
  { day: "Thu", leads: 15, quotes: 9, closes: 3 },
  { day: "Fri", leads: 18, quotes: 12, closes: 4 },
  { day: "Sat", leads: 21, quotes: 14, closes: 5 },
  { day: "Sun", leads: 16, quotes: 10, closes: 3 },
];

const LISTING_PERFORMANCE = [
  { model: "Entegra Anthem", views: 248, leads: 12 },
  { model: "Storyteller Classic", views: 213, leads: 10 },
  { model: "Montana 3761FL", views: 181, leads: 8 },
  { model: "Jay Feather 25RB", views: 154, leads: 7 },
];

const NAV_ITEMS: { label: PortalSection; icon: LucideIcon }[] = [
  { icon: LayoutDashboard, label: "Dashboard" },
  { icon: Users, label: "Active Leads" },
  { icon: Zap, label: "Inventory Intelligence" },
  { icon: Bot, label: "AI Lead Agent" },
  { icon: BarChart2, label: "Performance" },
  { icon: Settings, label: "Dealer Settings" },
];

export function Dealers() {
  const [, setLocation] = useLocation();
  const [dealerSession, setDealerSessionState] = useState(() => getDealerSession());
  const [activeNav, setActiveNav] = useState<PortalSection>("Dashboard");
  const [adminKey, setAdminKey] = useState(() => localStorage.getItem("matchrv_dealer_key") ?? "");
  const [leads, setLeads] = useState<DealerLead[]>(MOCK_LEADS);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [liveStatus, setLiveStatus] = useState(adminKey ? "Ready to sync live leads" : "Demo data active");
  const [upgradeTarget, setUpgradeTarget] = useState<DealerTier | null>(null);

  const tier: DealerTier = dealerSession?.tier ?? "free";

  useEffect(() => {
    trackEvent("page_view", { metadata: { page: "dealers" } });
  }, []);

  useEffect(() => {
    if (!adminKey) return;
    localStorage.setItem("matchrv_dealer_key", adminKey);
    void loadLiveLeads(adminKey, setLeads, setLoadingLeads, setLiveStatus);
  }, [adminKey]);

  const kpis = useMemo(() => buildKpis(leads), [leads]);

  if (!dealerSession) {
    return <Redirect to="/dealers/login" replace />;
  }

  function handleSignOut() {
    clearDealerSession();
    setDealerSessionState(null);
    setLocation("/dealers/login", { replace: true });
  }

  function handleNavClick(section: PortalSection) {
    const required = SECTION_TIER[section];
    if (TIER_RANK[tier] < TIER_RANK[required]) {
      setUpgradeTarget(required);
    } else {
      setActiveNav(section);
    }
  }

  function handleUpgradeConfirm(newTier: DealerTier) {
    upgradeDealerTier(newTier);
    const updated = getDealerSession();
    setDealerSessionState(updated);
    setUpgradeTarget(null);
    const section = (Object.entries(SECTION_TIER) as [PortalSection, DealerTier][])
      .find(([, t]) => t === newTier)?.[0];
    if (section) setActiveNav(section);
  }

  return (
    <Layout>
      <SEO
        title="Dealer Portal - MatchRV Lead Management"
        description="MatchRV dealer portal for lead management, performance reporting, CRM integration, and billing."
        canonical="https://matchrv.com/dealers"
      />
      <div className="flex min-h-[calc(100vh-80px)] bg-[#f4fbfa]">
        <DealerSidebar
          activeNav={activeNav}
          dealerEmail={dealerSession.email}
          tier={tier}
          onSignOut={handleSignOut}
          setActiveNav={handleNavClick}
        />
        <main className="flex-1 overflow-hidden">
          <div className="border-b border-[#E2E8F0] bg-white/70 px-4 py-3 md:hidden">
            <div className="flex gap-2 overflow-x-auto">
              {NAV_ITEMS.map(({ label, icon: Icon }) => {
                const locked = TIER_RANK[tier] < TIER_RANK[SECTION_TIER[label]];
                return (
                  <button
                    key={label}
                    onClick={() => handleNavClick(label)}
                    className={`flex shrink-0 items-center gap-2 rounded px-4 py-2 text-sm font-bold ${
                      activeNav === label ? "bg-[#0B1117] text-white" : "bg-white text-[#3b4949]"
                    }`}
                  >
                    {locked ? <Lock className="h-3.5 w-3.5" /> : <Icon className="h-4 w-4" />}
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <section className="px-4 py-8 sm:px-6 lg:px-8">
            {activeNav === "Dashboard" && <Dashboard leads={leads} kpis={kpis} loadingLeads={loadingLeads} liveStatus={liveStatus} />}
            {activeNav === "Active Leads" && <ActiveLeads leads={leads} />}
            {activeNav === "Inventory Intelligence" && (
              <DealerGate
                requiredTier="intelligence"
                currentTier={tier}
                onUpgrade={() => setUpgradeTarget("intelligence")}
              >
                <InventoryIntelligence />
              </DealerGate>
            )}
            {activeNav === "AI Lead Agent" && (
              <DealerGate
                requiredTier="agent"
                currentTier={tier}
                onUpgrade={() => setUpgradeTarget("agent")}
              >
                <AiLeadAgent leads={leads} />
              </DealerGate>
            )}
            {activeNav === "Performance" && <Performance leads={leads} kpis={kpis} />}
            {activeNav === "Dealer Settings" && (
              <DealerSettings
                adminKey={adminKey}
                setAdminKey={setAdminKey}
                liveStatus={liveStatus}
                tier={tier}
                refresh={() => adminKey && loadLiveLeads(adminKey, setLeads, setLoadingLeads, setLiveStatus)}
              />
            )}
          </section>
        </main>
      </div>

      {upgradeTarget && (
        <UpgradeModal
          target={upgradeTarget}
          currentTier={tier}
          onConfirm={handleUpgradeConfirm}
          onClose={() => setUpgradeTarget(null)}
        />
      )}
    </Layout>
  );
}

const TIER_LABELS: Record<DealerTier, { label: string; color: string; bg: string }> = {
  free: { label: "Leads", color: "#0B1117", bg: "#00CED1" },
  intelligence: { label: "Intelligence", color: "#241a00", bg: "#ffe08b" },
  agent: { label: "AI Agent", color: "#ffffff", bg: "#0B1117" },
};

function DealerSidebar({
  activeNav,
  dealerEmail,
  tier,
  onSignOut,
  setActiveNav,
}: {
  activeNav: PortalSection;
  dealerEmail: string;
  tier: DealerTier;
  onSignOut: () => void;
  setActiveNav: (section: PortalSection) => void;
}) {
  const tierInfo = TIER_LABELS[tier];
  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-[#E2E8F0] bg-white px-4 py-8 md:flex lg:w-64">
      <div className="mb-2 px-4">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-[#3b4949]">Portal</p>
          <span
            className="rounded px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide"
            style={{ backgroundColor: tierInfo.bg, color: tierInfo.color }}
          >
            {tierInfo.label}
          </span>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ icon: Icon, label }) => {
            const required = SECTION_TIER[label];
            const locked = TIER_RANK[tier] < TIER_RANK[required];
            const isActive = activeNav === label;
            return (
              <button
                key={label}
                onClick={() => setActiveNav(label)}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition-all ${
                  isActive
                    ? "bg-[#00643f] text-white"
                    : locked
                    ? "text-[#6b7a7a] hover:bg-[#eef5f4]"
                    : "text-[#3b4949] hover:bg-[#eef5f4]"
                }`}
              >
                {locked ? (
                  <Lock className="h-4 w-4 shrink-0 text-[#c4c8c5]" />
                ) : (
                  <Icon className="h-5 w-5 shrink-0" />
                )}
                <span className="flex-1">{label}</span>
                {locked && (
                  <span className="rounded-md bg-[#eef5f4] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-[#6b7a7a]">
                    {required === "intelligence" ? "Tier 1" : "Tier 2"}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="rounded-2xl bg-[#ffdcc4] p-5">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#924c00]" />
          <span className="text-xs font-black uppercase tracking-tight text-[#924c00]">AI Strategy</span>
        </div>
        <p className="mb-4 text-sm leading-relaxed text-[#2f1400]">
          You have 3 leads likely to close within 48 hours. Focus on the Class A segment today.
        </p>
        <button className="w-full rounded bg-[#a6530a] py-2 text-xs font-black text-white transition-opacity hover:opacity-90">
          VIEW ACTION PLAN
        </button>
      </div>

      <div className="mt-auto rounded-2xl border border-[#E2E8F0] bg-[#f4fbfa] p-4">
        <p className="text-xs font-black uppercase tracking-widest text-[#6b7a7a]">Signed in</p>
        <p className="mt-1 truncate text-sm font-bold text-[#161d1d]">{dealerEmail}</p>
        <button
          onClick={onSignOut}
          className="mt-3 w-full rounded border border-[#E2E8F0] bg-white py-2 text-xs font-black text-[#3b4949] transition-colors hover:border-[#0B1117] hover:text-[#0B1117]"
        >
          Sign Out
        </button>
      </div>
    </aside>
  );
}

function Dashboard({ leads, kpis, loadingLeads, liveStatus }: { leads: DealerLead[]; kpis: ReturnType<typeof buildKpis>; loadingLeads: boolean; liveStatus: string }) {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Dealer Dashboard"
        subtitle="Live buyer intent, quote activity, and inventory alignment for your MatchRV leads."
        actions={<SyncPill loading={loadingLeads} status={liveStatus} />}
      />
      <KpiGrid kpis={kpis} />
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm md:p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-display text-xl font-black text-[#0B1117]">High-Intent Leads</h2>
              <p className="text-sm text-[#6b7a7a]">AI-prioritized prospects ready for dealer follow-up.</p>
            </div>
            <button className="rounded-full bg-[#eef5f4] p-3 text-[#161d1d]" aria-label="Filter leads">
              <Filter className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            {leads.slice(0, 4).map((lead) => <LeadCard key={lead.id} lead={lead} />)}
          </div>
        </div>
        <div className="space-y-6">
          <ActivityPanel leads={leads} />
          <InventoryInsight />
        </div>
      </div>
    </div>
  );
}

function ActiveLeads({ leads }: { leads: DealerLead[] }) {
  return (
    <div className="space-y-8">
      <PageHeader
        title="High-Intent Leads"
        subtitle="AI-prioritized prospects based on search behavior, financial readiness, and inventory alignment."
        actions={
          <div className="flex gap-3">
            <button className="flex items-center gap-2 rounded bg-[#E2E8F0] px-5 py-3 text-sm font-semibold text-[#161d1d]">
              <Filter className="h-4 w-4" /> Filter
            </button>
            <button className="flex items-center gap-2 rounded bg-[#0B1117] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-[#0B1117]/10">
              <Plus className="h-4 w-4" /> Add New Lead
            </button>
          </div>
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {leads.map((lead) => <LeadCard key={lead.id} lead={lead} />)}
      </div>
      <LeadTable leads={leads} />
    </div>
  );
}

function Performance({ leads, kpis }: { leads: DealerLead[]; kpis: ReturnType<typeof buildKpis> }) {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Performance"
        subtitle="Dealer-facing analytics for conversion, response speed, lead quality, and listing engagement."
        actions={<button className="rounded bg-[#0B1117] px-5 py-3 text-sm font-bold text-white">Export Report</button>}
      />
      <KpiGrid kpis={kpis} />
      <ReadinessScoreBreakdown leads={leads} />
      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard title="Lead Pipeline" subtitle="Leads, quotes, and closes by day">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={PERFORMANCE_SERIES}>
              <XAxis dataKey="day" axisLine={false} tickLine={false} />
              <YAxis axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 14, border: "1px solid #E2E8F0" }} />
              <Area type="monotone" dataKey="leads" stroke="#0B1117" fill="#00CED1" strokeWidth={3} />
              <Area type="monotone" dataKey="quotes" stroke="#924c00" fill="#ffdcc4" strokeWidth={3} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Listing Performance" subtitle="Views and matched leads by model">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={LISTING_PERFORMANCE}>
              <XAxis dataKey="model" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
              <YAxis axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 14, border: "1px solid #E2E8F0" }} />
              <Bar dataKey="views" fill="#0B1117" radius={[8, 8, 0, 0]} />
              <Bar dataKey="leads" fill="#d97706" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <MetricPanel icon={Sparkles} label="Match Report rate" value="63%" detail="+18% vs last month" />
        <MetricPanel icon={Gauge} label="Avg response time" value="1.4 hrs" detail="↓22% from last month" />
        <MetricPanel icon={CheckCircle2} label="Quote acceptance" value="44%" detail="11 custom quotes accepted" />
        <MetricPanel icon={TrendingUp} label="Top segment" value="Class B" detail="Adventure vans up 31%" />
      </div>
      <LeadTable leads={leads} />
    </div>
  );
}

function DealerSettings({
  adminKey,
  setAdminKey,
  liveStatus,
  tier,
  refresh,
}: {
  adminKey: string;
  setAdminKey: (key: string) => void;
  liveStatus: string;
  tier: DealerTier;
  refresh: () => void;
}) {
  return (
    <div className="space-y-8">
      <PageHeader title="Dealer Settings" subtitle="Manage dealer profile, contact routing, CRM integrations, billing, and payment settings." />
      <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <SettingsCard title="Dealer Profile" icon={Building2}>
          <Field label="Dealer website domain" defaultValue="https://evergreenrvcenter.com" icon={Globe2} />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Dealer group" defaultValue="Evergreen RV Center" />
            <Field label="Store ID" defaultValue="MRV-WA-1042" />
          </div>
          <Field label="Lead delivery email" defaultValue="internet@evergreenrvcenter.com" icon={Mail} />
        </SettingsCard>
        <SettingsCard title="Primary Contact" icon={UserRound}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Name" defaultValue="Avery Coleman" />
            <Field label="Role" defaultValue="Internet Sales Director" />
          </div>
          <Field label="Email" defaultValue="avery@evergreenrvcenter.com" icon={Mail} />
          <Field label="Phone" defaultValue="(206) 555-0188" icon={Phone} />
        </SettingsCard>
      </div>

      <SettingsCard title="DMS / CRM Integration" icon={DatabaseZap}>
        <div className="grid gap-4 lg:grid-cols-3">
          <Field label="CDK dealer ID" defaultValue="CDK-771204" />
          <Field label="DealerSocket rooftop ID" defaultValue="DS-WA-4498" />
          <Field label="ADF/XML endpoint" defaultValue="https://crm.example.com/adf/matchrv" />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Field label="CRM API username" defaultValue="matchrv_leads" />
          <Field label="CRM API token" defaultValue="****************" />
          <label className="flex items-center justify-between rounded-2xl border border-[#E2E8F0] bg-[#f4fbfa] px-4 py-3">
            <span>
              <span className="block text-xs font-bold uppercase tracking-widest text-[#6b7a7a]">Real-time push</span>
              <span className="text-sm font-bold text-[#161d1d]">Enabled for new leads</span>
            </span>
            <input className="h-5 w-5 accent-[#0B1117]" type="checkbox" defaultChecked />
          </label>
        </div>
        <div className="rounded-2xl bg-[#eef5f4] p-4 text-sm text-[#3b4949]">
          MatchRV can post ADF/XML or JSON lead payloads to CDK, DealerSocket, VinSolutions, Elead, HubSpot, or a custom webhook.
        </div>
      </SettingsCard>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <SettingsCard title="Live Lead Feed" icon={ShieldCheck}>
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-[#6b7a7a]">Dealer/admin API key</span>
            <div className="flex gap-3">
              <input
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                placeholder="Paste key to pull live /api/admin/leads"
                className="min-w-0 flex-1 rounded-2xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#0B1117]"
              />
              <button onClick={refresh} className="rounded-2xl bg-[#0B1117] px-4 py-3 text-white" aria-label="Refresh live leads">
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </label>
          <p className="text-sm font-semibold text-[#3b4949]">{liveStatus}</p>
        </SettingsCard>
        <BillingPanel tier={tier} />
      </div>
    </div>
  );
}

const BILLING_PLANS: Record<DealerTier, { name: string; price: string; detail: string; invoice: string }> = {
  free: { name: "Leads (Free)", price: "Included", detail: "Lead enrichment + Buyer Roadmap", invoice: "$0" },
  intelligence: { name: "Inventory Intelligence", price: "$497/mo", detail: "Aged stock, demand gaps, hot units", invoice: "$497" },
  agent: { name: "AI Agent Bundle", price: "$997/mo", detail: "Intelligence + 24/7 AI qualification", invoice: "$997" },
};

function BillingPanel({ tier }: { tier: DealerTier }) {
  const plan = BILLING_PLANS[tier];
  const invoices = [
    ["INV-1048", `May 2026 — ${plan.name}`, plan.invoice === "$0" ? "Free" : plan.invoice, "Paid"],
    ["INV-1047", "April 2026 premium leads", "$1,720.00", "Paid"],
    ["INV-1046", "March 2026 marketplace subscription", "$1,495.00", "Paid"],
  ];
  return (
    <SettingsCard title="Billing / Pay" icon={CreditCard}>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl bg-[#eef5f4] border border-[#E2E8F0] p-5 text-[#161d1d]">
          <p className="text-xs font-bold uppercase tracking-widest text-[#3b4949]">Current plan</p>
          <p className="mt-2 font-display text-xl font-black">{plan.name}</p>
          <p className="mt-1 text-sm text-[#00696b]">{plan.price}</p>
          <p className="mt-0.5 text-xs text-[#3b4949]">{plan.detail}</p>
        </div>
        <MetricPanel icon={Calendar} label="Next invoice" value="Jul 1" detail={`${plan.invoice} estimated`} compact />
        <MetricPanel icon={CreditCard} label="Payment method" value="Visa 4242" detail="Expires 08/2029" compact />
      </div>
      <div className="overflow-hidden rounded-2xl border border-[#E2E8F0]">
        {invoices.map(([id, desc, amount, status]) => (
          <div key={id} className="grid grid-cols-[0.8fr_1.5fr_0.7fr_0.6fr] gap-3 border-b border-[#E2E8F0] px-4 py-3 text-sm last:border-b-0">
            <span className="font-bold text-[#0B1117]">{id}</span>
            <span className="text-[#3b4949]">{desc}</span>
            <span className="font-bold">{amount}</span>
            <span className="rounded bg-[#00CED1] px-2 py-1 text-center text-xs font-black text-[#0B1117]">{status}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <button className="rounded bg-[#0B1117] px-5 py-3 text-sm font-bold text-white">Manage Payment Method</button>
        <button className="rounded bg-[#eef5f4] px-5 py-3 text-sm font-bold text-[#161d1d]">Download Invoices</button>
      </div>
    </SettingsCard>
  );
}

function LeadCard({ lead }: { lead: DealerLead }) {
  const isPrimary = lead.accent === "primary";
  const accentColor = isPrimary ? "#0B1117" : "#a6530a";
  const badgeBg = isPrimary ? "#00CED1" : "#ffdcc4";
  const badgeText = isPrimary ? "#0B1117" : "#6f3800";
  const intentSignals = lead.intentSignals ?? [];
  const locationSignal = lead.locationSignal ?? "Location signal pending";
  const filterSummary = lead.filterSummary ?? "Search preferences pending";

  return (
    <article className="flex flex-col justify-between rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm transition-transform hover:scale-[1.01] md:p-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-black text-white shadow-md ring-2 ring-white" style={{ background: lead.avatarGradient }}>
            {lead.name.split(" ").map((n) => n[0]).join("")}
          </div>
          <div>
            <h3 className="font-display text-xl font-bold text-[#161d1d]">{lead.name}</h3>
            <p className="text-sm text-[#3b4949]">Lead ID: {lead.leadId}</p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="mb-1 rounded px-3 py-1 text-xs font-black" style={{ backgroundColor: badgeBg, color: badgeText }}>
            {lead.readinessScore}% READY
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#3b4949]">Readiness Score</span>
          {lead.matchReportStatus === "full" && (
            <p className="mt-1 text-[10px] font-black text-[#0B1117]">✓ Match Report Done</p>
          )}
          {lead.matchReportStatus === "half" && (
            <p className="mt-1 text-[10px] font-semibold text-[#924c00]">⚡ Core Q&A Done</p>
          )}
          <LeadTierBadge score={lead.readinessScore} />
        </div>
      </div>
      <div className="mb-6 rounded-xl border-l-4 bg-[#eef5f4] p-5" style={{ borderLeftColor: accentColor }}>
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0" style={{ color: accentColor }} />
          <span className="text-xs font-black uppercase tracking-tighter" style={{ color: accentColor }}>AI Preference Profile</span>
        </div>
        <p className="text-sm font-medium leading-relaxed text-[#161d1d]">{renderHighlighted(lead.aiProfile, lead.highlightText, accentColor)}</p>
      </div>
      <div className="mb-6 grid gap-3 text-sm md:grid-cols-2">
        <div className="rounded-xl border border-[#E2E8F0] bg-[#f4fbfa] p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-[#6b7a7a]">
            <MapPin className="h-3.5 w-3.5 text-[#0B1117]" /> Proximity
          </div>
          <p className="font-semibold text-[#161d1d]">{locationSignal}</p>
        </div>
        <div className="rounded-xl border border-[#E2E8F0] bg-[#f4fbfa] p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-[#6b7a7a]">
            <Filter className="h-3.5 w-3.5 text-[#0B1117]" /> Filters
          </div>
          <p className="font-semibold text-[#161d1d]">{filterSummary}</p>
        </div>
      </div>
      {intentSignals.length > 0 && (
        <div className="mb-6 rounded-xl bg-[#fff8eb] p-4">
          <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-[#924c00]">Intent Trail</p>
          <div className="space-y-1.5">
            {intentSignals.slice(0, 3).map((signal) => (
              <div key={signal} className="flex items-start gap-2 text-xs font-semibold text-[#2f1400]">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#924c00]" />
                {signal}
              </div>
            ))}
          </div>
        </div>
      )}
      <BuyerRoadmapPanel score={lead.readinessScore} lead={lead} />
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {lead.tags.map((tag, idx) => (
          <span key={tag} className={`rounded-lg px-3 py-1 text-xs font-semibold ${idx < 2 ? "bg-[#ffe08b] text-[#241a00]" : "bg-[#E2E8F0] text-[#3b4949]"}`}>
            {tag}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <button className="flex items-center justify-center gap-2 rounded-xl bg-[#eef5f4] py-3 text-sm font-bold text-[#161d1d] transition-all hover:bg-[#E2E8F0]">
          <MessageSquare className="h-4 w-4" /> Contact via AI
        </button>
        <button className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white transition-all hover:opacity-90" style={{ backgroundColor: accentColor }}>
          <FileText className="h-4 w-4" /> Send Custom Quote
        </button>
      </div>
    </article>
  );
}

function LeadTable({ leads }: { leads: DealerLead[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-[#E2E8F0] p-5">
        <div>
          <h2 className="font-display text-xl font-black text-[#0B1117]">Lead Queue</h2>
          <p className="text-sm text-[#6b7a7a]">Contact details, status, source, and latest buyer action.</p>
        </div>
        <Search className="h-5 w-5 text-[#6b7a7a]" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-[#eef5f4] text-xs uppercase tracking-widest text-[#6b7a7a]">
            <tr>
              <th className="px-5 py-4">Lead</th>
              <th className="px-5 py-4">Contact</th>
              <th className="px-5 py-4">Target RV</th>
              <th className="px-5 py-4">Budget</th>
              <th className="px-5 py-4">Status</th>
              <th className="px-5 py-4">Last Action</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className="border-t border-[#E2E8F0]">
                <td className="px-5 py-4">
                  <p className="font-bold text-[#161d1d]">{lead.name}</p>
                  <p className="text-xs text-[#6b7a7a]">{lead.leadId} / {relativeTime(lead.createdAt)}</p>
                </td>
                <td className="px-5 py-4 text-[#3b4949]">
                  <p>{lead.email}</p>
                  <p>{lead.phone}</p>
                </td>
                <td className="px-5 py-4 font-semibold text-[#0B1117]">{lead.targetRv}</td>
                <td className="px-5 py-4">{lead.budget}</td>
                <td className="px-5 py-4"><StatusBadge status={lead.status} /></td>
                <td className="px-5 py-4 text-[#3b4949]">{lead.lastAction}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KpiGrid({ kpis }: { kpis: ReturnType<typeof buildKpis> }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MetricPanel icon={Users} label="Active leads" value={String(kpis.activeLeads)} detail={`${kpis.hotLeads} above 85 — hot leads`} />
      <MetricPanel icon={Activity} label="Avg readiness" value={`${kpis.avgReadiness}%`} detail="+9 pts this week" />
      <MetricPanel icon={FileText} label="Quotes sent" value={String(kpis.quotes)} detail="41% acceptance rate" />
      <MetricPanel icon={TrendingUp} label="Projected revenue" value="$428k" detail="Open pipeline value" />
    </div>
  );
}

function ReadinessScoreBreakdown({ leads }: { leads: DealerLead[] }) {
  const fullReport = leads.filter((l) => l.matchReportStatus === "full").length;
  const halfReport = leads.filter((l) => l.matchReportStatus === "half").length;
  const browseOnly = leads.filter((l) => !l.matchReportStatus || l.matchReportStatus === "none").length;

  const factors = [
    {
      label: "Match Report Completed",
      sublabel: "Buyer answered all questions and received their 3 personalized RV matches — the strongest buying signal on the platform",
      pts: 60,
      ptsLabel: "up to 60 pts",
      color: "#0B1117",
      bg: "#00CED1",
      textColor: "#0B1117",
    },
    {
      label: "Match Report — Core Q&A",
      sublabel: "Completed core discovery steps: RV type, use case, location, and budget (reached the fork, steps 1–7)",
      pts: 25,
      ptsLabel: "up to 25 pts",
      color: "#924c00",
      bg: "#ffdcc4",
      textColor: "#6f3800",
    },
    {
      label: "Behavioral Signals",
      sublabel: "Page views, filter use, listing views, saved RVs, tow checks, return visits, location signal — all first-party data",
      pts: 40,
      ptsLabel: "up to 40 pts",
      color: "#3b4949",
      bg: "#E2E8F0",
      textColor: "#161d1d",
    },
  ];

  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#eff8f2] text-[#0B1117]">
          <Gauge className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-display text-xl font-black text-[#0B1117]">Buyer Readiness Score — How It's Calculated</h2>
          <p className="text-sm text-[#6b7a7a]">Every buyer is scored 0–100 in real time. Match Report completion is the single largest factor — it's the moat.</p>
        </div>
      </div>

      <div className="space-y-5">
        {factors.map((f) => (
          <div key={f.label}>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: f.color }} />
                <span className="text-sm font-black text-[#161d1d]">{f.label}</span>
              </div>
              <span className="rounded-full px-3 py-0.5 text-xs font-black" style={{ backgroundColor: f.bg, color: f.textColor }}>{f.ptsLabel}</span>
            </div>
            <div className="mb-1.5 h-3 overflow-hidden rounded-full bg-[#eef5f4]">
              <div className="h-full rounded-full" style={{ width: `${f.pts}%`, backgroundColor: f.color }} />
            </div>
            <p className="text-xs text-[#6b7a7a]">{f.sublabel}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3 border-t border-[#E2E8F0] pt-5">
        <div className="rounded-2xl bg-[#eff8f2] p-4 text-center">
          <p className="font-display text-3xl font-black text-[#0B1117]">{fullReport}</p>
          <p className="text-xs font-bold text-[#0B1117]">Full Match Report</p>
          <p className="mt-0.5 text-[10px] text-[#6b7a7a]">+60 pts · hot lead signal</p>
        </div>
        <div className="rounded-2xl bg-[#fff8eb] p-4 text-center">
          <p className="font-display text-3xl font-black text-[#924c00]">{halfReport}</p>
          <p className="text-xs font-bold text-[#924c00]">Core Q&A Done</p>
          <p className="mt-0.5 text-[10px] text-[#6b7a7a]">+25 pts · high intent</p>
        </div>
        <div className="rounded-2xl bg-[#eef5f4] p-4 text-center">
          <p className="font-display text-3xl font-black text-[#6b7a7a]">{browseOnly}</p>
          <p className="text-xs font-bold text-[#6b7a7a]">Browse Only</p>
          <p className="mt-0.5 text-[10px] text-[#6b7a7a]">behavioral signals only</p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-[#0B1117] px-5 py-4">
        <p className="text-sm text-[#00CED1]">
          <span className="font-black text-white">The moat: </span>
          Buyers who complete the Match Report are <span className="font-bold text-white">4× more likely</span> to contact a dealer within 48 hours compared to browse-only visitors — and they arrive with a specific RV already in mind.
        </p>
      </div>
    </div>
  );
}

function MetricPanel({ icon: Icon, label, value, detail, compact = false }: { icon: LucideIcon; label: string; value: string; detail: string; compact?: boolean }) {
  return (
    <div className={`rounded-2xl border border-[#E2E8F0] bg-white shadow-sm ${compact ? "p-5" : "p-6"}`}>
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-[#eff8f2] text-[#0B1117]">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-xs font-bold uppercase tracking-widest text-[#6b7a7a]">{label}</p>
      <p className="mt-1 font-display text-3xl font-black text-[#0B1117]">{value}</p>
      <p className="mt-1 text-sm text-[#3b4949]">{detail}</p>
    </div>
  );
}

function ActivityPanel({ leads }: { leads: DealerLead[] }) {
  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm">
      <h2 className="font-display text-xl font-black text-[#0B1117]">Latest Activity</h2>
      <div className="mt-5 space-y-4">
        {leads.slice(0, 4).map((lead) => (
          <div key={lead.id} className="flex gap-3">
            <div className="mt-1 h-2.5 w-2.5 rounded-full bg-[#0B1117]" />
            <div>
              <p className="text-sm font-bold text-[#161d1d]">{lead.name}</p>
              <p className="text-sm text-[#3b4949]">{lead.lastAction}</p>
              <p className="text-xs text-[#6b7a7a]">{relativeTime(lead.createdAt)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InventoryInsight() {
  return (
    <div className="rounded-2xl bg-[#00643f] p-8 text-white">
      <h2 className="font-display text-2xl font-black">High-Match Inventory Insights</h2>
      <p className="mt-4 text-[#00CED1]">
        Your current stock of <span className="font-bold text-white underline underline-offset-4">2024 Entegra Coaches</span> matches 12 high-intent leads in the system.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-white/10 p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-[#91d2ab]">Average Closing</p>
          <p className="font-display text-3xl font-black">14 Days</p>
        </div>
        <div className="rounded-2xl bg-white/10 p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-[#91d2ab]">Search Volume</p>
          <p className="font-display text-3xl font-black">+24%</p>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-4">
        <button className="rounded-full bg-white px-6 py-3 text-sm font-bold text-[#0B1117]">Generate Campaign</button>
        <button className="rounded-full border border-white/20 px-6 py-3 text-sm font-bold text-white">View Analytics</button>
      </div>
    </div>
  );
}

function PageHeader({ title, subtitle, actions }: { title: string; subtitle: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
      <div>
        <h1 className="font-display text-3xl font-black tracking-tight text-[#0B1117] md:text-4xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-[#3b4949]">{subtitle}</p>
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm">
      <h2 className="font-display text-xl font-black text-[#0B1117]">{title}</h2>
      <p className="mb-4 text-sm text-[#6b7a7a]">{subtitle}</p>
      {children}
    </div>
  );
}

function SettingsCard({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <section className="space-y-5 rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#eff8f2] text-[#0B1117]">
          <Icon className="h-5 w-5" />
        </div>
        <h2 className="font-display text-xl font-black text-[#0B1117]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Field({ label, defaultValue, icon: Icon }: { label: string; defaultValue: string; icon?: LucideIcon }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-[#6b7a7a]">{label}</span>
      <span className="relative block">
        {Icon && <Icon className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b7a7a]" />}
        <input defaultValue={defaultValue} className={`w-full rounded-2xl border border-[#E2E8F0] bg-[#f4fbfa] py-3 text-sm outline-none focus:ring-2 focus:ring-[#0B1117] ${Icon ? "pl-11 pr-4" : "px-4"}`} />
      </span>
    </label>
  );
}

function StatusBadge({ status }: { status: DealerLead["status"] }) {
  const styles: Record<DealerLead["status"], string> = {
    New: "bg-[#00CED1] text-[#0B1117]",
    Contacted: "bg-[#ffe08b] text-[#241a00]",
    Quoted: "bg-[#ffdcc4] text-[#6f3800]",
    Appointment: "bg-[#E2E8F0] text-[#161d1d]",
    Won: "bg-[#0B1117] text-white",
  };
  return <span className={`rounded-full px-3 py-1 text-xs font-black ${styles[status]}`}>{status}</span>;
}

function SyncPill({ loading, status }: { loading: boolean; status: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-white px-4 py-3 text-sm font-bold text-[#3b4949] shadow-sm">
      <RefreshCw className={`h-4 w-4 text-[#0B1117] ${loading ? "animate-spin" : ""}`} />
      {status}
    </div>
  );
}

function renderHighlighted(text: string, highlight: string, color: string) {
  const parts = text.split(highlight);
  return parts.map((part, index) => (
    <span key={`${part}-${index}`}>
      {part}
      {index < parts.length - 1 && <span style={{ color }} className="font-bold">{highlight}</span>}
    </span>
  ));
}

function buildKpis(leads: DealerLead[]) {
  const activeLeads = leads.length;
  const hotLeads = leads.filter((lead) => lead.readinessScore >= 85).length;
  const avgReadiness = Math.round(leads.reduce((sum, lead) => sum + lead.readinessScore, 0) / Math.max(leads.length, 1));
  const quotes = leads.filter((lead) => ["Quoted", "Appointment", "Won"].includes(lead.status)).length + 8;
  return { activeLeads, hotLeads, avgReadiness, quotes };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(Boolean).map(String) : [];
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function formatBudget(value: unknown): string | null {
  const n = asNumber(value);
  if (n === null) return typeof value === "string" && value.trim() ? value : null;
  return `$${Math.round(n).toLocaleString()}`;
}

function formatFilterLabel(key: string, value: string): string {
  if (key === "type") return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  if (key === "maxPrice") return `under ${formatBudget(value) ?? value}`;
  if (key === "minPrice") return `from ${formatBudget(value) ?? value}`;
  if (key === "minSleeps") return `sleeps ${value}+`;
  if (key === "state") return `near ${value}`;
  return value === "true" ? key.replace(/([A-Z])/g, " $1").toLowerCase() : value;
}

function summarizeIntentFilters(intent: Record<string, unknown>, profile: Record<string, unknown>): string {
  const filters = asRecord(intent.latestFilters);
  const entries = Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && String(value).trim());
  if (entries.length > 0) {
    return entries.slice(0, 4).map(([key, value]) => formatFilterLabel(key, String(value))).join(", ");
  }
  const rvType = profile.rvType || profile.type;
  const budget = profile.maxBudget || profile.budget;
  return [rvType ? String(rvType) : null, budget ? formatBudget(budget) ?? String(budget) : null].filter(Boolean).join(", ") || "Search behavior captured";
}

function summarizeLocation(intent: Record<string, unknown>, snapshot: Record<string, unknown>): string {
  const location = asRecord(intent.locationIntent);
  const label = location.label || [location.city, location.state].filter(Boolean).join(", ");
  if (label) return String(label);
  const dealerLocation = [snapshot.dealerCity, snapshot.dealerState].filter(Boolean).join(", ");
  if (dealerLocation) return `${dealerLocation} dealer signal`;
  return "Location signal pending";
}

function getIntentSignals(intent: Record<string, unknown>): string[] {
  const activity = asStringArray(intent.recentActivity);
  if (activity.length > 0) return activity;
  const serverEvents = Array.isArray(intent.serverRecentEvents) ? intent.serverRecentEvents : [];
  return serverEvents.slice(0, 5).map((event) => {
    const record = asRecord(event);
    return String(record.eventType ?? "site activity").replace(/_/g, " ");
  });
}

function mapApiLead(apiLead: ApiLead, index: number): DealerLead {
  const name = apiLead.contactName || `MatchRV Buyer ${apiLead.id}`;
  const snapshot = apiLead.listingSnapshot ?? {};
  const profile = apiLead.buyerProfile ?? {};
  const intent = asRecord(profile.matchrvIntent);
  const targetRv = String(snapshot.title || snapshot.rvType || profile.rvType || "Matched RV");
  const budget = formatBudget(profile.budget || profile.maxBudget || snapshot.price) ?? "Budget pending";
  const accent: Accent = index % 2 === 0 ? "primary" : "secondary";
  const intentScore = asNumber(profile.readinessScore) ?? asNumber(profile.intentScore) ?? asNumber(intent.readinessScore) ?? asNumber(intent.score);
  const readinessScore = Math.max(30, Math.min(100, intentScore ?? 75 - index * 5));
  const matchReportStatus: "full" | "half" | "none" =
    intent.outfitterFullDone === true ? "full"
    : intent.outfitterHalfDone === true ? "half"
    : "none";
  const status = normalizeStatus(apiLead.status);
  const filterSummary = summarizeIntentFilters(intent, profile);
  const locationSignal = summarizeLocation(intent, snapshot);
  const intentSignals = getIntentSignals(intent);
  const tags = Array.from(new Set([
    ...asStringArray(profile.intentTags),
    ...asStringArray(intent.tags),
    apiLead.crmSyncStatus || "CRM Pending",
    apiLead.leadSource || "Site Lead",
    status,
  ])).slice(0, 5);

  return {
    id: String(apiLead.id),
    name,
    leadId: `#EXPL-${String(9900 - index * 17)}`,
    email: apiLead.contactEmail || "email pending",
    phone: apiLead.contactPhone || "phone pending",
    status,
    source: apiLead.leadSource || "MatchRV",
    createdAt: apiLead.createdAt || new Date().toISOString(),
    readinessScore,
    aiProfile: apiLead.message || `Interested in ${targetRv}. MatchRV captured ${filterSummary.toLowerCase()} plus live site activity and dealer contact intent.`,
    highlightText: targetRv,
    tags,
    accent,
    avatarGradient: accent === "primary" ? "linear-gradient(135deg, #0B1117 0%, #002829 100%)" : "linear-gradient(135deg, #924c00 0%, #fe9b49 100%)",
    targetRv,
    budget,
    lastAction: intentSignals[0] || apiLead.message || "Submitted a dealer inquiry on MatchRV",
    locationSignal,
    filterSummary,
    intentSignals,
    matchReportStatus,
  };
}

function normalizeStatus(status?: string | null): DealerLead["status"] {
  if (status === "contacted") return "Contacted";
  if (status === "quoted") return "Quoted";
  if (status === "appointment") return "Appointment";
  if (status === "won") return "Won";
  return "New";
}

async function loadLiveLeads(
  key: string,
  setLeads: (leads: DealerLead[]) => void,
  setLoading: (loading: boolean) => void,
  setStatus: (status: string) => void,
) {
  setLoading(true);
  setStatus("Syncing live leads...");
  try {
    const response = await fetch(`${BASE}api/admin/leads?limit=50`, { headers: { "x-admin-key": key } });
    if (!response.ok) throw new Error("Lead API unavailable");
    const data = await response.json();
    const liveLeads = (data.leads ?? []).map(mapApiLead);
    if (liveLeads.length > 0) {
      setLeads(liveLeads);
      setStatus(`Live lead feed synced: ${liveLeads.length} leads`);
    } else {
      setStatus("Live feed connected; no leads returned yet");
    }
  } catch {
    setStatus("Demo data active; live feed needs a valid key");
  } finally {
    setLoading(false);
  }
}

function relativeTime(dateValue: string) {
  const diffMs = Date.now() - new Date(dateValue).getTime();
  const hours = Math.max(1, Math.round(diffMs / 36e5));
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// ─── Lead Tier Helpers ────────────────────────────────────────────────────────

interface LeadTierInfo {
  label: string;
  price: string;
  bg: string;
  color: string;
  border: string;
  range: string;
}

function getLeadTier(score: number): LeadTierInfo {
  if (score >= 85) return { label: "Ready-to-Buy", price: "$49/lead", bg: "#0B1117", color: "#00CED1", border: "#0B1117", range: "85–98%" };
  if (score >= 65) return { label: "Qualified Lead", price: "$39/lead", bg: "#eff8f2", color: "#00643f", border: "#91d2ab", range: "65–84%" };
  if (score >= 45) return { label: "Engaged Lead", price: "$29/lead", bg: "#fff8eb", color: "#924c00", border: "#ffdcc4", range: "45–64%" };
  return { label: "Inquiry Lead", price: "$19/lead", bg: "#eef5f4", color: "#6b7a7a", border: "#E2E8F0", range: "0–44%" };
}

function LeadTierBadge({ score }: { score: number }) {
  const t = getLeadTier(score);
  return (
    <p
      className="mt-1 rounded-lg px-2 py-0.5 text-[9px] font-black uppercase tracking-wide"
      style={{ backgroundColor: t.bg, color: t.color }}
    >
      {t.label}
    </p>
  );
}

// ─── Buyer Roadmap Panel ──────────────────────────────────────────────────────

function BuyerRoadmapPanel({ score, lead }: { score: number; lead: DealerLead }) {
  const t = getLeadTier(score);
  const isReady = score >= 85;
  const isQualified = score >= 65;
  const isEngaged = score >= 45;

  const rows: { label: string; value: string }[] = [
    { label: "Journey stage", value: t.label },
    { label: "Target RV", value: lead.targetRv },
    { label: "Budget", value: lead.budget },
    ...(isEngaged ? [{ label: "Contact window", value: "Weekday evenings · responds quickly" }] : []),
    ...(isQualified ? [{ label: "Purchase timeline", value: "Within 60–90 days" }] : []),
    ...(isQualified ? [{ label: "Finance signal", value: "Pre-approval initiated" }] : []),
    ...(isReady ? [{ label: "Close window", value: "5–10 days — comparing final candidates" }] : []),
    ...(isReady ? [{ label: "Closing cue", value: "Trade-in valued · urgency present" }] : []),
  ];

  return (
    <div className="mb-6 overflow-hidden rounded-xl border" style={{ borderColor: t.border }}>
      <div className="flex items-center justify-between px-4 py-2.5" style={{ backgroundColor: t.bg }}>
        <div className="flex items-center gap-2">
          <FileText className="h-3.5 w-3.5" style={{ color: t.color }} />
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: t.color }}>
            Buyer Roadmap — {t.label}
          </span>
        </div>
        <span className="text-[10px] font-black" style={{ color: t.color }}>{t.price}</span>
      </div>
      <div className="divide-y divide-[#eef5f4] bg-white">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex items-baseline justify-between gap-4 px-4 py-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#6b7a7a]">{label}</span>
            <span className="text-xs font-semibold text-right text-[#161d1d]">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── DealerGate — Feature Gate Component ─────────────────────────────────────

const GATE_CONFIG: Record<"intelligence" | "agent", {
  title: string; price: string; description: string; features: string[];
}> = {
  intelligence: {
    title: "Inventory Intelligence",
    price: "$497/mo",
    description: "Know exactly which units are aging, surging, or undersupplied before your competition does.",
    features: [
      "Aged inventory alerts: units beyond 90, 100, and 120 days on lot",
      "Suggested price drop percentages based on local demand",
      "High-Interest Unit Tracker: saves, lead views, urgency flags",
      "Demand Gap Analysis: search volume vs your live stock",
      "AI-generated restock and pricing recommendations",
    ],
  },
  agent: {
    title: "AI Lead Agent",
    price: "$997/mo",
    description: "24/7 autonomous buyer qualification and personalized sales openers — includes Inventory Intelligence.",
    features: [
      "Automatic Readiness Score calculation (5-factor model)",
      "Lead tier classification: Inquiry → Engaged → Qualified → Ready-to-Buy",
      "AI-generated personalized sales opener per buyer",
      "24/7 autonomous follow-up and buyer qualification",
      "Recommended contact window and closing cues",
      "Includes everything in Inventory Intelligence",
    ],
  },
};

function useDealerEntitlement(required: "intelligence" | "agent", current: DealerTier): boolean {
  return TIER_RANK[current] >= TIER_RANK[required];
}

function DealerGate({
  requiredTier,
  currentTier,
  onUpgrade,
  children,
}: {
  requiredTier: "intelligence" | "agent";
  currentTier: DealerTier;
  onUpgrade: () => void;
  children: ReactNode;
}) {
  if (useDealerEntitlement(requiredTier, currentTier)) {
    return <>{children}</>;
  }

  const cfg = GATE_CONFIG[requiredTier];
  const tierLabel = requiredTier === "intelligence" ? "Tier 1" : "Tier 2";

  return (
    <div className="space-y-8">
      <PageHeader
        title={cfg.title}
        subtitle={cfg.description}
      />
      <div className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-sm">
        <div className="border-b border-[#E2E8F0] bg-[#f4fbfa] px-8 py-6">
          <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#0B1117] text-white">
                <Lock className="h-7 w-7" />
              </div>
              <div>
                <div className="mb-1 inline-flex items-center gap-2 rounded-full bg-[#ffe08b] px-3 py-1 text-xs font-black uppercase tracking-widest text-[#241a00]">
                  {tierLabel} — Upgrade Required
                </div>
                <h2 className="font-display text-2xl font-black text-[#0B1117]">{cfg.title}</h2>
                <p className="text-sm text-[#6b7a7a]">{cfg.description}</p>
              </div>
            </div>
            <div className="shrink-0 text-center sm:text-right">
              <p className="font-display text-3xl font-black text-[#0B1117]">{cfg.price}</p>
              <p className="text-sm text-[#6b7a7a]">per month</p>
            </div>
          </div>
        </div>

        <div className="px-8 py-6">
          <p className="mb-4 text-xs font-black uppercase tracking-widest text-[#6b7a7a]">What you unlock</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {cfg.features.map((feat) => (
              <div key={feat} className="flex items-start gap-3 rounded-xl border border-[#E2E8F0] bg-[#f4fbfa] px-4 py-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#00CED1]" />
                <span className="text-sm font-semibold text-[#161d1d]">{feat}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-[#E2E8F0] px-8 py-5">
          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={onUpgrade}
              className="flex items-center gap-2 rounded-xl bg-[#0B1117] px-7 py-3.5 text-sm font-black text-white shadow-lg shadow-[#0B1117]/15 transition-transform hover:scale-[0.99]"
            >
              <Zap className="h-4 w-4 text-[#00CED1]" />
              Unlock {cfg.title}
              <ChevronRight className="h-4 w-4" />
            </button>
            <p className="text-sm text-[#6b7a7a]">
              Demo mode — clicking Unlock simulates activation instantly.
            </p>
          </div>
        </div>
      </div>

      <GatedPreview tier={requiredTier} />
    </div>
  );
}

function GatedPreview({ tier }: { tier: "intelligence" | "agent" }) {
  const items =
    tier === "intelligence"
      ? [
          { label: "2023 Jayco Eagle HT 28.5RSTS", sub: "127 days on lot · suggested drop: 7%" },
          { label: "High-Interest: Grand Design Solitude 380FL", sub: "+41 saves this week · demand surge" },
          { label: "Demand Gap: Bunkhouse trailers 32–38ft", sub: "28 active searches · 4 in stock → HIGH URGENCY" },
        ]
      : [
          { label: "Marcus Thorne — Ready-to-Buy (96%)", sub: "AI opener ready · close window: 5–10 days" },
          { label: "Sarah Mitchell — Ready-to-Buy (91%)", sub: "Pre-approved · outdoor kitchen · book walkthrough" },
          { label: "AI Agent — 47 buyers qualified in last 24hrs", sub: "5 hot leads queued for immediate follow-up" },
        ];
  return (
    <div className="overflow-hidden rounded-2xl border border-[#E2E8F0]">
      <div className="flex items-center gap-2 border-b border-[#E2E8F0] bg-[#eef5f4] px-5 py-3">
        <Lock className="h-3.5 w-3.5 text-[#6b7a7a]" />
        <span className="text-xs font-black uppercase tracking-widest text-[#6b7a7a]">Preview — upgrade to access</span>
      </div>
      <div className="divide-y divide-[#E2E8F0]">
        {items.map(({ label, sub }) => (
          <div key={label} className="flex items-center gap-4 px-5 py-4 blur-[3px]" aria-hidden="true">
            <div className="h-9 w-9 shrink-0 rounded-xl bg-[#E2E8F0]" />
            <div>
              <p className="text-sm font-bold text-[#161d1d]">{label}</p>
              <p className="text-xs text-[#6b7a7a]">{sub}</p>
            </div>
            <ArrowUpRight className="ml-auto h-4 w-4 text-[#6b7a7a]" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Inventory Intelligence Section ──────────────────────────────────────────

const AGED_INVENTORY = [
  { model: "2023 Jayco Eagle HT 28.5RSTS", type: "Fifth Wheel", days: 127, list: "$62,995", suggested: "$58,500", drop: "↓7%", urgency: "high" },
  { model: "2022 Keystone Passport 239ML", type: "Travel Trailer", days: 109, list: "$29,990", suggested: "$27,500", drop: "↓8%", urgency: "high" },
  { model: "2024 Forest River Forester 3041DS", type: "Class C", days: 97, list: "$119,900", suggested: "$114,900", drop: "↓4%", urgency: "medium" },
  { model: "2021 Airstream Flying Cloud 25FB", type: "Travel Trailer", days: 91, list: "$84,500", suggested: "$80,995", drop: "↓4%", urgency: "medium" },
];

const HOT_DEMAND = [
  { model: "2025 Grand Design Solitude 380FL", type: "Fifth Wheel", saves: 41, views: 187, trend: "+41 saves this week", signal: "🔥 Demand surge" },
  { model: "2024 Winnebago Revel 44E", type: "Class B 4×4", saves: 28, views: 134, trend: "+28 saves this week", signal: "⚡ Hot segment" },
  { model: "2025 Airstream Interstate 24GL", type: "Class B", saves: 19, views: 98, trend: "+19 saves", signal: "📈 Rising interest" },
];

const DEMAND_GAPS = [
  { query: "Bunkhouse trailers 32–38ft", searches: 28, inStock: 4, gap: 24, urgency: "HIGH" },
  { query: "Class B 4×4 diesel adventure", searches: 19, inStock: 1, gap: 18, urgency: "HIGH" },
  { query: "Class A under $150k", searches: 15, inStock: 7, gap: 8, urgency: "MODERATE" },
  { query: "Toy hauler 38–42ft", searches: 12, inStock: 3, gap: 9, urgency: "MODERATE" },
];

function InventoryIntelligence() {
  const [showRestock, setShowRestock] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  return (
    <div className="space-y-8">
      <PageHeader
        title="Inventory Intelligence"
        subtitle="Real-time demand gaps, aged stock alerts, and high-interest unit tracking for your dealership."
        actions={
          <button className="flex items-center gap-2 rounded-xl bg-[#0B1117] px-5 py-3 text-sm font-bold text-white">
            <RefreshCw className="h-4 w-4" /> Refresh Data
          </button>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricPanel icon={Package} label="Units > 90 days" value={String(AGED_INVENTORY.length)} detail="2 above 100-day threshold" />
        <MetricPanel icon={TrendingDown} label="Avg suggested drop" value="5.7%" detail="Across aged inventory" />
        <MetricPanel icon={AlertTriangle} label="Demand gaps" value={String(DEMAND_GAPS.filter(g => g.urgency === "HIGH").length)} detail="High urgency gaps this week" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-sm">
        <div className="border-b border-[#E2E8F0] bg-[#f4fbfa] px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#fff1ec] text-[#9f2f12]">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-xl font-black text-[#0B1117]">Aged Inventory</h2>
              <p className="text-sm text-[#6b7a7a]">Units on lot 90+ days with AI-suggested price adjustments.</p>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-[#eef5f4] text-xs uppercase tracking-widest text-[#6b7a7a]">
              <tr>
                <th className="px-5 py-3">Unit</th>
                <th className="px-5 py-3">Days on Lot</th>
                <th className="px-5 py-3">List Price</th>
                <th className="px-5 py-3">Suggested Price</th>
                <th className="px-5 py-3">Drop</th>
                <th className="px-5 py-3">Urgency</th>
              </tr>
            </thead>
            <tbody>
              {AGED_INVENTORY.map((unit) => (
                <tr key={unit.model} className="border-t border-[#E2E8F0]">
                  <td className="px-5 py-4">
                    <p className="font-bold text-[#161d1d]">{unit.model}</p>
                    <p className="text-xs text-[#6b7a7a]">{unit.type}</p>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-black ${unit.days >= 120 ? "bg-[#fff1ec] text-[#9f2f12]" : unit.days >= 100 ? "bg-[#ffe08b] text-[#241a00]" : "bg-[#eef5f4] text-[#3b4949]"}`}>
                      {unit.days}d
                    </span>
                  </td>
                  <td className="px-5 py-4 font-semibold text-[#161d1d]">{unit.list}</td>
                  <td className="px-5 py-4 font-bold text-[#0B1117]">{unit.suggested}</td>
                  <td className="px-5 py-4">
                    <span className="font-black text-[#9f2f12]">{unit.drop}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${unit.urgency === "high" ? "bg-[#fff1ec] text-[#9f2f12]" : "bg-[#ffe08b] text-[#241a00]"}`}>
                      {unit.urgency}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-sm">
          <div className="border-b border-[#E2E8F0] bg-[#f4fbfa] px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e0f9f7]">
                <TrendingUp className="h-5 w-5 text-[#0B1117]" />
              </div>
              <div>
                <h2 className="font-display text-xl font-black text-[#0B1117]">High-Interest Units</h2>
                <p className="text-sm text-[#6b7a7a]">Surge in saves, lead views, and buyer activity.</p>
              </div>
            </div>
          </div>
          <div className="divide-y divide-[#E2E8F0]">
            {HOT_DEMAND.map((unit) => (
              <div key={unit.model} className="flex items-start gap-4 px-5 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f4fbfa] text-sm">
                  🔥
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[#161d1d]">{unit.model}</p>
                  <p className="text-xs text-[#6b7a7a]">{unit.type}</p>
                  <p className="mt-1 text-xs font-semibold text-[#924c00]">{unit.trend}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-black text-[#161d1d]">{unit.views} views</p>
                  <p className="mt-0.5 text-[10px] font-bold text-[#6b7a7a]">{unit.signal}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-sm">
          <div className="border-b border-[#E2E8F0] bg-[#f4fbfa] px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#fff8eb]">
                <AlertTriangle className="h-5 w-5 text-[#924c00]" />
              </div>
              <div>
                <h2 className="font-display text-xl font-black text-[#0B1117]">Demand Gap Analysis</h2>
                <p className="text-sm text-[#6b7a7a]">Active search volume vs your live stock levels.</p>
              </div>
            </div>
          </div>
          <div className="divide-y divide-[#E2E8F0]">
            {DEMAND_GAPS.map((gap) => (
              <div key={gap.query} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-[#161d1d]">{gap.query}</p>
                    <p className="mt-1 text-xs text-[#6b7a7a]">{gap.searches} active searches · {gap.inStock} units in stock</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${gap.urgency === "HIGH" ? "bg-[#fff1ec] text-[#9f2f12]" : "bg-[#ffe08b] text-[#241a00]"}`}>
                    {gap.urgency}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex-1 overflow-hidden rounded-full bg-[#eef5f4] h-2">
                    <div
                      className="h-full rounded-full bg-[#9f2f12]"
                      style={{ width: `${Math.min(100, (gap.gap / gap.searches) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-black text-[#9f2f12]">+{gap.gap} unfulfilled</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-[#0B1117] p-8 text-white">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15">
            <Sparkles className="h-5 w-5 text-[#00CED1]" />
          </div>
          <div className="flex-1">
            <h3 className="font-display text-xl font-black">AI Inventory Recommendation</h3>
            <p className="mt-2 text-white/70">
              Based on your current demand gaps and aged inventory, consider acquiring{" "}
              <span className="font-bold text-white">2 bunkhouse trailers in the 34–38ft range</span> and{" "}
              <span className="font-bold text-white">1 Class B 4×4 unit</span>. These segments show sustained search volume with &lt;30% stock fulfillment in your region.
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <button onClick={() => setShowRestock(true)} className="rounded-xl bg-white px-6 py-3 text-sm font-bold text-[#0B1117] hover:bg-[#e0f9f7] transition-colors">Generate Restock Report</button>
          <button onClick={() => setShowAnalysis(true)} className="rounded-xl border border-white/20 px-6 py-3 text-sm font-bold text-white hover:bg-white/10 transition-colors">View Full Analysis</button>
        </div>
      </div>

      {/* ── Restock Report Modal ─────────────────────────────────────────── */}
      {showRestock && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50" onClick={() => setShowRestock(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="bg-[#0B1117] text-white px-7 py-5 rounded-t-2xl flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[#00CED1] mb-1">MatchRV Intelligence</p>
                <h2 className="font-display text-xl font-black">Restock Recommendation Report</h2>
                <p className="text-white/50 text-xs mt-1">Generated {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} · Evergreen RV Center</p>
              </div>
              <button onClick={() => setShowRestock(false)} className="p-1.5 hover:bg-white/10 rounded-lg mt-0.5 flex-shrink-0">
                <X className="w-4 h-4 text-white/70" />
              </button>
            </div>
            <div className="p-7 space-y-6">
              <div className="bg-[#f4fbfa] rounded-xl p-5 border border-[#E2E8F0]">
                <h3 className="font-black text-[#0B1117] mb-2 text-sm">Executive Summary</h3>
                <p className="text-sm text-[#3b4949] leading-relaxed">
                  Analysis of current demand patterns and live inventory reveals {DEMAND_GAPS.filter(g => g.urgency === "HIGH").length} high-priority acquisition opportunities. Your lot has {AGED_INVENTORY.length} units aged 90+ days requiring price intervention, and {DEMAND_GAPS.filter(g => g.urgency === "HIGH").length} active demand segments with &lt;10% stock fulfillment.
                </p>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-[#6b7a7a] mb-3">Priority Acquisitions</p>
                <div className="space-y-3">
                  {DEMAND_GAPS.filter(g => g.urgency === "HIGH").map((gap, i) => (
                    <div key={gap.query} className="flex items-start gap-4 p-4 rounded-xl border border-[#E2E8F0] bg-white">
                      <div className="w-7 h-7 rounded-full bg-[#0B1117] text-[#00CED1] flex items-center justify-center text-xs font-black flex-shrink-0">{i + 1}</div>
                      <div className="flex-1">
                        <p className="font-bold text-[#161d1d] text-sm">{gap.query}</p>
                        <p className="text-xs text-[#6b7a7a] mt-0.5">{gap.searches} active buyer searches · {gap.inStock} in stock · {gap.gap} unfulfilled</p>
                        <p className="text-xs font-semibold text-[#00CED1] mt-1.5">→ Acquire 2–3 units to capture this demand segment</p>
                      </div>
                      <span className="bg-[#fff1ec] text-[#9f2f12] text-[9px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full flex-shrink-0">High</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-[#6b7a7a] mb-3">Aged Inventory — Price Intervention</p>
                <div className="rounded-xl border border-[#E2E8F0] overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-[#eef5f4] text-xs uppercase tracking-widest text-[#6b7a7a]">
                      <tr>
                        <th className="px-4 py-3 text-left">Unit</th>
                        <th className="px-4 py-3 text-left">Days</th>
                        <th className="px-4 py-3 text-left">Current</th>
                        <th className="px-4 py-3 text-left">Suggested</th>
                        <th className="px-4 py-3 text-left">Drop</th>
                      </tr>
                    </thead>
                    <tbody>
                      {AGED_INVENTORY.map((unit, i) => (
                        <tr key={unit.model} className={i > 0 ? "border-t border-[#E2E8F0]" : ""}>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-[#161d1d] text-xs">{unit.model.split(" ").slice(0, 3).join(" ")}</p>
                            <p className="text-[10px] text-[#6b7a7a]">{unit.type}</p>
                          </td>
                          <td className="px-4 py-3 text-xs text-[#6b7a7a]">{unit.days}d</td>
                          <td className="px-4 py-3 text-xs text-[#6b7a7a] line-through">{unit.list}</td>
                          <td className="px-4 py-3 text-xs font-bold text-[#0B1117]">{unit.suggested}</td>
                          <td className="px-4 py-3 text-xs font-black text-[#9f2f12]">{unit.drop}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="bg-[#0B1117] rounded-xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-4 w-4 text-[#00CED1]" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#00CED1]">AI Recommendation</p>
                </div>
                <p className="text-sm text-white/80 leading-relaxed">
                  Prioritize acquiring <span className="text-white font-bold">2 bunkhouse trailers (34–38ft)</span> and <span className="text-white font-bold">1 Class B 4×4 diesel unit</span> within the next 30 days. These two segments represent 42 active unfulfilled buyer searches. At current lead pricing, converting 30% yields an estimated <span className="text-[#00CED1] font-bold">$3,800–$5,200</span> in incremental lead revenue.
                </p>
              </div>
            </div>
            <div className="px-7 py-5 border-t border-[#E2E8F0] flex items-center justify-between gap-4">
              <p className="text-xs text-[#6b7a7a]">MatchRV Intelligence · Confidential dealer report</p>
              <div className="flex gap-3">
                <button onClick={() => setShowRestock(false)} className="px-5 py-2.5 rounded-xl border border-[#E2E8F0] text-sm font-bold text-[#6b7a7a] hover:bg-[#f4fbfa] transition-colors">Close</button>
                <button onClick={() => window.print()} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0B1117] text-white text-sm font-bold hover:bg-[#002829] transition-colors">
                  <FileText className="w-4 h-4" /> Save / Print
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Full Analysis Modal ──────────────────────────────────────────── */}
      {showAnalysis && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50" onClick={() => setShowAnalysis(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="bg-[#0B1117] text-white px-7 py-5 rounded-t-2xl flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[#00CED1] mb-1">MatchRV Intelligence</p>
                <h2 className="font-display text-xl font-black">Full Inventory Analysis</h2>
                <p className="text-white/50 text-xs mt-1">Live data snapshot · {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
              </div>
              <button onClick={() => setShowAnalysis(false)} className="p-1.5 hover:bg-white/10 rounded-lg mt-0.5 flex-shrink-0">
                <X className="w-4 h-4 text-white/70" />
              </button>
            </div>
            <div className="p-7 space-y-7">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-[#6b7a7a] mb-3">Demand Gap Analysis — All Segments</p>
                <div className="rounded-xl border border-[#E2E8F0] overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-[#eef5f4] text-xs uppercase tracking-widest text-[#6b7a7a]">
                      <tr>
                        <th className="px-4 py-3 text-left">Buyer Search</th>
                        <th className="px-4 py-3 text-left">Searches</th>
                        <th className="px-4 py-3 text-left">In Stock</th>
                        <th className="px-4 py-3 text-left">Unfulfilled</th>
                        <th className="px-4 py-3 text-left">Fulfillment</th>
                        <th className="px-4 py-3 text-left">Priority</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DEMAND_GAPS.map((gap, i) => (
                        <tr key={gap.query} className={i > 0 ? "border-t border-[#E2E8F0]" : ""}>
                          <td className="px-4 py-3 font-semibold text-[#161d1d] text-xs">{gap.query}</td>
                          <td className="px-4 py-3 text-xs text-[#6b7a7a]">{gap.searches}</td>
                          <td className="px-4 py-3 text-xs text-[#6b7a7a]">{gap.inStock}</td>
                          <td className="px-4 py-3 text-xs font-black text-[#9f2f12]">+{gap.gap}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 rounded-full bg-[#eef5f4] overflow-hidden">
                                <div className="h-full rounded-full bg-[#9f2f12]" style={{ width: `${Math.round((gap.inStock / gap.searches) * 100)}%` }} />
                              </div>
                              <span className="text-[10px] text-[#6b7a7a]">{Math.round((gap.inStock / gap.searches) * 100)}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-[9px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full ${gap.urgency === "HIGH" ? "bg-[#fff1ec] text-[#9f2f12]" : "bg-[#ffe08b] text-[#241a00]"}`}>{gap.urgency}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-[#6b7a7a] mb-3">High-Interest Units — Buyer Signals</p>
                <div className="space-y-3">
                  {HOT_DEMAND.map((unit) => (
                    <div key={unit.model} className="flex items-start gap-4 p-4 rounded-xl border border-[#E2E8F0] bg-[#f4fbfa]">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0B1117] text-lg">🔥</div>
                      <div className="flex-1">
                        <p className="font-bold text-[#161d1d] text-sm">{unit.model}</p>
                        <p className="text-xs text-[#6b7a7a]">{unit.type}</p>
                        <p className="mt-1.5 text-xs font-semibold text-[#924c00]">{unit.trend}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-black text-[#161d1d]">{unit.saves} saves</p>
                        <p className="text-xs text-[#6b7a7a]">{unit.views} views</p>
                        <p className="mt-1 text-[10px] font-bold text-[#00CED1]">Hold / price at list</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-[#6b7a7a] mb-3">Aged Inventory — Full Detail</p>
                <div className="space-y-3">
                  {AGED_INVENTORY.map((unit) => (
                    <div key={unit.model} className="p-4 rounded-xl border border-[#E2E8F0] bg-white">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <p className="font-bold text-[#161d1d] text-sm">{unit.model}</p>
                          <p className="text-xs text-[#6b7a7a]">{unit.type}</p>
                        </div>
                        <span className={`text-[9px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full flex-shrink-0 ${unit.urgency === "high" ? "bg-[#fff1ec] text-[#9f2f12]" : "bg-[#ffe08b] text-[#241a00]"}`}>{unit.days}d on lot</span>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-xs">
                        <div className="bg-[#f4fbfa] rounded-lg p-2.5">
                          <p className="text-[#6b7a7a] mb-0.5">List Price</p>
                          <p className="font-bold text-[#161d1d]">{unit.list}</p>
                        </div>
                        <div className="bg-[#f4fbfa] rounded-lg p-2.5">
                          <p className="text-[#6b7a7a] mb-0.5">Suggested</p>
                          <p className="font-bold text-[#0B1117]">{unit.suggested}</p>
                        </div>
                        <div className="bg-[#fff1ec] rounded-lg p-2.5">
                          <p className="text-[#9f2f12] mb-0.5">Reduction</p>
                          <p className="font-black text-[#9f2f12]">{unit.drop}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-7 py-5 border-t border-[#E2E8F0] flex items-center justify-between gap-4">
              <p className="text-xs text-[#6b7a7a]">MatchRV Intelligence · Live data</p>
              <button onClick={() => setShowAnalysis(false)} className="px-5 py-2.5 rounded-xl bg-[#0B1117] text-white text-sm font-bold hover:bg-[#002829] transition-colors">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AI Lead Agent Section ────────────────────────────────────────────────────

const READINESS_FACTORS = [
  { label: "Listing Activity", pct: 30, desc: "Views, time on listing, repeat visits, photo engagement, comparison behavior", color: "#0B1117", bg: "#00CED1" },
  { label: "Save / Shortlist", pct: 25, desc: "Unit saved to watchlist, search saved, price alert set — demonstrated purchase intent", color: "#0B1117", bg: "#e0f9f7" },
  { label: "Financial Intent", pct: 20, desc: "Financing calculator used, trade-in tool started, payment type stated as financed", color: "#924c00", bg: "#ffdcc4" },
  { label: "Behavioral Velocity", pct: 15, desc: "Sessions per week, recency of last visit, depth of latest session, returning-visitor flag", color: "#6b5200", bg: "#ffe08b" },
  { label: "AI Pattern Matching", pct: 10, desc: "Match Report score correlation, AI Outfitter completion, tow-fit check, multi-unit shortlist", color: "#3b4949", bg: "#E2E8F0" },
];

const LEAD_TIER_CARDS = [
  { tier: "Ready-to-Buy", range: "85–98%", price: "$495", urgency: "< 15 min follow-up", desc: "Completed Match Report, pre-approved, comparing final candidates. Highest close probability.", color: "#0B1117", badge: "#00CED1", badgeText: "#0B1117" },
  { tier: "Qualified Lead", range: "65–84%", price: "$295", urgency: "Same-day follow-up", desc: "Specific RV in mind, budget confirmed, financing started. Ready within 60–90 days.", color: "#0B1117", badge: "#e0f9f7", badgeText: "#004f53" },
  { tier: "Engaged Lead", range: "45–64%", price: "$195", urgency: "Within 48 hours", desc: "Actively narrowing options, used filters, saved searches. Responds to personalized outreach.", color: "#924c00", badge: "#ffdcc4", badgeText: "#6f3800" },
  { tier: "Inquiry Lead", range: "0–44%", price: "$49", urgency: "Nurture sequence", desc: "Early research phase, browsing broadly. Warm them with content and check-in emails.", color: "#6b7a7a", badge: "#E2E8F0", badgeText: "#3b4949" },
];

function AiLeadAgent({ leads }: { leads: DealerLead[] }) {
  const hotLead = leads.find((l) => l.readinessScore >= 85) ?? leads[0];
  const openerUnit = hotLead?.targetRv ?? "Class A Diesel Pusher";
  const openerName = hotLead?.name?.split(" ")[0] ?? "Marcus";
  const openerScore = hotLead?.readinessScore ?? 96;

  return (
    <div className="space-y-8">
      <PageHeader
        title="AI Lead Agent"
        subtitle="24/7 autonomous buyer qualification, readiness scoring, and personalized sales openers."
        actions={
          <div className="flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm shadow-sm">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00643f] opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#00643f]" />
            </span>
            <span className="font-bold text-[#161d1d]">Agent Active</span>
            <span className="text-[#6b7a7a]">— qualifying 47 buyers</span>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <MetricPanel icon={Bot} label="Buyers qualified" value="47" detail="In the last 24 hours" />
        <MetricPanel icon={Zap} label="Hot leads queued" value="5" detail="< 15 min follow-up window" />
        <MetricPanel icon={Clock} label="Avg qualification" value="3.2 min" detail="Per buyer, fully automated" />
        <MetricPanel icon={TrendingUp} label="Conversion lift" value="+34%" detail="vs unscored lead lists" />
      </div>

      <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0B1117] text-white">
            <Gauge className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-xl font-black text-[#0B1117]">Readiness Score — 5-Factor Model</h2>
            <p className="text-sm text-[#6b7a7a]">Every buyer is scored 0–100 in real time using first-party behavioral signals.</p>
          </div>
        </div>
        <div className="space-y-5">
          {READINESS_FACTORS.map((f) => (
            <div key={f.label}>
              <div className="mb-1.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: f.color }} />
                  <span className="text-sm font-black text-[#161d1d]">{f.label}</span>
                </div>
                <span className="rounded-full px-3 py-0.5 text-xs font-black" style={{ backgroundColor: f.bg, color: f.color }}>{f.pct}%</span>
              </div>
              <div className="mb-1 h-2.5 overflow-hidden rounded-full bg-[#eef5f4]">
                <div className="h-full rounded-full transition-all" style={{ width: `${f.pct}%`, backgroundColor: f.color }} />
              </div>
              <p className="text-xs text-[#6b7a7a]">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {LEAD_TIER_CARDS.map((card) => (
          <div key={card.tier} className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-sm">
            <div className="px-5 py-4" style={{ backgroundColor: card.color }}>
              <div className="mb-2 flex items-center justify-between">
                <span className="rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wide" style={{ backgroundColor: card.badge, color: card.badgeText }}>
                  {card.range}
                </span>
                <span className="text-[10px] font-black text-white/70">{card.urgency}</span>
              </div>
              <p className="font-display text-xl font-black text-white">{card.tier}</p>
              <p className="text-lg font-black text-[#00CED1]">{card.price}<span className="text-xs font-semibold text-white/60">/lead</span></p>
            </div>
            <div className="px-5 py-4">
              <p className="text-xs text-[#6b7a7a] leading-relaxed">{card.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#0B1117] bg-[#0B1117] shadow-lg">
        <div className="border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-3">
            <Bot className="h-5 w-5 text-[#00CED1]" />
            <span className="text-sm font-black uppercase tracking-widest text-[#00CED1]">AI-Generated Sales Opener</span>
            <span className="ml-auto rounded-full bg-[#00CED1] px-3 py-0.5 text-[10px] font-black text-[#0B1117]">
              {openerScore}% Ready-to-Buy
            </span>
          </div>
        </div>
        <div className="px-6 py-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-[#91d2ab]">Recommended opener for {hotLead?.name ?? "top lead"}</p>
          <p className="font-display text-lg leading-relaxed text-white">
            "{openerName}, I noticed you've been comparing{" "}
            <span className="text-[#00CED1]">{openerUnit}s</span> — we have a unit that matches your{" "}
            <span className="text-[#00CED1]">
              {hotLead?.filterSummary ?? "preferences"}
            </span>{" "}
            spec for spec. Your readiness score of{" "}
            <span className="text-[#ffe08b] font-black">{openerScore}%</span> puts you at the top of our queue. Want to come in this week for a walkthrough — I'll have it prepped and ready."
          </p>
        </div>
        <div className="border-t border-white/10 flex flex-wrap gap-3 px-6 py-4">
          <button className="flex items-center gap-2 rounded-xl bg-[#00CED1] px-5 py-2.5 text-sm font-black text-[#0B1117]">
            <MessageSquare className="h-4 w-4" /> Send this opener
          </button>
          <button className="flex items-center gap-2 rounded-xl border border-white/20 px-5 py-2.5 text-sm font-bold text-white">
            <RefreshCw className="h-4 w-4" /> Regenerate
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Upgrade Modal ────────────────────────────────────────────────────────────

function UpgradeModal({
  target,
  currentTier,
  onConfirm,
  onClose,
}: {
  target: DealerTier;
  currentTier: DealerTier;
  onConfirm: (tier: DealerTier) => void;
  onClose: () => void;
}) {
  const allUpgradeOptions: { tier: DealerTier; name: string; price: string; desc: string; features: string[]; highlight?: boolean }[] = [
    {
      tier: "intelligence",
      name: "Inventory Intelligence",
      price: "$497/mo",
      desc: "Aged inventory alerts, demand gaps, hot unit tracking.",
      features: ["Aged inventory with suggested price drops", "High-Interest Unit Tracker", "Demand Gap Analysis", "AI restock recommendations"],
    },
    {
      tier: "agent",
      name: "AI Agent Bundle",
      price: "$997/mo",
      desc: "24/7 autonomous qualification + all Intelligence features.",
      features: ["Everything in Intelligence", "5-factor Readiness Score", "Lead tier classification + pricing", "AI-generated sales openers", "24/7 buyer qualification"],
      highlight: true,
    },
  ];
  const upgradeOptions = allUpgradeOptions.filter((opt) => TIER_RANK[opt.tier] > TIER_RANK[currentTier] || opt.tier === target);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-[#0B1117]/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-[#E2E8F0] px-6 py-5">
          <div>
            <h2 className="font-display text-2xl font-black text-[#0B1117]">Unlock More Features</h2>
            <p className="mt-1 text-sm text-[#6b7a7a]">Choose a plan to activate additional portal capabilities.</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-[#6b7a7a] hover:bg-[#eef5f4]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-4 p-6 sm:grid-cols-2">
          {upgradeOptions.map((opt) => (
            <div
              key={opt.tier}
              className={`overflow-hidden rounded-2xl border-2 ${opt.highlight ? "border-[#0B1117]" : "border-[#E2E8F0]"}`}
            >
              {opt.highlight && (
                <div className="bg-[#0B1117] py-1.5 text-center text-[10px] font-black uppercase tracking-widest text-[#00CED1]">
                  Most Popular
                </div>
              )}
              <div className="p-5">
                <p className="font-display text-xl font-black text-[#0B1117]">{opt.name}</p>
                <p className="mt-0.5 text-2xl font-black text-[#0B1117]">{opt.price}</p>
                <p className="mt-2 text-xs text-[#6b7a7a]">{opt.desc}</p>
                <ul className="mt-4 space-y-2">
                  {opt.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-[#161d1d]">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#00CED1]" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => onConfirm(opt.tier)}
                  className={`mt-5 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-black transition-all hover:scale-[0.99] ${
                    opt.highlight
                      ? "bg-[#0B1117] text-white shadow-lg shadow-[#0B1117]/20"
                      : "bg-[#eef5f4] text-[#161d1d] hover:bg-[#E2E8F0]"
                  }`}
                >
                  <Zap className={`h-4 w-4 ${opt.highlight ? "text-[#00CED1]" : ""}`} />
                  Activate {opt.name}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-[#E2E8F0] bg-[#f4fbfa] px-6 py-4">
          <p className="text-xs text-[#6b7a7a]">
            <span className="font-bold text-[#0B1117]">Demo mode:</span> clicking Activate instantly upgrades your session tier — no payment required. In production, this triggers a Stripe checkout.
          </p>
        </div>
      </div>
    </div>
  );
}
