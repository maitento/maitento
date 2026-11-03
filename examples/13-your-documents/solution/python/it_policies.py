import sys
import time

from maitento import Maitento

# The challenge: the same assistant, over a second knowledge base. The project doesn't change.
mt = Maitento()
mt.deploy("../../maitento")

it_policies = next((p for p in mt.partitions.list() if p.name == "it-policies" and not p.is_temporary), None)
if it_policies is None:
    it_policies = mt.partitions.create("it-policies")
mt.files.upload(it_policies.id, "../knowledge/it-security.md")

# Wait until the document is indexed.
for attempt in range(1, 31):
    files = list(mt.partitions.files(it_policies.id))
    if files and all(f.is_vector_generated for f in files):
        break
    if attempt == 30:
        sys.exit("The document is still not indexed after a minute.")
    time.sleep(2)

# The same interaction as before. Only the knowledge base in partitionId is different.
run = mt.interactions.run(
    "ask-handbook",
    inputs={"question": "How often do I have to change my password?", "partitionId": it_policies.id},
)
print(run.output)
