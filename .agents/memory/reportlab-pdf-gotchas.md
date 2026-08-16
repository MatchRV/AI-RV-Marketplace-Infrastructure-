---
name: ReportLab PDF gotchas
description: Two recurring bugs when generating branded PDFs with reportlab Paragraphs (used for Match Report + Lead Tiers exports)
---

# ReportLab PDF gotchas

Recurring traps when building branded PDFs (exports/*.pdf) via reportlab `Paragraph`.

## 1. Unescaped `&` in Paragraph text renders a stray `;`
`Paragraph("... Q&A ...")` renders as "Q&A;" — reportlab's mini-XML parser treats `&` as an
entity start and appends a `;`. Any literal ampersand in dynamic text corrupts output.
**How to apply:** escape as `&amp;` or avoid the char entirely (we use "Q and A"). Only the
known entities are safe: `&nbsp;`, `&#NNNN;` (e.g. `&#9656;` triangle, `&#183;` middot).

## 2. Splitting "Name, $12,345" on comma breaks the thousands separator
`u.rsplit(",", 1)` on "2024 Jayco 22RB, $34,995" splits at the LAST comma → price "995".
**How to apply:** split on `"$"` instead: `name, price = u.split("$", 1); price = "$" + price`,
then strip trailing `,`/space from name.

**Why:** both bugs render silently (no exception) and only show up in the rendered page, so
always `pdftoppm -png` and eyeball every page before presenting.
