import { Router, type IRouter } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router: IRouter = Router();

router.post("/generate-description", async (req, res) => {
  try {
    const { year, make, model, type, condition, mileage, price, features, extraNotes } = req.body;

    if (!year || !make || !model) {
      return res.status(400).json({ error: "year, make, and model are required" });
    }

    const featureList = Array.isArray(features) && features.length > 0
      ? `\nFeatures & Options:\n${features.map((f: string) => `- ${f}`).join("\n")}`
      : "";

    const extraContext = extraNotes ? `\nAdditional seller notes: ${extraNotes}` : "";

    const prompt = `You are writing a professional RV listing description for a private seller listing on MatchRV, a Pacific Northwest RV marketplace.

The description should match the style and tone of dealer listings — confident, feature-forward, warm but professional. Highlight the lifestyle and adventure the RV enables, not just its specs. Use flowing paragraphs, not bullet points. Write 3–4 paragraphs.

RV Details:
- Year: ${year}
- Make: ${make}
- Model: ${model}
- Type: ${type || "RV"}
- Condition: ${condition || "Good"}
${mileage ? `- Mileage/Hours: ${mileage}` : ""}
${price ? `- Asking Price: $${Number(price).toLocaleString()}` : ""}
${featureList}
${extraContext}

Write a compelling, professional listing description. Lead with what makes this RV special. Weave in the features naturally. End with a sentence that encourages serious buyers to reach out. Do not include a title or heading — just the body paragraphs.`;

    const message = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    res.json({ description: text.trim() });
  } catch (err) {
    console.error("[generate-description] error:", err);
    res.status(500).json({ error: "Failed to generate description" });
  }
});

export default router;
