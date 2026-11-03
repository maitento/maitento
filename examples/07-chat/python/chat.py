from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")


# Read what you type, one line at a time.
def ask(prompt: str) -> str:
    try:
        return input(prompt)
    except EOFError:
        return "bye"


print('Chat with the assistant. Type "bye" to finish.')


# The person speaks first, so the run waits for you straight away. Every time it waits, read a line and send it.
# The assistant's replies stream in through on_token.
def on_waiting(run):
    message = ask("\nYou: ")
    if message.strip().lower() == "bye":
        mt.runs.kill(run.id, type="Interaction")
        return
    print("Assistant: ", end="", flush=True)
    # No author named, so the message is recorded as the API key's user: you.
    mt.interaction_runs.add_message(run.id, message)


mt.interactions.run(
    "chat",
    on_token=lambda text, agent: print(text, end="", flush=True),
    on_waiting=on_waiting,
    # Saying bye stops the run, which is not a failure here.
    throw_on_failure=False,
)

mt.close()
