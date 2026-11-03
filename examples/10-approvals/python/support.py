import sys

from maitento import Maitento

mt = Maitento()

# The tools send the orders-api-key secret that tutorial 9's setup stored, so it must exist before the deploy.
if not mt.secrets.find_by_name("orders-api-key"):
    sys.exit("Run tutorial 9's setup first: it stores the orders-api-key secret.")
mt.deploy("../maitento")


def ask(prompt: str) -> str:
    try:
        return input(prompt)
    except EOFError:
        return ""


message = "Hi, order A-1001 arrived but the blue mug was smashed. Could I get a refund of 12.50 for it?"
print(f"Customer: {message}\n")


# A refund needs your approval: the run waits with status PendingApproval until you decide.
def on_waiting(waiting):
    approval = waiting.pending_approval
    if waiting.status != "PendingApproval" or not approval:
        return

    print(f"The agent wants to call {approval.function_name} with {approval.arguments_json}")
    answer = ask("Approve? (y/n) ")
    if answer.strip().lower().startswith("y"):
        mt.interaction_runs.approve(waiting.id, approval.id)
    else:
        reason = ask("Why not? ")
        mt.interaction_runs.reject(waiting.id, approval.id, reason or "Not approved")


run = mt.interactions.run("support", inputs={"message": message}, on_waiting=on_waiting)

print(f"\nSupport: {run.output}")
