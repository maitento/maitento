from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")

# The interaction declares two inputs: topic (required) and mood (optional).
run = mt.interactions.run("haiku", inputs={"topic": "autumn rain", "mood": "calm"})
print(run.output)
