import { useEffect, useRef } from "react";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { trackPageView, detectReturnVisit } from "@/lib/analytics";
import { recordBuyerIntent, recordPageViewIntent } from "@/lib/buyer-intent";
import { ClerkProvider, SignIn, SignUp, useClerk } from "@clerk/react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { AuthProvider } from "@/contexts/auth-context";
import { Home } from "@/pages/home";
import { Browse } from "@/pages/browse";
import { Shop } from "@/pages/shop";
import { registerMatchrvTools } from "@/agent/webmcp";
import { registerNavigate } from "@/agent/session";
import { ListingDetail } from "@/pages/listing-detail";
import { Outfitter } from "@/pages/outfitter";
import { Match } from "@/pages/match";
import { MatchReport } from "@/pages/match-report";
import { Admin } from "@/pages/admin";
import { Account } from "@/pages/account";
import { Saved } from "@/pages/saved";
import { Searches } from "@/pages/searches";
import { Alerts } from "@/pages/alerts";
import { Messages } from "@/pages/messages";
import { Finance } from "@/pages/finance";
import { Sell } from "@/pages/sell";
import { TowGuide } from "@/pages/tow-guide";
import { About } from "@/pages/about";
import { Terms } from "@/pages/terms";
import { Privacy } from "@/pages/privacy";
import { DealerLogin } from "@/pages/dealer-login";
import { Dealers } from "@/pages/dealers";
import { Discover } from "@/pages/discover";
import { Contact } from "@/pages/contact";
import { Campgrounds } from "@/pages/campgrounds";
import { Trips } from "@/pages/trips";
import { TripDetail } from "@/pages/trip-detail";
import { ARDriveway } from "@/pages/ar-driveway";
import { RvsForSale } from "@/pages/rvs-for-sale";
import { TravelTrailersForSale } from "@/pages/travel-trailers-for-sale";
import { FifthWheelsForSale } from "@/pages/fifth-wheels-for-sale";
import { ClassARvsForSale } from "@/pages/class-a-rvs-for-sale";
import { ClassBRvsForSale } from "@/pages/class-b-rvs-for-sale";
import { ClassCRvsForSale } from "@/pages/class-c-rvs-for-sale";
import { ToyHaulersForSale } from "@/pages/toy-haulers-for-sale";
import { RvDealers } from "@/pages/rv-dealers";
import { FindTheRightRvForYourTowVehicle } from "@/pages/find-the-right-rv-for-your-tow-vehicle";
import { GuidesIndex } from "@/pages/guides/index";
import { HowToBuyAUsedRv } from "@/pages/guides/how-to-buy-a-used-rv";
import { BestRvsForFamilies } from "@/pages/guides/best-rvs-for-families";
import { BestRvsForFullTimeLiving } from "@/pages/guides/best-rvs-for-full-time-living";
import { MotorhomeVsTravelTrailer } from "@/pages/guides/motorhome-vs-travel-trailer";
import { RvFinancingGuide } from "@/pages/guides/rv-financing-guide";
import { TowingGuide } from "@/pages/guides/towing-guide";
import { TowVehicleGuide } from "@/pages/guides/tow-vehicle-guide";
import { TravelTrailerVsFifthWheel } from "@/pages/guides/travel-trailer-vs-fifth-wheel";
import { RvCostGuide } from "@/pages/guides/rv-cost-guide";
import { RvFinancing } from "@/pages/rv-financing/index";
import { CreditScoreToBuyRv } from "@/pages/rv-financing/what-credit-score-do-you-need-to-buy-an-rv";
import { BadCreditRvFinancing } from "@/pages/rv-financing/bad-credit-rv-financing";
import { RvLoanCalculator } from "@/pages/rv-financing/rv-loan-calculator";
import { FindRvsByMonthlyPayment } from "@/pages/rv-financing/find-rvs-by-monthly-payment";
import { RvPreApproval } from "@/pages/rv-financing/rv-pre-approval-before-shopping";
import { UsedRvFinancing } from "@/pages/rv-financing/used-rv-financing";
import NotFound from "@/pages/not-found";

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
      <Switch>
      <Route path="/" component={Home} />
      <Route path="/shop" component={Shop} />
      <Route path="/browse" component={Browse} />
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
      <Route path="/terms-and-conditions" component={Terms} />
      <Route path="/terms">{() => <Redirect to="/terms-and-conditions" replace />}</Route>
      <Route path="/privacy" component={Privacy} />
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
      <Route path="/fleet">{() => <Redirect to="/browse" replace />}</Route>

      <Route component={NotFound} />
    </Switch>
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
