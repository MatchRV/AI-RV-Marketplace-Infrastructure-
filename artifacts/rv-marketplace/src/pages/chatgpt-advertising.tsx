import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { ArrowRight, Megaphone, SearchCheck, Image, Users, ShieldCheck } from "lucide-react";

const email = "mailto:jonathan@matchrv.com?subject=MatchRV%20ChatGPT%20Advertising%20Early%20Access&body=Dealership%20name%3A%0AWebsite%20%2F%20inventory%20URL%3A%0AContact%20name%3A%0AEmail%3A%0APhone%3A%0AApproximate%20inventory%20size%3A%0A";

export function ChatGPTAdvertising() {
  return (
    <Layout>
      <SEO
        title="ChatGPT Advertising for RV Dealers — Early Access | MatchRV"
        description="Explore emerging ChatGPT advertising opportunities for RV dealers. Join MatchRV's early-interest list for inventory readiness and future advertising services, subject to platform approval."
        canonical="/dealers/chatgpt-advertising"
      />
      <main className="bg-[#f4fbfa] min-h-screen">
        <section className="bg-[#0B1117] text-white py-20 px-5">
          <div className="max-w-5xl mx-auto">
            <span className="inline-flex items-center gap-2 text-[#00CED1] text-sm font-bold uppercase tracking-widest mb-5"><Megaphone className="w-5 h-5" /> Dealer Early Access</span>
            <h1 className="font-display font-black text-4xl sm:text-6xl leading-tight max-w-4xl">Your RV inventory deserves a place in the AI shopping conversation.</h1>
            <p className="mt-6 text-lg sm:text-xl text-white/75 max-w-3xl leading-relaxed">MatchRV is developing advertising-readiness services to help RV dealerships explore emerging product-feed advertising opportunities in ChatGPT — alongside AI visibility and buyer matching.</p>
            <div className="mt-9 flex flex-wrap gap-4">
              <a href={email} className="inline-flex items-center gap-2 rounded-lg bg-[#00CED1] text-[#0B1117] px-6 py-4 font-bold hover:brightness-110">Request Early Access <ArrowRight className="w-5 h-5" /></a>
              <a href="/for-dealers" className="inline-flex items-center gap-2 rounded-lg border border-white/40 px-6 py-4 font-semibold hover:bg-white/10">Explore Dealer Solutions</a>
            </div>
            <p className="mt-5 text-sm text-white/60">Coming soon · Participation subject to OpenAI eligibility, approvals, and availability. MatchRV is not claiming approved advertising access or guaranteed ad placement.</p>
          </div>
        </section>
        <section className="max-w-5xl mx-auto px-5 py-16">
          <h2 className="font-display font-black text-3xl mb-7">One partner for the next era of RV discovery</h2>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              { Icon: SearchCheck, title: "AI visibility", body: "Identify missing listing details and make your inventory easier for AI systems to understand." },
              { Icon: Image, title: "Advertising readiness", body: "Prepare accurate product images, prices, availability and structured inventory for eligible ad feeds." },
              { Icon: Users, title: "Qualified buyer connections", body: "Help interested shoppers move from an RV recommendation to a dealership conversation." }
            ].map(({Icon,title,body}) => <div key={title} className="bg-white rounded-2xl border border-slate-200 p-6"><Icon className="w-8 h-8 text-[#00696b] mb-4"/><h3 className="font-bold text-xl mb-2">{title}</h3><p className="text-slate-600 leading-relaxed">{body}</p></div>)}
          </div>
          <div className="mt-10 bg-white border border-slate-200 rounded-2xl p-7 sm:p-10">
            <h2 className="font-display font-black text-2xl mb-3">Get on the early-interest list</h2>
            <p className="text-slate-600 mb-6">Tell us your dealership name, website, contact information and approximate inventory size. We'll discuss readiness and contact you as opportunities become available.</p>
            <a href={email} className="inline-flex items-center gap-2 rounded-lg bg-[#00696b] text-white px-6 py-4 font-bold hover:brightness-110">Email MatchRV to Request Access <ArrowRight className="w-5 h-5" /></a>
            <p className="mt-4 text-sm text-slate-500">This button opens your email app; no information is submitted automatically.</p>
          </div>
          <p className="flex items-start gap-2 text-sm text-slate-500 mt-7"><ShieldCheck className="w-5 h-5 shrink-0" /> ChatGPT is a trademark of OpenAI. MatchRV is an independent business; advertising services and placements are subject to OpenAI approval and applicable policies.</p>
        </section>
      </main>
    </Layout>
  );
}
