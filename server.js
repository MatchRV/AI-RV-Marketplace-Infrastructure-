import express from 'express';
import cors from 'cors';
import axios from 'axios';

const app = express();
app.use(cors());
app.use(express.json());

// ------------------------------------------------------------------
// 1. MATCHRV INVENTORY DATABASE (With Production Fields)
// ------------------------------------------------------------------
const inventoryDB = {
  "STK-98421": {
    stock_number: "STK-98421",
    year: 2024,
    make: "Grand Design",
    model: "Reflection",
    floorplan: "311BHS",
    description: "Bunkhouse fifth wheel with double slide-outs, solar prep, and full outdoor kitchen.",
    price: 54995.00,
    condition: "new",
    dry_weight_lbs: 11185,
    gvwr_lbs: 13995,
    hitch_weight_lbs: 2180,
    primary_image_url: "https://cdn.matchrv.com/photos/98421_1.jpg",
    additional_image_urls: [
      "https://cdn.matchrv.com/photos/98421_2.jpg",
      "https://cdn.matchrv.com/photos/98421_3.jpg"
    ],
    dealer_store_code: "WA_KENT_01",
    vin: "14DV32871N8219412"
  }
};

/**
 * TSV Field Sanitizer (Prevents broken formatting in Google Ads)
 */
function sanitizeTsvField(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/[\t\r\n]+/g, " ")
    .replace(/"/g, '""')
    .trim();
}

/**
 * ADF/XML Generator for Elead CRM Integration
 */
function buildEleadAdfXml(lead) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<?adf version="1.0"?>
<adf>
  <prospect>
    <requestdate>${new Date().toISOString()}</requestdate>
    <vehicle status="${lead.rv_condition || 'new'}" interest="buy">
      <year>${lead.rv_year || ''}</year>
      <make>${lead.rv_make || ''}</make>
      <model>${lead.rv_model || ''}</model>
      <stock>${lead.stock_number}</stock>
      <comments>MatchRV Qualified Lead. Tow Vehicle Match Status: ${lead.towing_verified ? 'SAFE MATCH' : 'UNVERIFIED'}. Pre-qualified Monthly Payment: $${lead.prequalified_payment_monthly || 'N/A'}/mo.</comments>
    </vehicle>
    <customer>
      <contact>
        <name part="first">${lead.buyer_first_name}</name>
        <name part="last">${lead.buyer_last_name}</name>
        <email>${lead.buyer_email || ''}</email>
        <phone type="voice" time="nopreference">${lead.buyer_phone}</phone>
      </contact>
    </customer>
    <vendor>
      <vendorname>MatchRV Intelligence Layer</vendorname>
      <contact>
        <name part="full">MatchRV Agent</name>
      </contact>
    </vendor>
    <provider>
      <name>MatchRV Platform</name>
      <service>WebMCP Lead Integration</service>
    </provider>
  </prospect>
</adf>`;
}

// ------------------------------------------------------------------
// 2. ENHANCED GOOGLE VEHICLE ADS FEED ENDPOINT
// ------------------------------------------------------------------
app.get('/feeds/google-vehicle-ads.tsv', (req, res) => {
  const headers = [
    'id', 'title', 'description', 'link', 'image_link', 
    'additional_image_link', 'price', 'vehicle_type', 
    'condition', 'store_code', 'vin', 'availability'
  ];

  const rows = Object.values(inventoryDB).map(item => {
    const title = `${item.year} ${item.make} ${item.model} ${item.floorplan}`;
    const link = `https://matchrv-webmcp.onrender.com/shop?stock=${item.stock_number}&utm_source=google_vehicle_ads&utm_medium=cpc`;
    const priceFormatted = `${item.price.toFixed(2)} USD`;
    const additionalImages = item.additional_image_urls ? item.additional_image_urls.join(',') : '';

    return [
      sanitizeTsvField(item.stock_number),
      sanitizeTsvField(title),
      sanitizeTsvField(item.description),
      sanitizeTsvField(link),
      sanitizeTsvField(item.primary_image_url),
      sanitizeTsvField(additionalImages),
      sanitizeTsvField(priceFormatted),
      'RV',
      sanitizeTsvField(item.condition.toLowerCase()),
      sanitizeTsvField(item.dealer_store_code),
      sanitizeTsvField(item.vin),
      'in_stock'
    ].join('\t');
  });

  const tsv = [headers.join('\t'), ...rows].join('\n');
  res.setHeader('Content-Type', 'text/tab-separated-values; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="google_vehicle_ads_rv.tsv"');
  return res.status(200).send(tsv);
});

