import sys

from maitento import Maitento

mt = Maitento()
handbook = next((p for p in mt.partitions.list() if p.name == "handbook" and not p.is_temporary), None)
if handbook is None:
    sys.exit("Run setup.py first.")

query = sys.argv[1] if len(sys.argv) > 1 else "Can I take unused holiday into next year?"
print(f"Searching for: {query}\n")

# The closest match comes first. Each result is a passage, with the name of the file it came from.
results = mt.files.search(handbook.id, query)
for i, result in enumerate(results, start=1):
    print(f"{i}. {result.name}: {' '.join(result.text.split())[:70]}…")
