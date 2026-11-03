from maitento import Maitento

mt = Maitento()

# Deploys the greeter (unchanged, so it stays at its current version) and the new joke interaction.
mt.deploy("../maitento")

run = mt.interactions.run("joke")
print(run.output)
