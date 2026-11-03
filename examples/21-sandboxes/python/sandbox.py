import os
from pathlib import Path

from maitento import Maitento

mt = Maitento()

# The capsule mounts the sales-data file system, so create it (and the namespace) before deploying.
namespace = os.environ.get("MAITENTO_NAMESPACE", "tutorials")
if not mt.namespaces.find(namespace):
    mt.namespaces.create(namespace)
if not mt.vfs.find_by_name("sales-data"):
    mt.vfs.create("sales-data")

files = mt.vfs.open("sales-data")
for name in ["sales.csv", "summarise.py"]:
    files.write_text(f"/{name}", Path("../data", name).read_text(encoding="utf-8"))

mt.deploy("../maitento")

# Start the capsule and wait for it: it runs summarise.py and stops.
run = mt.capsules.run("sales-report")
print(f"Capsule finished: {run.status}\n")

print(files.read_text("/report.md"))
