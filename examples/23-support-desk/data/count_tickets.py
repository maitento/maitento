# Runs inside the ticket-report capsule. The support-desk file system is mounted at /mnt/desk.
# It reads the newest day of tickets the nightly-digest app saved, and writes a report next to them:
# latest.md for people to read, and latest.json for the support desk's charts.
import json
from collections import Counter
from pathlib import Path

desk = Path("/mnt/desk")
newest = sorted((desk / "tickets").glob("*.json"))[-1]
day = json.loads(newest.read_text())
tickets = day["tickets"]

counts = {
    field: Counter(t.get(field) or "unsorted" for t in tickets)
    for field in ("category", "urgency", "status")
}
customers = sorted({t["customer"] for t in tickets})


def table(title: str, counter: Counter) -> list[str]:
    rows = [f"| {name} | {count} |" for name, count in counter.most_common()]
    return [f"| {title} | Tickets |", "|---|---:|", *rows, ""]


lines = [f"# Support digest for {day['date']}", "", f"Tickets: {len(tickets)}", ""]
if tickets:
    for field, counter in counts.items():
        lines += table(field.capitalize(), counter)
    lines.append(f"Customers: {', '.join(customers)}")
report = "\n".join(lines) + "\n"
summary = {
    "date": day["date"],
    "tickets": len(tickets),
    **{field: dict(counter.most_common()) for field, counter in counts.items()},
    "customers": customers,
}

reports = desk / "reports"
reports.mkdir(exist_ok=True)
(reports / f"{day['date']}.md").write_text(report)
(reports / "latest.md").write_text(report)
(reports / "latest.json").write_text(json.dumps(summary, indent=2) + "\n")
print(report)
