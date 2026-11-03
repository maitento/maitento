import sys

from maitento import Maitento, transcript

# The run, not the model, decides the unit: celsius, unless you pass another on the command line.
temperature_unit = sys.argv[1] if len(sys.argv) > 1 else "celsius"

mt = Maitento()
mt.deploy("../maitento")

run = mt.interactions.run("weather", inputs={"city": "Lisbon", "temperatureUnit": temperature_unit})

# What the agent did: each tool call it made, and what came back.
for entry in transcript(run):
    if entry.kind == "tool_call":
        print(f"Tool call: {entry.item.function_name} {entry.item.arguments_json}")
    elif entry.kind == "tool_result":
        print(f"Tool result: {mt.interaction_runs.tool_result(run.id, entry.sequence).result}")
print(f"\n{run.output}")
