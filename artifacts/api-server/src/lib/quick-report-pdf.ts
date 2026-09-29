import nodemailer from "nodemailer";

export type PdfReport = {
  website: string;
  location: string;
  checkedAt: string;
  findings: Array<{ field: string; missing: number; checked: number }>;
  ai: { question: string | null; answer: string | null; sources: Array<{ url: string }> };
  note: string;
};

export function sampleReportEmailReady(): boolean {
  return Boolean((process.env.SMTP_HOST && process.env.SMTP_FROM) || (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD));
}

function safeText(value: string): string {
  return value.normalize("NFKD").replace(/[^\x20-\x7e]/g, "-");
}

function wrap(value: string, width = 92): string[] {
  const words = safeText(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line && `${line} ${word}`.length > width) { lines.push(line); line = ""; }
    if (word.length > width) {
      for (let offset = 0; offset < word.length; offset += width) lines.push(word.slice(offset, offset + width));
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

export function renderSampleReportPdf(report: PdfReport): Buffer {
  const lines = [
    "MatchRV - Free Website Sample Report",
    `Website: ${report.website}`,
    `Location: ${report.location}`,
    `Checked: ${report.checkedAt}`,
    "",
    "Sampled page findings",
    ...report.findings.map(f => `${f.missing} of ${f.checked} pages did not expose ${f.field}.`),
    "",
    "Shopper question",
    report.ai.question || "No fair question could be formed from the sampled inventory.",
    "",
    "Gemini answer",
    report.ai.answer || "No cited answer was available for this sample.",
    "",
    "Cited sources",
    ...report.ai.sources.map(source => source.url),
    "",
    report.note,
  ].flatMap(line => wrap(line));

  const chunks: string[] = ["%PDF-1.4\n"];
  const offsets: number[] = [0];
  const objects: string[] = [];
  const pages = Array.from({ length: Math.max(1, Math.ceil(lines.length / 52)) }, (_, i) => lines.slice(i * 52, (i + 1) * 52));
  const pageRefs = pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ");
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Kids [${pageRefs}] /Count ${pages.length} >>`);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>");
  pages.forEach((pageLines, i) => {
    const stream = `BT /F1 9 Tf 40 760 Td 12 TL ${pageLines.map((line, j) => `${j ? "T* " : ""}(${line.replace(/[()\\]/g, "\\$&")}) Tj`).join(" ")} ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  });
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(chunks.join("")));
    chunks.push(`${index + 1} 0 obj\n${object}\nendobj\n`);
  });
  const startXref = Buffer.byteLength(chunks.join(""));
  chunks.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  offsets.slice(1).forEach(offset => chunks.push(`${String(offset).padStart(10, "0")} 00000 n \n`));
  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF`);
  return Buffer.from(chunks.join(""), "ascii");
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
    subject: "Your MatchRV website sample report",
    text: `Your free MatchRV sample report for ${report.website} is attached.\n\nThis is a dated sample, not a full inventory audit.`,
    attachments: [{ filename: "MatchRV-sample-report.pdf", content: renderSampleReportPdf(report), contentType: "application/pdf" }],
  });
}

