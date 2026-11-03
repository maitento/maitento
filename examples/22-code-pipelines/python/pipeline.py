import os
import sys

from maitento import Maitento

# The repository to work on, and credentials that can push to it, e.g. "x-access-token:<github token>".
url = os.environ.get("REPO_URL")
credentials = os.environ.get("REPO_CREDENTIALS")
if not url or not credentials:
    sys.exit("Set REPO_URL and REPO_CREDENTIALS first.")

mt = Maitento()
mt.deploy("../maitento")

run = mt.pipelines.run(
    "add-feature",
    inputs={"request": "Add a --shout flag that prints the greeting in capital letters, with a test for it."},
    repos=[{
        "type": "http",
        "name": "app",
        "url": url,
        "credentials": credentials,
        "branch_source": "main",
        "branch_work": "maitento/add-shout-flag",
    }],
)
print(f"Pipeline {run.status}. The work is on the maitento/add-shout-flag branch.\n")

diff = mt.pipeline_runs.raw_diff(run.id)
print(diff.diff_raw if diff else "(no changes)")
