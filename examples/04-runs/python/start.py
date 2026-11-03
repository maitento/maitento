from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")

# start() returns as soon as Maitento has the run. It doesn't wait for the answer.
run = mt.interactions.start("explain", inputs={"topic": "why the sky is blue"})

print(f"Started run {run.id}: {run.status}")
print(f"Check on it with: python status.py {run.id}")
