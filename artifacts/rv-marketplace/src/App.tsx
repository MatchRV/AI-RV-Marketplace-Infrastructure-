import { lazy, Suspense, useEffect, useRef } from "react";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { trackPageView, detectReturnVisit } from "@/lib/analytics";
import { recordBuyerIntent, recordPageViewIntent } from "@/lib/buyer-intent";
import { ClerkProvider, SignIn, SignUp, useClerk } from "@clerk/react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { AuthProvider } from "@/contexts/auth-context";
import { DealerHome, VisibilityReport } from "@/pages/dealer-home";
import { registerMatchrvTools } from "@/agent/webmcp";
import { registerNavigate } from "@/agent/session";

// Route-level code splitting: the dealer homepage stays in the entry chunk
// (it is the main landing page); every other page loads on demand so the
// first mobile paint is not blocked by the whole app's JavaScript.
const BookReportCall = lazy(() => import("@/pages/book").then(m => ({ default: m.BookReportCall })));
const Browse = lazy(() => import("@/pages/browse").then(m => ({ default: m.Browse })));
const McpSetup = lazy(() => import("@/pages/mcp-setup").then(m => ({ default: m.McpSetup })));
const DealerAdvertising = lazy(() => import("@/pages/dealer-advertising").then(m => ({ default: m.DealerAdvertising })));
const Shop = lazy(() => import("@/pages/shop").then(m => ({ default: m.Shop })));
const ListingDetail = lazy(() => import("@/pages/listing-detail").then(m => ({ default: m.ListingDetail })));
const Outfitter = lazy(() => import("@/pages/outfitter").then(m => ({ default: m.Outfitter })));
const Match = lazy(() => import("@/pages/match").then(m => ({ default: m.Match })));
const MatchReport = lazy(() => import("@/pages/match-report").then(m => ({ default: m.MatchReport })));
const Admin = lazy(() => import("@/pages/admin").then(m => ({ default: m.Admin })));
const Account = lazy(() => import("@/pages/account").then(m => ({ default: m.Account })));
const Saved = lazy(() => import("@/pages/saved").then(m => ({ default: m.Saved })));
const Searches = lazy(() => import("@/pages/searches").then(m => ({ default: m.Searches })));
const Alerts = lazy(() => import("@/pages/alerts").then(m => ({ default: m.Alerts })));
const Messages = lazy(() => import("@/pages/messages").then(m => ({ default: m.Messages })));
const Finance = lazy(() => import("@/pages/finance").then(m => ({ default: m.Finance })));
const Sell = lazy(() => import("@/pages/sell").then(m => ({ default: m.Sell })));
const TowGuide = lazy(() => import("@/pages/tow-guide").then(m => ({ default: m.TowGuide })));
const About = lazy(() => import("@/pages/about").then(m => ({ default: m.About })));
const Terms = lazy(() => import("@/pages/terms").then(m => ({ default: m.Terms })));
const Privacy = lazy(() => import("@/pages/privacy").then(m => ({ default: m.Privacy })));
const DealerLogin = lazy(() => import("@/pages/dealer-login").then(m => ({ default: m.DealerLogin })));
const ForDealers = lazy(() => import("@/pages/for-dealers").then(m => ({ default: m.ForDealers })));
const ChatGPTAdvertising = lazy(() => import("@/pages/chatgpt-advertising").then(m => ({ default: m.ChatGPTAdvertising })));
const AnswerEngine = lazy(() => import("@/pages/answer-engine").then(m => ({ default: m.AnswerEngine })));
const DealerAeoToolkit = lazy(() => import("@/pages/dealer-aeo-toolkit").then(m => ({ default: m.DealerAeoToolkit })));
const DealerVisibilityDashboard = lazy(() => import("@/pages/dealer-visibility-dashboard").then(m => ({ default: m.DealerVisibilityDashboard })));
const Dealers = lazy(() => import("@/pages/dealers").then(m => ({ default: m.Dealers })));
const Discover = lazy(() => import("@/pages/discover").then(m => ({ default: m.Discover })));
const Contact = lazy(() => import("@/pages/contact").then(m => ({ default: m.Contact })));
const Campgrounds = lazy(() => import("@/pages/campgrounds").then(m => ({ default: m.Campgrounds })));
const Trips = lazy(() => import("@/pages/trips").then(m => ({ default: m.Trips })));
const TripDetail = lazy(() => import("@/pages/trip-detail").then(m => ({ default: m.TripDetail })));
const ARDriveway = lazy(() => import("@/pages/ar-driveway").then(m => ({ default: m.ARDriveway })));
const RvsForSale = lazy(() => import("@/pages/rvs-for-sale").then(m => ({ default: m.RvsForSale })));
const TravelTrailersForSale = lazy(() => import("@/pages/travel-trailers-for-sale").then(m => ({ default: m.TravelTrailersForSale })));
const FifthWheelsForSale = lazy(() => import("@/pages/fifth-wheels-for-sale").then(m => ({ default: m.FifthWheelsForSale })));
const ClassARvsForSale = lazy(() => import("@/pages/class-a-rvs-for-sale").then(m => ({ default: m.ClassARvsForSale })));
const ClassBRvsForSale = lazy(() => import("@/pages/class-b-rvs-for-sale").then(m => ({ default: m.ClassBRvsForSale })));
const ClassCRvsForSale = lazy(() => import("@/pages/class-c-rvs-for-sale").then(m => ({ default: m.ClassCRvsForSale })));
const ToyHaulersForSale = lazy(() => import("@/pages/toy-haulers-for-sale").then(m => ({ default: m.ToyHaulersForSale })));
const RvDealers = lazy(() => import("@/pages/rv-dealers").then(m => ({ default: m.RvDealers })));
const FindTheRightRvForYourTowVehicle = lazy(() => import("@/pages/find-the-right-rv-for-your-tow-vehicle").then(m => ({ default: m.FindTheRightRvForYourTowVehicle })));
const GuidesIndex = lazy(() => import("@/pages/guides/index").then(m => ({ default: m.GuidesIndex })));
const HowToBuyAUsedRv = lazy(() => import("@/pages/guides/how-to-buy-a-used-rv").then(m => ({ default: m.HowToBuyAUsedRv })));
const BestRvsForFamilies = lazy(() => import("@/pages/guides/best-rvs-for-families").then(m => ({ default: m.BestRvsForFamilies })));
const BestRvsForFullTimeLiving = lazy(() => import("@/pages/guides/best-rvs-for-full-time-living").then(m => ({ default: m.BestRvsForFullTimeLiving })));
const MotorhomeVsTravelTrailer = lazy(() => import("@/pages/guides/motorhome-vs-travel-trailer").then(m => ({ default: m.MotorhomeVsTravelTrailer })));
const RvFinancingGuide = lazy(() => import("@/pages/guides/rv-financing-guide").then(m => ({ default: m.RvFinancingGuide })));
const TowingGuide = lazy(() => import("@/pages/guides/towing-guide").then(m => ({ default: m.TowingGuide })));
const TowVehicleGuide = lazy(() => import("@/pages/guides/tow-vehicle-guide").then(m => ({ default: m.TowVehicleGuide })));
const TravelTrailerVsFifthWheel = lazy(() => import("@/pages/guides/travel-trailer-vs-fifth-wheel").then(m => ({ default: m.TravelTrailerVsFifthWheel })));
const RvCostGuide = lazy(() => import("@/pages/guides/rv-cost-guide").then(m => ({ default: m.RvCostGuide })));
const RvFinancing = lazy(() => import("@/pages/rv-financing/index").then(m => ({ default: m.RvFinancing })));
const CreditScoreToBuyRv = lazy(() => import("@/pages/rv-financing/what-credit-score-do-you-need-to-buy-an-rv").then(m => ({ default: m.CreditScoreToBuyRv })));
const BadCreditRvFinancing = lazy(() => import("@/pages/rv-financing/bad-credit-rv-financing").then(m => ({ default: m.BadCreditRvFinancing })));
const RvLoanCalculator = lazy(() => import("@/pages/rv-financing/rv-loan-calculator").then(m => ({ default: m.RvLoanCalculator })));
const FindRvsByMonthlyPayment = lazy(() => import("@/pages/rv-financing/find-rvs-by-monthly-payment").then(m => ({ default: m.FindRvsByMonthlyPayment })));
const RvPreApproval = lazy(() => import("@/pages/rv-financing/rv-pre-approval-before-shopping").then(m => ({ default: m.RvPreApproval })));
const UsedRvFinancing = lazy(() => import("@/pages/rv-financing/used-rv-financing").then(m => ({ default: m.UsedRvFinancing })));
const NotFound = lazy(() => import("@/pages/not-found"));

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const isClerkConfigured =
  typeof clerkPubKey === "string" &&
  /^pk_(test|live)_/.test(clerkPubKey) &&
  !clerkPubKey.includes("placeholder");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
      retry: false,
    },
  },
});

