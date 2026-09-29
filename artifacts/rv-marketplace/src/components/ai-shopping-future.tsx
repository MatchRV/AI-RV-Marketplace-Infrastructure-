import { Link } from "wouter";
import { ArrowRight, MessageCircle, Sparkles } from "lucide-react";

const assistants = [
  ["ChatGPT", "openai"],
  ["Gemini", "gemini-color"],
  ["Claude", "claude-color"],
  ["Copilot", "copilot-color"],
  ["Grok", "grok"],
  ["Perplexity", "perplexity-color"],
] as const;

const prompts = [
  "We have two kids and want a bunkhouse travel trailer under $40,000. What should we look for?",
  "Which RVs are short enough for national park campgrounds but still have room for our family?",
  "We like to camp off-grid. Show me RVs with solar, lithium, and enough fresh water for a long weekend.",
];

export function AiShoppingFuture() {
  return <section className="ai-future vision-page" aria-labelledby="ai-future-title">
    <div className="ai-future-intro">
      <p className="brand-eyebrow"><Sparkles size={16}/> A new way to discover RVs</p>
      <h1 id="ai-future-title">Your next RV search starts by talking to AI.</h1>
      <p>Tell an assistant about the people you travel with, your budget, and the adventures you have in mind. The search should begin with your life, not a maze of filters.</p>
    </div>

    <div className="ai-brand-row" aria-label="Examples of AI assistants">
      {assistants.map(([name, icon]) => <div className="ai-brand-badge" key={name}><img src={`/images/ai-brands/${icon}.svg`} alt=""/><span>{name}</span></div>)}
    </div>
    <p className="ai-brand-note">These are examples of AI assistants people use. Their logos do not indicate a partnership or a live MatchRV integration.</p>

    <div className="vision-bridge">
      <MessageCircle aria-hidden="true" size={34}/>
      <h2>When shoppers ask AI what RV fits their life, MatchRV helps connect those conversations to inventory.</h2>
      <p>We’re building the data and connections that can help AI understand real RV listings, find relevant options, and explain the trade-offs.</p>
    </div>

    <div className="vision-prompts">
      <p className="brand-eyebrow">Imagine asking</p>
      <h2>Start with a question in your own words.</h2>
      <div className="vision-prompt-grid">{prompts.map((prompt, index) => <blockquote key={prompt}><span>0{index + 1}</span>“{prompt}”</blockquote>)}</div>
    </div>

    <div className="vision-coming-soon">
      <div><p className="brand-eyebrow">Coming Soon</p><h2>Meet shoppers where their search begins.</h2><p>MatchRV is working toward ways for AI assistants to connect shopper questions with RV inventory.</p></div>
      <div className="vision-roadmap"><span>MatchRV ChatGPT Plugin</span><span>Google UCP</span></div>
    </div>

    <div className="vision-dealer-link"><p>Are you an RV dealership?</p><Link href="/" className="brand-text-link">See how visible your inventory is to AI <ArrowRight size={17}/></Link></div>
  </section>;
}
