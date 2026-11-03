from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")

# A third input, language, is optional like mood: leave it out and the haiku is in English.
run = mt.interactions.run(
    "haiku", inputs={"topic": "autumn rain", "mood": "calm", "language": "Portuguese"}
)
print(run.output)