function SignInPage() {
  if (!isClerkConfigured) {
    return <Redirect to="/match" replace />;
  }

  // To update login providers, app branding, or OAuth settings use the Auth
  // pane in the workspace toolbar. More information can be found in the Replit docs.
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f4fbfa]">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  if (!isClerkConfigured) {
    return <Redirect to="/match" replace />;
  }

  // To update login providers, app branding, or OAuth settings use the Auth
  // pane in the workspace toolbar. More information can be found in the Replit docs.
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f4fbfa]">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function PageViewTracker() {
  const [location] = useLocation();
  useEffect(() => {
    trackPageView(location, document.title);
    recordPageViewIntent(location, document.title);
  }, [location]);
  return null;
}

function ReturnVisitDetector() {
  useEffect(() => {
    if (detectReturnVisit()) recordBuyerIntent("return_visit", { sendAnalytics: false });
  }, []);
  return null;
}

/**
 * Registers MatchRV's WebMCP tools at the top level of the page (required by
 * ChatGPT's in-app browser — tools must live in top-level page JS) and gives
 * tool handlers a way to navigate the SPA.
 */
function AgentBridge() {
  const [, navigate] = useLocation();
  useEffect(() => {
    registerNavigate(navigate);
  }, [navigate]);
  useEffect(() => {
    registerMatchrvTools();
  }, []);
  return null;
}

