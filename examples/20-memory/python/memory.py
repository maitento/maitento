import sys

from maitento import Maitento

mt = Maitento()
user_name = sys.argv[1] if len(sys.argv) > 1 else "Ana"

# The interaction made one loom per person, named "<interaction>/<seat>/<input value>".
namespace = mt.namespaces.find(mt.namespace or "tutorials")
looms = mt.looms.list(namespace.id) if namespace else []
loom = next((l for l in looms if l.name == f"wren-chat/Wren/{user_name}"), None)
if not loom:
    sys.exit(f"Wren has no memory of {user_name} yet.")

# region: threads
# Each thing Wren remembers is a thread.
print(f"Threads in {loom.name}:")
for thread in mt.looms.threads(loom.id):
    print(f"- [{thread.kind}] {thread.content}")
# endregion

# region: tapestry
# What Wren will wake up knowing in its next conversation with this person: the "What You Know" in its instructions.
tapestry = mt.looms.tapestry(loom.id, subjects=[user_name], agent_name="Wren")
print(f"\n{tapestry.text}")
# endregion
