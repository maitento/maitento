#:package Maitento.Sdk@26.11.2

using Maitento.Sdk;

// The challenge: deploy this folder's app, which takes a fourth input, discount.
await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

var item = args.Length > 0 ? args[0] : "Notebook";
var price = args.Length > 1 ? args[1] : "4.5";
var quantity = args.Length > 2 ? args[2] : "3";
var discount = args.Length > 3 ? args[3] : "10";
var run = await mt.Apps.RunAsync("discount-receipt", new Dictionary<string, string>
{
    ["item"] = item, ["price"] = price, ["quantity"] = quantity, ["discount"] = discount,
});
foreach (var line in run.ConsoleOutputs) Console.WriteLine(line.Text.TrimEnd());
Console.WriteLine($"\nReturned: {run.ReturnValue}");