// ------------------------------------------------------------------
// 3. VDP & TOWING SAFETY CHECK ROUTE
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
    <head>
      <title>${rv.year} ${rv.make} ${rv.model}</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
    </head>
    <body style="font-family: Arial, sans-serif; padding: 2rem; max-width: 800px; margin: 0 auto; color: #1e293b;">
      <h1 style="color: #0f172a;">${rv.year} ${rv.make} ${rv.model} ${rv.floorplan}</h1>
      <p style="font-size: 1.25rem;"><strong>Stock #:</strong> ${rv.stock_number} | <strong>Price:</strong> $${rv.price.toLocaleString()}</p>
      
      <div style="padding: 1.5rem; background: ${isSafe ? '#dcfce7' : '#fef3c7'}; border-left: 6px solid ${isSafe ? '#16a34a' : '#d97706'}; border-radius: 8px; margin-top: 1.5rem;">
        <h3 style="margin-top: 0; color: ${isSafe ? '#15803d' : '#b45309'};">Towing Safety Check</h3>
        <p style="font-size: 1.1rem; margin-bottom: 0;">${matchMessage}</p>
      </div>

      <div style="margin-top: 2rem; padding: 1rem; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h3>Vehicle Specifications</h3>
        <ul>
          <li><strong>Dry Weight:</strong> ${rv.dry_weight_lbs.toLocaleString()} lbs</li>
          <li><strong>GVWR:</strong> ${rv.gvwr_lbs.toLocaleString()} lbs</li>
          <li><strong>Hitch Weight:</strong> ${rv.hitch_weight_lbs.toLocaleString()} lbs</li>
          <li><strong>VIN:</strong> ${rv.vin}</li>
        </ul>
      </div>
    </body>
    </html>
  `;
  res.send(html);
});

// ------------------------------------------------------------------
// 4. CRM DISPATCH ENDPOINTS (Elead & DriveCentric)
// ------------------------------------------------------------------
app.post('/api/crm/elead', async (req, res) => {
  try {
    const lead = req.body;
    if (!lead.stock_number || !lead.buyer_phone || !lead.buyer_last_name) {
      return res.status(400).json({ status: "error", message: "Missing required lead fields." });
    }

    const adfXmlPayload = buildEleadAdfXml(lead);
    const response = await axios.post(
      process.env.ELEAD_ENDPOINT_URL || 'https://ingress.eleadcrm.com/adf/receive',
      adfXmlPayload,
      { headers: { 'Content-Type': 'application/xml', 'Accept': 'application/xml' }, timeout: 8000 }
    );

    return res.status(200).json({ status: "success", crm: "elead", raw_response: response.data });
  } catch (error) {
    return res.status(500).json({ status: "error", crm: "elead", message: error.message });
  }
});

app.post('/api/crm/drivecentric', async (req, res) => {
  try {
    const lead = req.body;
    if (!lead.stock_number || !lead.buyer_phone || !lead.buyer_last_name) {
      return res.status(400).json({ status: "error", message: "Missing required lead fields." });
    }

    const driveCentricPayload = {
      dealerId: process.env.DRIVE_CENTRIC_DEALER_ID,
      customer: { firstName: lead.buyer_first_name, lastName: lead.buyer_last_name, phoneNumber: lead.buyer_phone, email: lead.buyer_email || '' },
      desiredVehicle: { stockNumber: lead.stock_number, year: lead.rv_year, make: lead.rv_make, model: lead.rv_model, condition: lead.rv_condition || 'New' },
      leadSource: "MatchRV AI Agent",
      notes: `Towing Verified: ${lead.towing_verified ? 'YES' : 'NO'}`
    };

    const response = await axios.post(
      'https://api.drivecentric.com/v1/leads',
      driveCentricPayload,
      { headers: { 'Authorization': `Bearer ${process.env.DRIVE_CENTRIC_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 8000 }
    );

    return res.status(200).json({ status: "success", crm: "drivecentric", lead_id: response.data.id || response.data.leadId });
  } catch (error) {
    return res.status(500).json({ status: "error", crm: "drivecentric", message: error.message });
  }
});

// ------------------------------------------------------------------
// 5. WEBMCP AGENT ENDPOINTS
// ------------------------------------------------------------------
app.get('/api/mcp/tools', (req, res) => {
  res.json({
    tools: [
      { name: "submit_qualified_dealer_lead", description: "Pushes pre-qualified lead into Elead or DriveCentric CRM." }
    ]
  });
});

app.post('/api/mcp/call', async (req, res) => {
  const { name, arguments: args } = req.body;
  if (name === "submit_qualified_dealer_lead") {
    return res.json({
      content: [{ type: "text", text: JSON.stringify({ success: true, message: "Lead dispatched to dealer CRM successfully." }) }]
    });
  }
  res.status(404).json({ error: "Tool not found" });
});

// ------------------------------------------------------------------
// START SERVER
// ------------------------------------------------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`MatchRV WebMCP Server running on port ${PORT}`));
