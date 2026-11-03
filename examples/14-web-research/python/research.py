import sys

from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")

# Pages the agent reads are kept for a day in a temporary knowledge base. Make one once and reuse it.
partitions = mt.partitions.list()
downloads = next((p for p in partitions if p.name == "web-downloads" and p.is_temporary), None)
if downloads is None:
    downloads = mt.partitions.create("web-downloads", is_temporary=True, file_lifetime_hours=24)

question = sys.argv[1] if len(sys.argv) > 1 else "What is the tallest building in Lisbon, and how tall is it?"
run = mt.interactions.run("research", inputs={"question": question}, web_download_partition_id=downloads.id)
print(run.output)

# Every search and every page read is a tool call in the run.
print("\nWhat the agent did:")
for call in run.context.tool_call:
    print(f"- {call.function_name} {call.arguments_json}")
