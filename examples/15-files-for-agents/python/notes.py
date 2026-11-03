import sys

from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")

notes = mt.vfs.find_by_name("notes")
if notes is None:
    sys.exit("Run setup.py first.")

request = sys.argv[1] if len(sys.argv) > 1 else "Add eggs and coffee to my shopping list, then tell me what is on it."

# notesVfsId fills in the file system's id for all three tools. The model never sees it.
run = mt.interactions.run("notes", inputs={"request": request, "notesVfsId": notes.id})
print(run.output)

print("\nWhat the agent did:")
for call in run.context.tool_call:
    print(f"- {call.function_name} {call.arguments_json}")

print("\nThe file now says:\n" + mt.vfs.open("notes").read_text("/shopping.md"))
