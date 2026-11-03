from maitento import Maitento

# An approvals queue: every support run waiting for a person to approve a tool call, one at a time.
mt = Maitento()


def ask(prompt: str) -> str:
    try:
        return input(prompt)
    except EOFError:
        return ""


for summary in mt.runs.list(types=["Interaction"], statuses=["PendingApproval"]):
    if summary.definition_name != "support":
        continue
    run = mt.interaction_runs.get(summary.id)
    approval = run.pending_approval
    if not approval:
        continue

    print(f"Run {run.id}: {approval.agent_name} wants to call {approval.function_name} with {approval.arguments_json}")
    if ask("Approve? (y/n) ").strip().lower().startswith("y"):
        mt.interaction_runs.approve(run.id, approval.id)
    else:
        reason = ask("Why not? ")
        mt.interaction_runs.reject(run.id, approval.id, reason or "Not approved")
print("Nothing else is waiting.")
