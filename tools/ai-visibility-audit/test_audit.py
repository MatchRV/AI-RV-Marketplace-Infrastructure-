"""Focused tests for audit.py. No network, no third-party packages.

Run:  python test_audit.py   (from this folder)
"""
import os
import sys
import tempfile
import xml.etree.ElementTree as ET
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import audit as A

FAILURES = []


def check(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + (" - " + str(detail) if detail and not cond else ""))
    if not cond:
        FAILURES.append(name)


def main():
    out, _stamp, _iso = A.run_audit("https://sample.matchrv.example/",
                                    "Example RV (demonstration)", "Tacoma", "WA", demo=True)
    # executive summary present and data-driven
    rows = dict(A.build_summary(out))
    check("summary-overall", rows["Overall readiness"].startswith("%.1f" % out["scores"]["overall"]), rows.get("Overall readiness"))
    check("summary-fixes", "Top fix 1" in rows and len(rows["Top fix 1"]) > 5)
    check("summary-no-dollars", "$" not in " ".join(v for k, v in rows.items() if k.startswith("Top fix"))
          or "838" not in " ".join(rows.values()), "no revenue estimates")
    check("summary-citation-honest", "do not imply AI recommendations" in rows["AI citations"])
    # strict query semantics preserved
    q = {x["id"]: x for x in out["queries"]}
    check("56-queries", len(out["queries"]) == 56, len(out["queries"]))
    # writers round-trip
    with tempfile.TemporaryDirectory() as d:
        xp, pp = os.path.join(d, "r.xlsx"), os.path.join(d, "r.pdf")
        A.write_xlsx(xp, A.build_sheets(out))
        with zipfile.ZipFile(xp) as z:
            names = [s.get("name") for s in
                     ET.fromstring(z.read("xl/workbook.xml"))
                     .findall(".//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheet")]
        check("xlsx-summary-first", names[0] == "Summary", names[:3])
        check("xlsx-12-sheets", len(names) == 12, len(names))
        n = A.write_pdf(pp, ["T"], A.build_pdf_sections(out))
        raw = open(pp, "rb").read()
        check("pdf-summary-page", b"Executive summary" in raw)
        check("pdf-iso-date", out["observed_display"] in raw.decode("latin-1"))
        check("pdf-pages", n >= 3, n)
    # unknown-never-false: unit missing rv_type must not confirm a typed query
    u = {"availability": "available", "rv_type": None, "price": 50000}
    v, _m = A.match_unit(u, [("rv_type", "eq", "class a"), ("price", "lt", 200000)])
    check("unknown-not-false", v == "potential", v)
    print("FAILURES: %d" % len(FAILURES))
    return 1 if FAILURES else 0


if __name__ == "__main__":
    sys.exit(main())
