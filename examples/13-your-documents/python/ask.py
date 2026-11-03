import sys

from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")

handbook = next((p for p in mt.partitions.list() if p.name == "handbook" and not p.is_temporary), None)
if handbook is None:
    sys.exit("Run setup.py first.")

question = sys.argv[1] if len(sys.argv) > 1 else (
    "I didn't use all my holiday last year. How much can I carry over, and until when?"
)

# partitionId goes straight into the search tool's request. The model only writes the query.
run = mt.interactions.run("ask-handbook", inputs={"question": question, "partitionId": handbook.id})
print(run.output)
