#:package Maitento.Sdk@26.11.1

using Maitento.Sdk;

// Reads your API key from MAITENTO_API_KEY.
await using var mt = MaitentoClient.CreateFromEnvironment();

// Who the key belongs to, and which models you can use.
var me = await mt.Users.GetSelfAsync();
Console.WriteLine($"Signed in as {me.User.Name} <{me.User.EmailAddress}> in {me.Tenant.Name}.");

var models = await mt.AiModels.GetAllAsync();
var examples = string.Join(", ", models.Take(3).Select(m => m.Name));
Console.WriteLine($"{models.Length} models available, for example {examples}.");
