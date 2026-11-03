from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")

# No stack named here: the interaction names its own. Run ../../python/customer.py first, to make it.
run = mt.interactions.run(
    "summarise",
    inputs={"text": "The new dashboard loads twice as fast, though the export button moved and took a while to find."},
)
print(run.output)
if run.credential_stack:
    print(f'Ran on stack "{run.credential_stack.stack_name}", chosen at the {run.credential_stack.source}')
