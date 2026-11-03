from pathlib import Path

from maitento import Maitento

mt = Maitento()

# Upload the data and this folder's summarise.py, which adds revenue by region.
files = mt.vfs.open("sales-data")
files.write_text("/sales.csv", Path("../data/sales.csv").read_text(encoding="utf-8"))
files.write_text("/summarise.py", Path("summarise.py").read_text(encoding="utf-8"))

mt.deploy("../maitento")

run = mt.capsules.run("sales-report")
print(f"Capsule finished: {run.status}\n")
print(files.read_text("/report.md"))
