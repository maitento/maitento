from maitento import Maitento, transcript

mt = Maitento()
mt.deploy("../maitento")

run = mt.interactions.run("run-advice", inputs={"city": "Lisbon"})

# The agent should call both tools: the weather, and the air.
for entry in transcript(run):
    if entry.kind == "tool_call":
        print(f"Tool call: {entry.item.function_name} {entry.item.arguments_json}")
print(f"\n{run.output}")
