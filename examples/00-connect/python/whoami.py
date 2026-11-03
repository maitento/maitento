from maitento import Maitento

# Reads your API key from MAITENTO_API_KEY.
mt = Maitento()

# Who the key belongs to, and which models you can use.
me = mt.users.self()
print(f"Signed in as {me.user.name} <{me.user.email_address}> in {me.tenant.name}.")

models = mt.models.list()
print(f"{len(models)} models available, for example {', '.join(m.name for m in models[:3])}.")
