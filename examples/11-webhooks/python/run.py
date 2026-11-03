from maitento import Maitento

# Deploys a small interaction and runs it. Your receiver hears about the run as it changes.
mt = Maitento()
mt.deploy("../maitento")

run = mt.interactions.run("fun-fact", inputs={"topic": "octopuses"})
print(f"Run {run.id} ended {run.status}: {run.output}")
