from maitento import Maitento

# Reads your API key and namespace from MAITENTO_API_KEY and MAITENTO_NAMESPACE.
mt = Maitento()

# Send the agent and the interaction in ../maitento to Maitento.
mt.deploy("../maitento")

# Start the "hello" interaction and wait for its answer.
run = mt.interactions.run("hello")
print(run.output)
