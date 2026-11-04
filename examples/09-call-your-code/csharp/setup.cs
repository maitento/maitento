#:package Maitento.Sdk@26.11.1

using Maitento.Sdk;

var apiKey = Environment.GetEnvironmentVariable("ORDERS_API_KEY");
if (string.IsNullOrEmpty(apiKey))
    throw new InvalidOperationException("Set ORDERS_API_KEY first: the same value your orders API checks.");

await using var mt = MaitentoClient.CreateFromEnvironment();

// Stores a value as a Maitento secret, or replaces the value of the one with that name.
async Task StoreSecret(string name, string value)
{
    var existing = await mt.Secrets.GetByNameAsync(name);
    if (existing != null) await mt.Secrets.UpdateAsync(existing.Id, name, value);
    else await mt.Secrets.CreateAsync(name, value);
}

// The key your orders API expects. The get-order tool sends it in the X-Api-Key header.
await StoreSecret("orders-api-key", apiKey);
// The second shop's key, for the end of the tutorial.
if (Environment.GetEnvironmentVariable("SECOND_SHOP_API_KEY") is { Length: > 0 } secondShopKey)
    await StoreSecret("second-shop-api-key", secondShopKey);

// The secret has to exist before the tools that use it are deployed.
await mt.DeployAsync("../maitento");
Console.WriteLine("Secrets stored and the support agent deployed.");
