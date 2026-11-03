import sys

from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")
mt.events.connect()


def ask(prompt: str) -> str:
    try:
        return input(prompt)
    except EOFError:
        return "bye"


# Wren keeps a separate memory for each person, chosen by the userName input.
user_name = sys.argv[1] if len(sys.argv) > 1 else ask("Your name: ")
print(f'Talking to Wren as {user_name}. Type "bye" to finish.')


def on_waiting(run):
    message = ask("\nYou: ")
    if message.strip().lower() == "bye":
        mt.runs.kill(run.id, type="Interaction")
        return
    print("Wren: ", end="", flush=True)
    mt.interaction_runs.add_message(run.id, message, author_name=user_name)


mt.interactions.run(
    "wren-chat",
    inputs={"userName": user_name},
    on_token=lambda text, agent: print(text, end="", flush=True),
    on_waiting=on_waiting,
    throw_on_failure=False,
)

mt.close()
