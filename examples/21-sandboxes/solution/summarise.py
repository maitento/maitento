# The challenge: the same report, with revenue by region as well as by product.
import csv
from collections import defaultdict

totals: defaultdict[str, float] = defaultdict(float)
units: defaultdict[str, int] = defaultdict(int)
regions: defaultdict[str, float] = defaultdict(float)
with open("/mnt/data/sales.csv", newline="") as f:
    for row in csv.DictReader(f):
        revenue = int(row["units"]) * float(row["unit_price"])
        totals[row["product"]] += revenue
        units[row["product"]] += int(row["units"])
        regions[row["region"]] += revenue

lines = ["# Sales report", "", "| Product | Units | Revenue |", "|---|---:|---:|"]
for product, revenue in sorted(totals.items(), key=lambda item: -item[1]):
    lines.append(f"| {product} | {units[product]} | {revenue:.2f} |")
lines += ["", "| Region | Revenue |", "|---|---:|"]
for region, revenue in sorted(regions.items(), key=lambda item: -item[1]):
    lines.append(f"| {region} | {revenue:.2f} |")
lines += ["", f"Total revenue: {sum(totals.values()):.2f}"]

with open("/mnt/data/report.md", "w") as f:
    f.write("\n".join(lines) + "\n")
print("Wrote /mnt/data/report.md")
