import nodemailer from "nodemailer";
import { buildVisibilitySnapshot, type VisibilitySnapshot } from "./visibility-snapshot";

export type PdfReport = {
  name?: string;
  dealership?: string;
  website: string;
  location: string;
  checkedAt: string;
  findings: Array<{ field: string; missing: number; checked: number }>;
  snapshot?: VisibilitySnapshot;
  ai: { question: string | null; answer: string | null; sources: Array<{ url: string }>; siteWasCited?: boolean | null; dealerMentioned?: boolean | null };
  note: string;
};

export function sampleReportEmailReady(): boolean {
  return Boolean((process.env.SMTP_HOST && process.env.SMTP_FROM) || (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD));
}

export function renderSampleReportPdf(report: PdfReport): Buffer {
  const snapshot = report.snapshot ?? buildVisibilitySnapshot(report.findings, report.location);
  const clean = (s: string) => s.normalize("NFKD").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7e]/g, "-");
  const esc = (s: string) => clean(s).replace(/[()\\]/g, "\\$&");
  const navy = "0.039 0.133 0.20", teal = "0 0.749 0.651", ink = "0.09 0.16 0.23", muted = "0.29 0.37 0.44";
  const commands: string[] = [];
  const rect = (x: number, y: number, w: number, h: number, color: string) => commands.push(`${color} rg ${x} ${y} ${w} ${h} re f`);
  const text = (s: string, x: number, y: number, size = 10, color = ink, bold = false) => commands.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${color} rg ${x} ${y} Td (${esc(s)}) Tj ET`);
  // Conservative Helvetica widths keep long words and URLs inside the box.
  const width = (s: string, size: number) => [...clean(s)].reduce((n, c) => n + (/[ilI.,:;'!|]/.test(c) ? .28 : /[MW@]/.test(c) ? .9 : /[A-Z]/.test(c) ? .7 : .56) * size, 0);
  const block = (s: string, x: number, y: number, w: number, size = 10, max = 3, color = ink, bold = false) => {
    const words = clean(s).split(/\s+/).filter(Boolean), lines: string[] = [];
    let line = "";
    for (const word of words) {
      if (width(word, size) > w) {
        if (line) { lines.push(line); line = ""; }
        let part = "";
        for (const c of word) { if (width(part + c, size) > w) { lines.push(part); part = ""; } part += c; }
        line = part;
      } else if (line && width(line + " " + word, size) > w) { lines.push(line); line = word; }
      else line = line ? line + " " + word : word;
    }
    if (line) lines.push(line);
    if (lines.length > max) { lines.length = max; let last = lines[max - 1]; while (width(last + "...", size) > w) last = last.slice(0, -1); lines[max - 1] = last + "..."; }
    lines.forEach((s, i) => text(s, x, y - i * size * 1.35, size, color, bold));
  };
  rect(32, 640, 548, 120, navy); rect(32, 634, 548, 6, teal);
  text("Match", 54, 725, 25, "1 1 1", true); text("RV", 128, 725, 25, teal, true);
  text("AI VISIBILITY REPORTS", 54, 710, 8, "0.62 0.76 0.81");
  text("Free Visibility Snapshot", 54, 685, 20, "1 1 1", true);
  block(`Prepared for: ${report.dealership || report.name || new URL(report.website).hostname} | ${report.location}`, 54, 666, 500, 10, 1, teal, true);
  block(`${new URL(report.website).hostname} | Observed ${report.checkedAt.slice(0, 10)}`, 54, 650, 500, 8, 1, "0.77 0.84 0.87");
  rect(54, 468, 190, 144, "0.933 0.957 0.961");
  commands.push(`${navy} RG 1.2 w 54 468 190 144 re S`);
  text(snapshot.score === null ? "N/A" : String(snapshot.score), 76, 565, 38, navy, true);
  if (snapshot.score !== null) text("/100", 80 + width(String(snapshot.score), 38), 565, 16, navy, true);
  text("SAMPLE AI READINESS", 76, 546, 8, muted);
  block(snapshot.verdict, 70, 525, 155, 10, 3, navy, true);
  snapshot.findings.slice(0, 3).forEach((finding, i) => {
    const y = 600 - i * 48;
    text(`Finding ${i + 1}`, 264, y, 9, "0.031 0.498 0.427", true);
    block(finding, 264, y - 13, 290, 9, 2);
  });
  text("What shoppers asked - could your site prove it?", 54, 440, 13, navy, true);
  rect(54, 406, 504, 23, navy); text("SHOPPER QUESTION", 64, 414, 8, "1 1 1", true); text("RESULT", 310, 414, 8, "1 1 1", true);
  snapshot.questions.slice(0, 3).forEach((q, i) => {
    const y = 390 - i * 44;
    block(q.question, 64, y, 232, 9, 2);
    block(q.result, 310, y, 238, 9, 2);
    commands.push(`0.85 0.89 0.91 RG .5 w 54 ${y - 30} m 558 ${y - 30} l S`);
  });
  text("One live AI observation", 54, 258, 11, navy, true);
  block(report.ai.question || "No fair shopper question could be formed from the sampled inventory.", 54, 241, 504, 9, 2);
  block(report.ai.answer ? `Gemini: ${report.ai.siteWasCited === true ? "Website cited in this answer." : report.ai.siteWasCited === false ? "Website not cited in this answer." : "Citation result not determined."} ${report.ai.answer}` : "AI answer unavailable. This is not a visibility failure.", 54, 212, 504, 8, 2, muted);
  if (report.ai.sources[0]) block(`Source: ${report.ai.sources[0].url}`, 54, 187, 504, 7, 2, muted);
  rect(54, 104, 504, 67, navy); text("Want the fix list?", 70, 151, 12, teal, true);
  block("The full AI Visibility Report includes your scorecard, inventory gaps, listing spot-checks and fixes ranked by impact. Book a short report call at matchrv.com/book.", 70, 133, 472, 10, 2, "1 1 1");
  block(snapshot.scoreNote, 54, 88, 504, 7, 2, muted);
  block("MatchRV | Dated website sample. Not extracted does not prove a fact is absent from every source. Full AI answer and source links are available on your report page.", 54, 64, 504, 7, 2, muted);
  const stream = commands.join("\n");
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [5 0 R] /Count 1 >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents 6 0 R >>", `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let output = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((obj, i) => { offsets.push(Buffer.byteLength(output)); output += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const xref = Buffer.byteLength(output); output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) output += `${String(offset).padStart(10, "0")} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output, "ascii");
}

export async function emailSampleReport(email: string, report: PdfReport): Promise<void> {
  if (!sampleReportEmailReady()) throw new Error("Email delivery is not configured.");
  const useGmail = !process.env.SMTP_HOST;
  const transport = nodemailer.createTransport({
    host: useGmail ? "smtp.gmail.com" : process.env.SMTP_HOST,
    port: useGmail ? 587 : Number(process.env.SMTP_PORT || 587),
    secure: useGmail ? false : process.env.SMTP_SECURE === "true",
    auth: useGmail ? { user: process.env.GMAIL_USER!, pass: process.env.GMAIL_APP_PASSWORD! } : process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || "" } : undefined,
  });
  await transport.sendMail({
    from: useGmail ? process.env.GMAIL_USER : process.env.SMTP_FROM,
    to: email,
    subject: "Your MatchRV Free Visibility Snapshot",
    text: `Your free MatchRV visibility snapshot for ${report.website} is attached.\n\nThis is a dated sample, not a full inventory audit.`,
    attachments: [{ filename: "MatchRV-sample-report.pdf", content: renderSampleReportPdf(report), contentType: "application/pdf" }],
  });
}
