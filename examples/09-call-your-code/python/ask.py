from maitento import Maitento, transcript

mt = Maitento()

message = "Hi, I ordered a desk lamp last week (order A-1002). Has it shipped yet?"
print(f"Customer: {message}\n")

# The agent looks the order up on your server before it answers.
run = mt.interactions.run("support", inputs={"message": message})

# What the agent did: each tool call, and what your server answered.
for entry in transcript(run):
    if entry.kind == "tool_call":
        print(f"Tool call: {entry.item.function_name} {entry.item.arguments_json}")
    elif entry.kind == "tool_result":
        print(f"Tool result: {mt.interaction_runs.tool_result(run.id, entry.sequence).result}")
print(f"\nSupport: {run.output}")
