from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")

# on_update gets each new state of the run, and a run changes often. Print its status only when that changes.
last_status = ""


def on_update(update):
    global last_status
    if update.status == last_status:
        return
    last_status = update.status
    print(f"\n[{update.status}]", flush=True)


run = mt.interactions.run(
    "story",
    inputs={"subject": "a hedgehog who is afraid of the dark"},
    on_token=lambda text, agent: print(text, end="", flush=True),
    on_update=on_update,
)

print(f"\n[the output has {len(run.output or '')} characters]")

mt.close()
