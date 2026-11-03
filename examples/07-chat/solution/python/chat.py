from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")


# Read what you type, one line at a time.
def ask(prompt: str) -> str:
    try:
        return input(prompt)
    except EOFError:
        return "bye"


# In a real app the person is signed in to your app, and these come from your own user record.
name = ask("Your name: ").strip() or "Guest"
person_id = "3f2c8a51-6d0e-4b8e-9a4b-2f1d7c9e5a10"  # your app's id for this person: any GUID

print('Chat with the assistant. Type "bye" to finish.')


def on_waiting(waiting):
    message = ask(f"\n{name}: ")
    if message.strip().lower() == "bye":
        mt.runs.kill(waiting.id, type="Interaction")
        return
    print("Assistant: ", end="", flush=True)
    # With an API key you may name the author: the name and id are recorded as you give them.
    mt.interaction_runs.add_message(waiting.id, message, author_name=name, author_id=person_id)


run = mt.interactions.run(
    "chat",
    on_token=lambda text, agent: print(text, end="", flush=True),
    on_waiting=on_waiting,
    throw_on_failure=False,
)

# Who said what, as the run recorded it.
print("\nRecorded:")
for m in run.context.human_message:
    print(f"- {m.author.name} ({m.author.id}): {m.message}")

mt.close()
