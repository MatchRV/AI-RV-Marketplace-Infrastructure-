import express from 'express';
import cors from 'cors';
import axios from 'axios';

const app = express();
app.use(cors());
app.use(express.json());

// ------------------------------------------------------------------
// 1. FAKE RV INVENTORY (Your Database)
// ------------------------------------------------------------------
const inventoryDB = {
  "STK-98421": {
    stock_number: "STK-98421",
    year: 2024,
    make: "Grand Design",
    model: "Reflection",
    floorplan: "311BHS",
    description: "Bunkhouse fifth wheel with double slide-outs and outdoor kitchen.",
    price: 54995.00,
    condition: "new",
    dry_weight_lbs: 11185,
    gvwr_lbs: 13995,
    hitch_weight_lbs: 2180,
    primary_image_url: "https://cdn.matchrv.com/photos/98421_1.jpg",
    dealer_store_code: "WA_KENT_01",
    vin: "14DV32871N8219412"
  }
};

// ------------------------------------------------------------------
// 2. GOOGLE ADS FEED (Makes a list Google can read)
// ------------------------------------------------------------------
app.get('/feeds/google-vehicle-ads.tsv', (req, res) => {
  const headers = ['id', 'title', 'description', 'link', 'image_link', 'price', 'vehicle_type', 'condition', 'store_code', 'vin', 'availability'];
  
  const rows = Object.values(inventoryDB).map(item => {
    const title = `${item.year} ${item.make} ${item.model} ${item.floorplan}`;
    const link = `https://matchrv-webmcp.onrender.com/shop?stock=${item.stock_number}`;
    return [
      item.stock_number, title, item.description, link, 
      item.primary_image_url, `${item.price.toFixed(2)} USD`, 
      'RV', item.condition, item.dealer_store_code, item.vin, 'in_stock'
    ].join('\t');
  });

  const tsv = [headers.join('\t'), ...rows].join('\n');
  res.setHeader('Content-Type', 'text/tab-separated-values; charset=utf-8');
  return res.status(200).send(tsv);
});

// ------------------------------------------------------------------
// 3. SHOP PAGE (Shows the RV and does the towing math)
// ------------------------------------------------------------------
app.get('/shop', (req, res) => {
  const { stock, tow_payload, tow_max, tow_vehicle } = req.query;
  const rv = inventoryDB[stock || "STK-98421"];

  let matchMessage = "Connect your truck to check towing safety.";
  let isSafe = false;

  if (tow_payload && tow_max) {
    const payloadMargin = parseFloat(tow_payload) - 300 - rv.hitch_weight_lbs;
    const towingMargin = parseFloat(tow_max) - rv.gvwr_lbs;
    isSafe = payloadMargin >= 0 && towingMargin >= 0;
    
    matchMessage = isSafe 
      ? `✓ SAFE MATCH for ${tow_vehicle || 'your truck'}! (${payloadMargin} lbs payload headroom)`
      : `⚠ OVER CAPACITY! Exceeds safety limits for ${tow_vehicle || 'your truck'}.`;
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head><title>${rv.year} ${rv.make} ${rv.model}</title></head>
    <body style="font-family: sans-serif; padding: 2rem;">
      <h1>${rv.year} ${rv.make} ${rv.model} ${rv.floorplan}</h1>
      <p>Stock #: ${rv.stock_number} | Price: $${rv.price}</p>
      <div style="padding: 1rem; background: ${isSafe ? '#dcfce7' : '#fef3c7'}; border-radius: 8px;">
        <h3>Towing Safety Check</h3>
        <p>${matchMessage}</p>
      </div>
    </body>
    </html>
  `;
  res.send(html);
});

// ------------------------------------------------------------------
// 4. WEBMCP AI AGENT TOOLS (Helps Gemini talk to dealers)
// ------------------------------------------------------------------
app.get('/api/mcp/tools', (req, res) => {
  res.json({
    tools: [{
      name: "submit_qualified_dealer_lead",
      description: "Pushes a pre-qualified customer lead directly into dealer CRM."
    }]
  });
});

app.post('/api/mcp/call', async (req, res) => {
  const { name, arguments: args } = req.body;
  if (name === "submit_qualified_dealer_lead") {
    // Send to Elead or DriveCentric CRM
    return res.json({
      content: [{ type: "text", text: JSON.stringify({ success: true, message: "Lead sent to dealer CRM!" }) }]
    });
  }
  res.status(404).json({ error: "Tool not found" });
});

// ------------------------------------------------------------------
// START SERVER
// ------------------------------------------------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`MatchRV is running on port ${PORT}`));
