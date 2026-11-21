"""Summarize Startech Lab playtest data from the Google Sheet CSV export.

Usage: python3 analyze.py responses.csv [build_filter]
Checks the verdict rules from the Prototype Plan: shortcut use 30-80%, funny > frustrating.
"""
import csv, json, re, sys
from collections import defaultdict
from statistics import mean

path = sys.argv[1]
build_filter = sys.argv[2] if len(sys.argv) > 2 else None
runs, surveys, junk = [], [], 0

with open(path, newline="", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        sid, build = row.get("session_id", ""), row.get("build", "")
        if not re.fullmatch(r"s-[a-z0-9]{4,12}", sid or "") or not build.startswith("proto"):
            junk += 1
            continue
        if build_filter and build != build_filter:
            continue
        try:
            tel = json.loads(row.get("telemetry") or "{}")
        except json.JSONDecodeError:
            junk += 1
            continue
        if "survey_for" in tel:
            surveys.append({**row, "_run": tel["survey_for"]})
        elif "run" in tel:
            runs.append({**tel, "_variant": row.get("variant"), "_sid": sid})

print(f"Runs: {len(runs)}  Surveys: {len(surveys)}  Sessions: {len({r['_sid'] for r in runs})}  Junk rows dropped: {junk}\n")

by_var = defaultdict(list)
for r in runs:
    by_var[r["_variant"]].append(r)

for var, rs in sorted(by_var.items()):
    print(f"=== Variant {var} ({rs[0]['cost']}) — {len(rs)} runs ===")
    results = defaultdict(int)
    for r in rs:
        results[r["result"]] += 1
    print("  Results:", dict(results))
    won = [r for r in rs if r["result"] == "won"]
    if won:
        print(f"  Won: avg time {mean(r['secs'] for r in won):.0f}s, avg O2 left {mean(r['o2'] for r in won):.0f}")
    for sysid in ("power", "life", "comms"):
        eligible = [r["sys"][sysid] for r in rs if r["sys"][sysid]["ok"]]
        took = [s for s in eligible if s["m"] == "shortcut"]
        jams = sum(r["sys"][sysid]["j"] for r in rs)
        pct = 100 * len(took) / len(eligible) if eligible else float("nan")
        print(f"  {sysid:6} shortcut use when valid: {len(took)}/{len(eligible)} ({pct:.0f}%), jams (misread): {jams}, "
              f"avg manual secs: {mean(r['sys'][sysid]['ms'] for r in rs):.0f}")
    print(f"  Avg debt left unpaid: {mean(r['debtLeft'] for r in rs):.1f}   Avg generator trips: {mean(r['trips'] for r in rs):.1f}\n")

def avg(key):
    vals = [int(s[key]) for s in surveys if (s.get(key) or "").isdigit()]
    return mean(vals) if vals else float("nan")

f_, fr, cl = avg("rating_funny"), avg("rating_frustrating"), avg("rating_clever")
print(f"Survey averages — funny {f_:.1f}, frustrating {fr:.1f}, clever {cl:.1f}")
print("Verdict check: funny > frustrating?", "YES" if f_ > fr else "NO")
print("\nOpen feedback:")
for s in surveys:
    if (s.get("open_feedback") or "").strip():
        print(f"  [{s.get('variant')}] {s['open_feedback'].strip()}")
