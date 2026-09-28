import { ArrowRight, MessageCircle, Search, Scale } from "lucide-react";

const assistants = [
  ["ChatGPT", "openai", "https://chatgpt.com"],
  ["Gemini", "gemini-color", "https://gemini.google.com"],
  ["Grok", "grok", "https://grok.com"],
  ["Meta Muse", "meta-brand-color", "https://ai.meta.com/muse/"],
  ["Copilot", "copilot-color", "https://copilot.microsoft.com"],
  ["Claude", "claude-color", "https://claude.ai"],
  ["Perplexity", "perplexity-color", "https://www.perplexity.ai"],
];

export function AiShoppingFuture() {
  return <section className="ai-future" aria-labelledby="ai-future-title">
    <div className="ai-future-intro"><p className="brand-eyebrow">A look at what comes next</p><h1 id="ai-future-title">Your next RV search starts by talking to your favorite AI model.</h1><p>“We’re taking the kids camping. Here’s our truck, our budget, and how we like to travel. Which RVs should we look at?”</p><p>That’s the future MatchRV is building toward: tell your AI what life on the road looks like, then explore real RVs that fit.</p></div>
    <div className="ai-brand-row" aria-label="Examples of AI assistants">{assistants.map(([name,icon,url])=><a key={name} href={url} target="_blank" rel="noreferrer"><img src={`/images/ai-brands/${icon}.svg`} alt=""/><span>{name}</span></a>)}</div>
    <p className="ai-brand-note">AI assistants shaping the conversation. Logos identify their respective brands; they do not indicate a partnership or a live MatchRV integration with every assistant.</p>
    <div className="ai-future-steps">
      <article><MessageCircle/><span>01 · Describe your plans</span><h3>Start with your life.</h3><p>Your family, tow vehicle, budget, destinations, and must-haves—in your own words.</p></article>
      <article><Search/><span>02 · Search real inventory</span><h3>Give the conversation real options.</h3><p>MatchRV’s tools search listings that meet our photo and core-data requirements, using your criteria.</p></article>
      <article><Scale/><span>03 · Understand the trade-offs</span><h3>Make a more informed choice.</h3><p>Compare a short list, see why each RV fits, and ask what changes if you adjust your plans.</p></article>
    </div>
    <div className="ai-mcp-explainer"><div><p className="brand-eyebrow">The connection behind the conversation</p><h3>What does MCP make possible?</h3><p>Model Context Protocol (MCP) gives compatible AI assistants a standard way to use tools and data. MatchRV exposes inventory search and comparison tools so a connected assistant can work with RV details instead of guessing.</p><p>Availability depends on the assistant and its connection setup. Here on MatchRV, RV Outfitter is your shopping guide.</p><a href="https://modelcontextprotocol.io/docs/getting-started/intro" target="_blank" rel="noreferrer">Learn about MCP <ArrowRight size={16}/></a></div><aside><span>For dealerships</span><h3>Will AI understand your inventory?</h3><p>Clear photos, complete specifications, and accessible listings are the foundation of this shopping experience.</p><a href="/#request-report">Explore your AI visibility <ArrowRight size={16}/></a></aside></div>
  </section>;
}
