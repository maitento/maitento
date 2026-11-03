import json
import os
import sys

from maitento import Maitento

# The repository to work on, and credentials that can push to it, e.g. "x-access-token:<github token>".
url = os.environ.get("REPO_URL")
credentials = os.environ.get("REPO_CREDENTIALS")
if not url or not credentials:
    sys.exit("Set REPO_URL and REPO_CREDENTIALS first.")

# The change to make, and the branch to push it to.
default_request = "Add a --times option that prints the greeting that many times, with a test for it."
request = sys.argv[1] if len(sys.argv) > 1 else default_request
branch = sys.argv[2] if len(sys.argv) > 2 else "maitento/add-times-option"

mt = Maitento()
mt.deploy("../maitento")

run = mt.pipelines.run(
    "tested-change",
    inputs={"request": request},
    repos=[{
        "type": "http",
        "name": "app",
        "url": url,
        "credentials": credentials,
        "branch_source": "main",
        "branch_work": branch,
    }],
)

# region: phases
# Every phase that ran, including the ones the hook added, and what its post hook decided.
for phase in run.phases:
    steps = [f"{s.agent_name} {s.step_name}{', committed' if s.did_commit else ''}" for s in phase.steps]
    decision = f" -> {json.loads(phase.hook_post_output)['decision']}" if phase.hook_post_output else ""
    print(f"{phase.phase_name}: {phase.status} ({'; '.join(steps)}){decision}")

variables = {v.name: v.value for v in run.variables or []}
print(f"\nTests passed: {variables.get('testsPassed')}")
report = (variables.get("testReport") or "").strip().splitlines()
print(f"The last test report ends: {report[-1] if report else ''}")
print(f"\nPipeline {run.status}. The work is on the {branch} branch.")
# endregion
