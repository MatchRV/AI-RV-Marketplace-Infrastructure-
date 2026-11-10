import { Link } from "wouter";
import { SiteLayout } from "@/components/site/site-layout";
import { SEO } from "@/components/seo";
import { Icon } from "@/components/site/icon";
import { MCP_JSON_CONFIG } from "@/config/mcp";
import { StatusPills } from "@/components/site/blocks";
import { InventoryCoverage } from "@/components/inventory-coverage";
import { SITE } from "@/config/site";

export function McpSetup() {
  return <SiteLayout nav="shop">
    <SEO title="MCP Setup — Connect MatchRV to Your AI" description="Connect MatchRV’s public RV shopping tools to Claude, ChatGPT, or another compatible AI app. Copy the MCP address and follow the setup steps." canonical="/mcp-setup"/>
    <section className="page-hero" aria-labelledby="page-title">
      <div className="page-hero__bg" aria-hidden="true">
        <div className="grain"></div>
      </div>
      <div className="container">
        <p className="eyebrow eyebrow--live"><Icon name="plug"/> MCP Setup</p>
        <h1 id="page-title" className="display display--md"><span className="line"><span>Your AI.</span></span> <span className="line"><span><em>Real RV inventory.</em></span></span></h1>
        <p className="lead">Connect MatchRV to a compatible AI app so you can search RV inventory, compare options, and explore published specs in your own conversation.</p>
        <p className="page-hero__sub">MCP is the connection that lets your AI use MatchRV’s shopping tools. Add it once, then tell your assistant what you’re looking for.</p>
        <StatusPills/>
        <ol className="flow" aria-label="How the connection works" data-reveal>
          <li><Icon name="chat"/> Your AI app</li>
          <li><Icon name="plug"/> MatchRV connection</li>
          <li><Icon name="search"/> RV inventory</li>
        </ol>
        <InventoryCoverage/>
      </div>
    </section>
    <section className="section theme-paper" aria-labelledby="step1-title">
      <div className="container setup">
        <header data-reveal>
          <p className="eyebrow">Step 1 · Copy the connection address</p>
          <h2 id="step1-title" className="h1">Meet your AI’s new <em>RV shopping tool.</em></h2>
        </header>
        <div className="connect" data-reveal>
          <label htmlFor="mcp-endpoint">Remote MCP server URL</label>
          <div className="connect__row">
            <input id="mcp-endpoint" type="text" defaultValue={SITE.mcpEndpoint} readOnly data-select-on-focus/>
            <button className="btn btn--primary" type="button" data-copy={SITE.mcpEndpoint} data-copy-label="Copy connection address"><Icon name="copy"/> <span>Copy connection address</span></button>
          </div>
          <p className="fine">Connection name: MatchRV · Transport: Streamable HTTP · Public shopping access: no sign-in or API key</p>
          <details className="disclosure">
            <summary>JSON configuration for compatible MCP clients <Icon name="chevron"/></summary>
            <p>For clients that accept a remote URL in an mcpServers configuration:</p>
            <pre className="code" id="mcp-json"><code>{MCP_JSON_CONFIG}</code></pre>
            <button className="btn btn--ghost" type="button" data-copy-from="#mcp-json" data-copy-label="Copy JSON configuration"><Icon name="copy"/> <span>Copy JSON configuration</span></button>
          </details>
        </div>
      </div>
    </section>
    <section className="section" aria-labelledby="step2-title">
      <div className="container setup">
        <header data-reveal>
          <p className="eyebrow">Step 2 · Add it to your AI</p>
          <h2 id="step2-title" className="h1">Choose <em>your app.</em></h2>
        </header>
        <div className="tabs" data-tabs data-reveal>
          <div className="tabs__list" role="tablist" aria-label="Setup instructions by AI app">
            <button role="tab" id="tab-claude" aria-controls="panel-claude" aria-selected="true">Claude</button>
            <button role="tab" id="tab-chatgpt" aria-controls="panel-chatgpt" aria-selected="false" tabIndex={-1}>ChatGPT</button>
            <button role="tab" id="tab-other" aria-controls="panel-other" aria-selected="false" tabIndex={-1}>Another AI app</button>
          </div>
          <article className="tabs__panel card" role="tabpanel" id="panel-claude" aria-labelledby="tab-claude" tabIndex={0}>
            <h3 className="h3">Connect with Claude</h3>
            <p className="muted">Use Claude’s remote custom connector. Organization accounts may need an owner to add it first.</p>
            <ol className="numbered">
              <li>Open Customize → Connectors in Claude. Choose + Add → Add custom connector.</li>
              <li>Name it MatchRV and paste the connection address above as the remote MCP server URL. Continue.</li>
              <li>Review the detected authentication settings. MatchRV’s public shopping tools use No sign in; no API key is needed. Finish adding the connector.</li>
              <li>Open a chat, use + → Connectors to enable MatchRV, then try the shopper question below.</li>
            </ol>
            <a className="link-arrow" href="https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp" target="_blank" rel="noopener">Claude’s official connector guide <Icon name="external"/></a>
          </article>
          <article className="tabs__panel card" role="tabpanel" id="panel-chatgpt" aria-labelledby="tab-chatgpt" tabIndex={0} hidden>
            <h3 className="h3">Connect with ChatGPT</h3>
            <p className="muted">Use ChatGPT on the web with custom MCP app access. Availability depends on your plan and workspace permissions; Pro supports read/fetch MCP connections in developer mode.</p>
            <ol className="numbered">
              <li>Enable developer mode where your account permits it: Settings → Apps → Advanced Settings. Workspace users may need admin access first.</li>
              <li>In Apps, choose Create. Name the app MatchRV and paste the connection address above as the MCP server endpoint.</li>
              <li>Choose no authentication for these public shopping tools, scan the tools, review them, and create the app.</li>
              <li>Start a new chat, select MatchRV from the tools/apps menu, and try the shopper question below.</li>
            </ol>
            <a className="link-arrow" href="https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt" target="_blank" rel="noopener">OpenAI’s official MCP app guide <Icon name="external"/></a>
          </article>
          <article className="tabs__panel card" role="tabpanel" id="panel-other" aria-labelledby="tab-other" tabIndex={0} hidden>
            <h3 className="h3">Connect with another AI app</h3>
            <p className="muted">Your app must support remote MCP over Streamable HTTP. A normal chat box alone cannot install an MCP connection.</p>
            <ol className="numbered">
              <li>Find your app’s MCP servers, integrations, or custom connectors settings.</li>
              <li>Add a remote server named MatchRV. Choose Streamable HTTP if it asks for a transport.</li>
              <li>Paste the connection address above. These public shopping tools do not require a login or API key.</li>
              <li>Enable the server and review its tools. Start a conversation and ask the app to use MatchRV.</li>
            </ol>
          </article>
          <p className="fine">Menu names and availability can change. If you cannot find a custom connector or app option, check your provider’s guide or ask your workspace administrator.</p>
        </div>
      </div>
    </section>
    <section className="section theme-paper" aria-labelledby="step3-title">
      <div className="container setup">
        <header data-reveal>
          <p className="eyebrow">Step 3 · Try a shopper question</p>
          <h2 id="step3-title" className="h1">Start with what <em>matters to you.</em></h2>
        </header>
        <div data-reveal>
          <figure className="prompt prompt--flush">
            <span className="prompt__who"><Icon name="chat"/> Test question</span>
            <blockquote id="mcp-prompt">Use MatchRV to find travel trailers under $40,000 near Tacoma, WA that sleep at least six. Ask me about any missing requirements, and show confirmed details and anything unknown.</blockquote>
            <figcaption><button className="btn btn--primary" type="button" data-copy-from="#mcp-prompt" data-copy-label="Copy test question"><Icon name="copy"/> <span>Copy test question</span></button></figcaption>
          </figure>
          <p>Ask your AI to use MatchRV explicitly. A successful connection returns real listing details through MatchRV tools, with missing specifications labeled as unknown.</p>
        </div>
      </div>
    </section>
    <section className="section" aria-labelledby="after-title">
      <div className="container">
        <header className="section-head" data-reveal>
          <h2 id="after-title" className="h1">What you can do <em>after connecting</em></h2>
        </header>
        <ul className="covers covers--3" data-stagger>
          <li className="card" data-reveal data-spot><Icon name="search"/> <h3 className="h4">Find RVs</h3> <p>Search by budget, location, RV type, and published specifications.</p></li>
          <li className="card" data-reveal data-spot><Icon name="scale"/> <h3 className="h4">Compare your shortlist</h3> <p>Compare two to four RVs with confirmed specs and clear unknowns.</p></li>
          <li className="card" data-reveal data-spot><Icon name="tow"/> <h3 className="h4">Explore tow fit</h3> <p>Review published weight limits and missing details. Confirm your exact vehicle ratings and loaded weights before towing.</p></li>
        </ul>
        <details className="disclosure disclosure--help" data-reveal>
          <summary>Connection not working? <Icon name="chevron"/></summary>
          <p>Use the complete address ending in /mcp. It is an AI connection endpoint, so opening it as a normal webpage may show an error. Confirm that your app supports remote Streamable HTTP MCP, enable MatchRV in your conversation, and check any workspace restrictions.</p>
          <p>Dealer contact is not available through this public MCP release. For setup help, <Link className="text-link" href="/contact">contact MatchRV</Link>.</p>
        </details>
        <p data-reveal><Link className="link-arrow" href="/shop">Explore shopping with your AI <Icon name="arrow"/></Link></p>
      </div>
    </section>
  </SiteLayout>;
}