function AppRouter() {
  return (
    <>
      <PageViewTracker />
      <ReturnVisitDetector />
      <AgentBridge />
      <Suspense fallback={<div className="min-h-screen" aria-busy="true" />}>
      <Switch>
      <Route path="/" component={DealerHome} />
      <Route path="/visibility-report" component={VisibilityReport} />
      <Route path="/book" component={BookReportCall} />
      <Route path="/shop" component={Shop} />
      <Route path="/advertising" component={DealerAdvertising} />
      <Route path="/mcp-setup" component={McpSetup} />
      <Route path="/answers" component={AnswerEngine} />
      <Route path="/browse/:slug?" component={Browse} />
      <Route path="/listing/:id" component={ListingDetail} />
      <Route path="/outfitter" component={Outfitter} />
      <Route path="/match" component={Match} />
      <Route path="/match-report" component={MatchReport} />
      <Route path="/admin" component={Admin} />
      <Route path="/account" component={Account} />
      <Route path="/saved" component={Saved} />
      <Route path="/searches" component={Searches} />
      <Route path="/alerts" component={Alerts} />
      <Route path="/messages" component={Messages} />
      <Route path="/finance" component={Finance} />
      <Route path="/sell" component={Sell} />
      <Route path="/tow-guide" component={TowGuide} />
      <Route path="/about" component={About} />
      <Route path="/terms" component={Terms} />
      <Route path="/terms-and-conditions">{() => <Redirect to="/terms" replace />}</Route>
      <Route path="/tow-match">{() => <Redirect to="/tow-guide" replace />}</Route>
      <Route path="/buyer-guides">{() => <Redirect to="/guides" replace />}</Route>
      <Route path="/privacy" component={Privacy} />
      <Route path="/for-dealers" component={ForDealers} />
      <Route path="/dealers/chatgpt-advertising" component={ChatGPTAdvertising} />
      <Route path="/dealer-tools" component={DealerAeoToolkit} />
      <Route path="/dealer-visibility" component={DealerVisibilityDashboard} />
      <Route path="/dealers/ai">{() => <Redirect to="/for-dealers" replace />}</Route>
      <Route path="/dealers/login" component={DealerLogin} />
      <Route path="/dealer-login">{() => <Redirect to="/dealers/login" replace />}</Route>
      <Route path="/dealers" component={Dealers} />
      <Route path="/discover" component={Discover} />
      <Route path="/contact" component={Contact} />
      <Route path="/campgrounds" component={Campgrounds} />
      <Route path="/pricing">{() => <Redirect to="/campgrounds" replace />}</Route>
      <Route path="/trips" component={Trips} />
      <Route path="/trips/:id" component={TripDetail} />
      <Route path="/ar" component={ARDriveway} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/rvs-for-sale" component={RvsForSale} />
      <Route path="/travel-trailers-for-sale" component={TravelTrailersForSale} />
      <Route path="/fifth-wheels-for-sale" component={FifthWheelsForSale} />
      <Route path="/class-a-rvs-for-sale" component={ClassARvsForSale} />
      <Route path="/class-b-rvs-for-sale" component={ClassBRvsForSale} />
      <Route path="/class-c-rvs-for-sale" component={ClassCRvsForSale} />
      <Route path="/toy-haulers-for-sale" component={ToyHaulersForSale} />
      <Route path="/rv-dealers" component={RvDealers} />
      <Route path="/find-the-right-rv-for-your-tow-vehicle" component={FindTheRightRvForYourTowVehicle} />
      <Route path="/guides" component={GuidesIndex} />
      <Route path="/guides/how-to-buy-a-used-rv" component={HowToBuyAUsedRv} />
      <Route path="/guides/best-rvs-for-families" component={BestRvsForFamilies} />
      <Route path="/guides/best-rvs-for-full-time-living" component={BestRvsForFullTimeLiving} />
      <Route path="/guides/motorhome-vs-travel-trailer" component={MotorhomeVsTravelTrailer} />
      <Route path="/guides/rv-financing-guide" component={RvFinancingGuide} />
      <Route path="/guides/towing-guide" component={TowingGuide} />
      <Route path="/guides/tow-vehicle-guide" component={TowVehicleGuide} />
      <Route path="/guides/travel-trailer-vs-fifth-wheel" component={TravelTrailerVsFifthWheel} />
      <Route path="/guides/rv-cost-guide" component={RvCostGuide} />

      {/* RV Financing SEO/LLM content hub */}
      <Route path="/rv-financing" component={RvFinancing} />
      <Route path="/rv-financing/what-credit-score-do-you-need-to-buy-an-rv" component={CreditScoreToBuyRv} />
      <Route path="/rv-financing/bad-credit-rv-financing" component={BadCreditRvFinancing} />
      <Route path="/rv-financing/rv-loan-calculator" component={RvLoanCalculator} />
      <Route path="/rv-financing/find-rvs-by-monthly-payment" component={FindRvsByMonthlyPayment} />
      <Route path="/rv-financing/rv-pre-approval-before-shopping" component={RvPreApproval} />
      <Route path="/rv-financing/used-rv-financing" component={UsedRvFinancing} />

      {/* 301-equivalent client redirects for legacy /rv/* paths */}
      <Route path="/rv/class-a-motorhomes">{() => <Redirect to="/class-a-rvs-for-sale" replace />}</Route>
      <Route path="/rv/class-b-motorhomes">{() => <Redirect to="/class-b-rvs-for-sale" replace />}</Route>
      <Route path="/rv/class-c-motorhomes">{() => <Redirect to="/class-c-rvs-for-sale" replace />}</Route>
      <Route path="/rv/travel-trailers">{() => <Redirect to="/travel-trailers-for-sale" replace />}</Route>
      <Route path="/rv/fifth-wheels">{() => <Redirect to="/fifth-wheels-for-sale" replace />}</Route>
      <Route path="/rv/toy-haulers">{() => <Redirect to="/toy-haulers-for-sale" replace />}</Route>
      <Route path="/rv/pop-up-campers">{() => <Redirect to="/rvs-for-sale" replace />}</Route>
      <Route path="/rv/new-rvs">{() => <Redirect to="/rvs-for-sale" replace />}</Route>
      <Route path="/rv/used-rvs">{() => <Redirect to="/rvs-for-sale" replace />}</Route>

      {/* Legacy marketing URLs that were 404ing (old links / backlinks / social) */}
      <Route path="/about-us">{() => <Redirect to="/about" replace />}</Route>
      <Route path="/fleet">{() => <Redirect to="/shop" replace />}</Route>

      <Route component={NotFound} />
    </Switch>
      </Suspense>
    </>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <AuthProvider>
          <AppRouter />
        </AuthProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      {isClerkConfigured ? (
        <ClerkProviderWithRoutes />
      ) : (
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <AppRouter />
          </AuthProvider>
        </QueryClientProvider>
      )}
    </WouterRouter>
  );
}

export default App;
