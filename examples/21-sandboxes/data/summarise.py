# Runs inside the capsule. The VFS is mounted at /mnt/data, so files you put in it
# are right there, and anything written back to it is still there after the capsule ends.
import csv
from collections import defaultdict

totals = defaultdict(float)
units = defaultdict(int)
with open("/mnt/data/sales.csv", newline="") as f:
    for row in csv.DictReader(f):
        totals[row["product"]] += int(row["units"]) * float(row["unit_price"])
        units[row["product"]] += int(row["units"])

lines = ["# Sales report", "", "| Product | Units | Revenue |", "|---|---:|---:|"]
for product, revenue in sorted(totals.items(), key=lambda item: -item[1]):
    lines.append(f"| {product} | {units[product]} | {revenue:.2f} |")
lines += ["", f"Total revenue: {sum(totals.values()):.2f}"]

with open("/mnt/data/report.md", "w") as f:
    f.write("\n".join(lines) + "\n")
print("Wrote /mnt/data/report.md")
