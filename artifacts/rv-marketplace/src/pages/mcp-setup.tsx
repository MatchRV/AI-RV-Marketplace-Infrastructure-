import { useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Copy, Plug, Search, MessageSquare } from "lucide-react";
import { BrandLayout } from "@/components/brand-layout";
import { SEO } from "@/components/seo";

const endpoint = "https://matchrv-mcp.onrender.com/mcp";
const prompt = "Use MatchRV to find travel trailers under $40,000 near Tacoma, WA that sleep at least six. Ask me about any missing requirements, and show confirmed details and anything unknown.";
const guides = {
  claude: { label: "Claude", note: "Use Claude’s remote custom connector. Organization accounts may need an owner to add it first.", steps: ["Open Customize → Connectors in Claude. Choose + Add → Add custom connector.", "Name it MatchRV and paste the connection address above as the remote MCP server URL. Continue.", "Review the detected authentication settings. MatchRV’s public shopping tools use No sign in; no API key is needed. Finish adding the connector.", "Open a chat, use + → Connectors to enable MatchRV, then try the shopper question below."], url: "https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp", source: "Claude’s official connector guide" },
  chatgpt: { label: "ChatGPT", note: "Use ChatGPT on the web with custom MCP app access. Availability depends on your plan and workspace permissions; Pro supports read/fetch MCP connections in developer mode.", steps: ["Enable developer mode where your account permits it: Settings → Apps → Advanced Settings. Workspace users may need admin access first.", "In Apps, choose Create. Name the app MatchRV and paste the connection address above as the MCP server endpoint.", "Choose no authentication for these public shopping tools, scan the tools, review them, and create the app.", "Start a new chat, select MatchRV from the tools/apps menu, and try the shopper question below."], url: "https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt", source: "OpenAI’s official MCP app guide" },
  other: { label: "Another AI app", note: "Your app must support remote MCP over Streamable HTTP. A normal chat box alone cannot install an MCP connection.", steps: ["Find your app’s MCP servers, integrations, or custom connectors settings.", "Add a remote server named MatchRV. Choose Streamable HTTP if it asks for a transport.", "Paste the connection address above. These public shopping tools do not require a login or API key.", "Enable the server and review its tools. Start a conversation and ask the app to use MatchRV."], url: "", source: "" },
};
type Guide = keyof typeof guides;

function CopyButton({ text, label }: { text: string; label: string }) {
  const [status, setStatus] = useState("");
  async function copy() {
    try { await navigator.clipboard.writeText(text); setStatus("Copied"); }
    catch { setStatus("Select and copy the text above."); }
  }
  return <div className="mcp-copy-control"><button className="brand-button secondary" onClick={copy}><Copy size={16}/>{label}</button><span role="status">{status}</span></div>;
}

export function McpSetup() {
  const [selected, setSelected] = useState<Guide>("claude");
  const guide = guides[selected];
  return <BrandLayout>
    <SEO title="MCP Setup — Connect MatchRV to Your AI" description="Connect MatchRV’s public RV shopping tools to Claude, ChatGPT, or another compatible AI app. Copy the MCP address and follow the setup steps." canonical="/mcp-setup"/>
    <section className="brand-container mcp-intro"><p className="brand-eyebrow"><Plug size={17}/> MCP Setup</p><h1>Your AI. Real RV inventory.</h1><p className="brand-lead">Connect MatchRV to a compatible AI app so you can search RV inventory, compare options, and explore published specs in your own conversation.</p><p>MCP is the connection that lets your AI use MatchRV’s shopping tools. Add it once, then tell your assistant what you’re looking for.</p>
      <div className="mcp-flow" aria-label="How the connection works"><span><MessageSquare size={22}/> Your AI app</span><ArrowRight aria-hidden="true"/><span><Plug size={22}/> MatchRV connection</span><ArrowRight aria-hidden="true"/><span><Search size={22}/> RV inventory</span></div>
    </section>
    <section className="brand-soft-section"><div className="brand-container brand-section"><p className="brand-eyebrow">Step 1 · Copy the connection address</p><h2>Meet your AI’s new RV shopping tool.</h2><div className="mcp-connection"><label htmlFor="mcp-endpoint">Remote MCP server URL</label><input id="mcp-endpoint" value={endpoint} readOnly onFocus={event => event.currentTarget.select()}/><CopyButton text={endpoint} label="Copy connection address"/><p className="brand-fine">Connection name: MatchRV · Transport: Streamable HTTP · Public shopping access: no sign-in or API key</p></div></div></section>
    <section className="brand-container brand-section"><p className="brand-eyebrow">Step 2 · Add it to your AI</p><h2>Choose your app.</h2><div className="mcp-apps" aria-label="Setup instructions by AI app">{(Object.keys(guides) as Guide[]).map(key => <button key={key} aria-pressed={selected === key} aria-controls="mcp-instructions" onClick={() => setSelected(key)}>{guides[key].label}</button>)}</div><article id="mcp-instructions" className="mcp-instructions"><h3>Connect with {guide.label}</h3><p className="brand-muted">{guide.note}</p><ol>{guide.steps.map(step => <li key={step}>{step}</li>)}</ol>{guide.url && <a className="brand-text-link" href={guide.url} target="_blank" rel="noopener noreferrer">{guide.source} <ArrowRight size={16}/></a>}</article><p className="brand-fine">Menu names and availability can change. If you cannot find a custom connector or app option, check your provider’s guide or ask your workspace administrator.</p></section>
    <section className="brand-container mcp-test"><p className="brand-eyebrow">Step 3 · Try a shopper question</p><h2>Start with what matters to you.</h2><blockquote>{prompt}</blockquote><CopyButton text={prompt} label="Copy test question"/><p>Ask your AI to use MatchRV explicitly. A successful connection returns real listing details through MatchRV tools, with missing specifications labeled as unknown.</p></section>
    <section className="brand-container brand-section"><h2>What you can do after connecting</h2><div className="mcp-features">{[["Find RVs", "Search by budget, location, RV type, and published specifications."], ["Compare your shortlist", "Compare two to four RVs with confirmed specs and clear unknowns."], ["Explore tow fit", "Review published weight limits and missing details. Confirm your exact vehicle ratings and loaded weights before towing."]].map(([title, text]) => <article key={title}><h3>{title}</h3><p>{text}</p></article>)}</div><details className="mcp-help"><summary>Connection not working?</summary><p>Use the complete address ending in /mcp. It is an AI connection endpoint, so opening it as a normal webpage may show an error. Confirm that your app supports remote Streamable HTTP MCP, enable MatchRV in your conversation, and check any workspace restrictions.</p><p>Dealer contact is not available through this public MCP release. For setup help, <Link href="/contact" className="brand-text-link">contact MatchRV</Link>.</p></details><Link href="/shop" className="brand-text-link">Explore shopping with your AI <ArrowRight size={16}/></Link></section>
  </BrandLayout>;
}
