import json
import os
import sys

from maitento import Maitento

url = os.environ.get("REPO_URL")
credentials = os.environ.get("REPO_CREDENTIALS")
if not url or not credentials:
    sys.exit("Set REPO_URL and REPO_CREDENTIALS first.")

default_request = "Add a --times option that prints the greeting that many times, with a test for it."
request = sys.argv[1] if len(sys.argv) > 1 else default_request
branch = sys.argv[2] if len(sys.argv) > 2 else "maitento/times-with-docs"

mt = Maitento()
# This folder's project: the tested-change-docs pipeline, whose hook adds a docs phase once the tests pass.
mt.deploy("./maitento")

run = mt.pipelines.run(
    "tested-change-docs",
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

for phase in run.phases:
    steps = [f"{s.agent_name} {s.step_name}{', committed' if s.did_commit else ''}" for s in phase.steps]
    decision = f" -> {json.loads(phase.hook_post_output)['decision']}" if phase.hook_post_output else ""
    print(f"{phase.phase_name}: {phase.status} ({'; '.join(steps)}){decision}")
print(f"\nPipeline {run.status}. The work is on the {branch} branch.")
