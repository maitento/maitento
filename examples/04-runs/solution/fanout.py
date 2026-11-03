# Tutorial 4's challenge: start three runs at once, then wait for all of them.
import time

from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")

# start() doesn't wait, so all three runs are handed to Maitento straight away.
topics = ["why the sky is blue", "how bees make honey", "what a black hole is"]
ids = [mt.interactions.start("explain", inputs={"topic": topic}).id for topic in topics]
print(f"Started {len(ids)} runs")

# One call reads all three: runs.list() with their ids. Say how many have ended whenever that changes.
ended = 0
while ended < len(ids):
    time.sleep(1)
    page = mt.runs.list(ids=ids)
    now = sum(1 for run in page.items if run.state == "Terminal")
    if now != ended:
        print(f"{now} of {len(ids)} ended")
    ended = now

for topic, run_id in zip(topics, ids):
    run = mt.interaction_runs.get(run_id)
    print(f"{topic}: {run.status}, {len(run.output or '')} characters")
