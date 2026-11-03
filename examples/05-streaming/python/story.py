from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")

# on_token gets the story word by word, as it's written: run() opens Maitento's live event stream for it.
run = mt.interactions.run(
    "story",
    inputs={"subject": "a hedgehog who is afraid of the dark"},
    on_token=lambda text, agent: print(text, end="", flush=True),
)

# The streamed text was for showing progress. The finished run is the record.
print(f"\n\n[{run.status}: the output has {len(run.output or '')} characters]")

mt.close()
