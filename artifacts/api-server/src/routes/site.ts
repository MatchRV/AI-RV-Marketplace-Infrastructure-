import { Router, type IRouter, type Request, type Response } from "express";
import { db, sellLeadsTable, contactSubmissionsTable, dealersTable } from "@workspace/db";

const router: IRouter = Router();

router.post("/sell", async (req: Request, res: Response) => {
  const { name, email, phone, year, make, model, type, condition, askingPrice, description } = req.body;
  if (!name || !email || !year || !make || !model || !type || !condition) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  try {
    await db.insert(sellLeadsTable).values({
      name,
      email,
      phone: phone || null,
      year: Number(year),
      make,
      model,
      type,
      condition,
      askingPrice: askingPrice ? Number(askingPrice) : null,
      description: description || null,
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to submit" });
  }
});

router.post("/contact", async (req: Request, res: Response) => {
  const { name, email, subject, message } = req.body;
  if (!name || !email || !subject || !message) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  try {
    await db.insert(contactSubmissionsTable).values({ name, email, subject, message });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to submit" });
  }
});

router.get("/dealers", async (_req: Request, res: Response) => {
  try {
    const dealers = await db.select().from(dealersTable);
    res.json({ dealers });
  } catch {
    res.status(500).json({ error: "Failed to load dealers" });
  }
});

export default router;
