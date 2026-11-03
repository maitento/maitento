from maitento import Maitento

# The challenge: deploy the tutorial's project, then this folder's app and interaction, which use its agent.
mt = Maitento()
mt.deploy("../../maitento")
mt.deploy("../maitento")

run = mt.apps.run("best-tagline", inputs={"product": "a reusable bamboo coffee cup"})
for line in run.console_outputs:
    print(line.text.rstrip())
print(f"\nReturned: {run.return_value}")
