import { Router } from "express";
import { ConstraintError } from "@workspace/agent-core";
import { isAnthropicConfigured } from "@workspace/integrations-anthropic-ai";
import { askShopOutfitter, shopChatSchema } from "../services/shop-outfitter";

const router = Router();
const windows = new Map<string, { start: number; count: number }>();
let active = 0;
router.post("/agent/outfitter", async (req, res) => {
  const input = shopChatSchema.safeParse(req.body);
  if (!input.success) { res.status(400).json({error:"invalid_request",message:"Please shorten your message and try again."}); return; }
  if (!process.env.GEMINI_API_KEY && !isAnthropicConfigured()) { res.status(503).json({error:"outfitter_not_connected",message:"RV Outfitter’s AI connection has not been set up for this preview yet. You can search photo-ready RVs using the filters below."}); return; }
  const now = Date.now();
  for (const [key,value] of windows) if (now-value.start > 60_000) windows.delete(key);
  const key = req.ip || "unknown";
  const window = windows.get(key) || {start:now,count:0};
  if (window.count >= 10 || active >= 8) { res.status(429).json({error:"busy",message:"RV Outfitter is busy. Please try again in a minute."}); return; }
  window.count++; windows.set(key,window); active++;
  res.setHeader("Cache-Control", "no-store");
  try { res.json(await askShopOutfitter(input.data)); }
  catch (error) {
    if (error instanceof ConstraintError) { res.status(422).json({error:"search_needs_clarification",message:error.hint}); return; }
    res.status(502).json({error:"outfitter_failed",message:"RV Outfitter couldn’t complete that request. Please try again or use the filters below."});
  } finally { active--; }
});
export default router;
