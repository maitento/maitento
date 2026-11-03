import os

from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")

# One customer, Acme, brings its own DeepSeek key. Everything made for it carries its tag.
customer = "acme"
key = os.environ.get("CUSTOMER_DEEPSEEK_API_KEY")
if not key:
    raise SystemExit("Set CUSTOMER_DEEPSEEK_API_KEY to the customer's DeepSeek key.")

# Start from nothing: remove what an earlier run of this script made.
for old in mt.credential_stacks.list():
    if old.name == f"customer-{customer}":
        mt.credential_stacks.delete(old.id)
mt.credentials.delete_by_tag(customer)

# The customer's key, as a credential tagged with the customer.
credential = mt.credentials.create(
    name=f"{customer} DeepSeek",
    provider="DeepSeek",
    keys=[{"value": key}],
    tag=customer,
)
print(f'Credential "{credential.name}", key ending {credential.keys[0].key_hint}')

# A stack for the customer, holding just that credential.
stack = mt.credential_stacks.create(name=f"customer-{customer}", entries=[{"credential_id": credential.id}])

# The customer's run, on the customer's stack.
run = mt.interactions.run(
    "summarise",
    inputs={"text": "Our order arrived two days late and one box was damaged, but support sent a replacement at once."},
    credential_stack=stack.name,
)
print(run.output)
if run.credential_stack:
    print(f'Ran on stack "{run.credential_stack.stack_name}", chosen at the {run.credential_stack.source}')
