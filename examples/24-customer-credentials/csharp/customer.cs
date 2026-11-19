#:package Maitento.Sdk@26.11.2

using Maitento.Entities.Credentials;
using Maitento.Entities.Database;
using Maitento.Entities.Interactions;
using Maitento.Entities.ModelKeys;
using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

// One customer, Acme, brings its own DeepSeek key. Everything made for it carries its tag.
const string customer = "acme";
var key = Environment.GetEnvironmentVariable("CUSTOMER_DEEPSEEK_API_KEY")
    ?? throw new InvalidOperationException("Set CUSTOMER_DEEPSEEK_API_KEY to the customer's DeepSeek key.");

// Start from nothing: remove what an earlier run of this script made.
foreach (var old in await mt.CredentialStacks.ListAsync())
    if (old.Name == $"customer-{customer}")
        await mt.CredentialStacks.DeleteAsync(old.Id);
await mt.Credentials.DeleteByTagAsync(customer);

// The customer's key, as a credential tagged with the customer.
var credential = await mt.Credentials.CreateAsync(new ModelCredentialRequest
{
    Name = $"{customer} DeepSeek",
    Provider = ModelKeyProvider.DeepSeek,
    Keys = [new ModelCredentialKeyRequest { Value = key }],
    Tag = customer,
});
Console.WriteLine($"Credential \"{credential.Name}\", key ending {credential.Keys[0].KeyHint}");

// A stack for the customer, holding just that credential.
var stack = await mt.CredentialStacks.CreateAsync(new CredentialStackRequest
{
    Name = $"customer-{customer}",
    Entries = [new CredentialStackEntry { CredentialId = credential.Id }],
});

// The customer's run, on the customer's stack.
var run = await mt.Interactions.RunAsync("summarise", new InteractionProcessStartRequest
{
    Inputs = [new NameValuePair("text", "Our order arrived two days late and one box was damaged, but support sent a replacement at once.")],
    CredentialStack = stack.Name,
});
Console.WriteLine(run.Output);
Console.WriteLine($"Ran on stack \"{run.CredentialStack?.StackName}\", chosen at the {run.CredentialStack?.Source}");
