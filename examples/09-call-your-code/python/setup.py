import os
import sys

from maitento import Maitento

api_key = os.environ.get("ORDERS_API_KEY")
if not api_key:
    sys.exit("Set ORDERS_API_KEY first: the same value your orders API checks.")

mt = Maitento()


def store_secret(name: str, value: str) -> None:
    """Stores a value as a Maitento secret, or replaces the value of the one with that name."""
    existing = mt.secrets.find_by_name(name)
    if existing:
        mt.secrets.update(existing.id, name=name, value=value)
    else:
        mt.secrets.create(name, value)


# The key your orders API expects. The get-order tool sends it in the X-Api-Key header.
store_secret("orders-api-key", api_key)
# The second shop's key, for the end of the tutorial.
second_shop_key = os.environ.get("SECOND_SHOP_API_KEY")
if second_shop_key:
    store_secret("second-shop-api-key", second_shop_key)

# The secret has to exist before the tools that use it are deployed.
mt.deploy("../maitento")
print("Secrets stored and the support agent deployed.")
