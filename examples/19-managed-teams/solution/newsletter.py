import json

from maitento import Maitento

mt = Maitento()
mt.deploy("./maitento")

# The editor now has a headline writer too.
run = mt.interactions.run("newsletter", inputs={"topic": "why sleep matters"})

members = [json.loads(c.arguments_json)["agent"] for c in run.context.tool_call if c.function_name == "Dispatch"]
print(f"The editor handed out work {len(members)} times: {', '.join(members)}\n")
print(run.output)
