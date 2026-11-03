from maitento import Maitento, transcript

mt = Maitento()
# Both tools send the orders-api-key secret that the tutorial's setup stored.
mt.deploy("../maitento")

message = "Hi, when will my desk lamp (order A-1002) arrive?"
print(f"Customer: {message}\n")

run = mt.interactions.run("support", inputs={"message": message})

for entry in transcript(run):
    if entry.kind == "tool_call":
        print(f"Tool call: {entry.item.function_name} {entry.item.arguments_json}")
print(f"\nSupport: {run.output}")
