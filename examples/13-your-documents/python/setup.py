import os
import sys
import time

from maitento import Maitento

mt = Maitento()

# A knowledge base for the handbook. Maitento's API calls a knowledge base a partition.
partitions = mt.partitions.list()
handbook = next((p for p in partitions if p.name == "handbook" and not p.is_temporary), None)
if handbook is None:
    handbook = mt.partitions.create("handbook")

# Upload each document. Maitento reads its text. Uploading the same file again keeps one copy.
for name in sorted(os.listdir("../knowledge")):
    mt.files.upload(handbook.id, f"../knowledge/{name}")
    print(f"Uploaded {name}")

# Indexing turns each document into embeddings, in the background. Wait until every file can be searched.
for attempt in range(1, 31):
    files = list(mt.partitions.files(handbook.id))
    waiting = len([f for f in files if not f.is_vector_generated])
    if files and waiting == 0:
        break
    if attempt == 30:
        # A file that can't be indexed until you act says why.
        failure = next((f.indexing_failure for f in files if f.indexing_failure), None)
        why = failure.message if failure else "Indexing needs an OpenAI model key."
        sys.exit(f"{waiting} files are still not indexed after a minute. {why}")
    time.sleep(2)
print(f"The handbook is indexed. Knowledge base id: {handbook.id}")
