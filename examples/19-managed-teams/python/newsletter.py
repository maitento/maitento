import json

from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")

# region: run
# An editor hands work to a writer and a fact checker, then signs off the newsletter.
run = mt.interactions.run("newsletter", inputs={"topic": "why sleep matters"})
# endregion


# region: log
# Each piece of work the editor handed out is a Dispatch call on the run. Its result is the member's reply.
def first_line(text: str | None) -> str:
    return next((line for line in (text or "").splitlines() if line.strip()), "")


for call in run.context.tool_call:
    if call.function_name != "Dispatch":
        continue
    arguments = json.loads(call.arguments_json)
    print(f"Editor -> {arguments['agent']}: {first_line(arguments['message'])[:90]}")
    result = next((r for r in run.context.tool_result if r.tool_call_id == call.tool_call_id), None)
    if result:
        reply = mt.interaction_runs.tool_result(run.id, result.sequence)
        print(f"  {first_line(reply.result)[:100]}")
print(f"\n{run.output}")
# endregion
