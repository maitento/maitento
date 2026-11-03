import sys

from maitento import Maitento, transcript

# Which shop the customer is writing to: the name of the secret holding its key.
secret_name = sys.argv[1] if len(sys.argv) > 1 else "second-shop-api-key"

mt = Maitento()
# A run takes the secret's id: never its value, which stays in Maitento.
secret = mt.secrets.get_by_name(secret_name)

message = "Hi, has my oak bookshelf (order B-2001) shipped yet?"
print(f"Customer ({secret_name}): {message}\n")

run = mt.interactions.run("support-any-shop", inputs={"message": message, "shopKey": secret.id})

for entry in transcript(run):
    if entry.kind == "tool_result":
        print(f"Tool result: {mt.interaction_runs.tool_result(run.id, entry.sequence).result}")
print(f"\nSupport: {run.output}")
