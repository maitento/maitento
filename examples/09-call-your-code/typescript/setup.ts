import { Maitento } from "@maitento/sdk";

const apiKey = process.env.ORDERS_API_KEY;
if (!apiKey) throw new Error("Set ORDERS_API_KEY first: the same value your orders API checks.");

const mt = new Maitento();

// Stores a value as a Maitento secret, or replaces the value of the one with that name.
async function storeSecret(name: string, value: string) {
  const existing = await mt.secrets.findByName(name);
  if (existing) await mt.secrets.update(existing.id, { name, value });
  else await mt.secrets.create({ name, value });
}

// The key your orders API expects. The get-order tool sends it in the X-Api-Key header.
await storeSecret("orders-api-key", apiKey);
// The second shop's key, for the end of the tutorial.
if (process.env.SECOND_SHOP_API_KEY) await storeSecret("second-shop-api-key", process.env.SECOND_SHOP_API_KEY);

// The secret has to exist before the tools that use it are deployed.
await mt.deploy("../maitento");
console.log("Secrets stored and the support agent deployed.");
