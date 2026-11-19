#:package Maitento.Sdk@26.11.2

using Maitento.Entities.Capsules;
using Maitento.Sdk;

// Run sandbox.cs first: the workbench capsule mounts the sales-data file system it creates.
await using var mt = MaitentoClient.CreateFromEnvironment();
var ns = mt.DefaultNamespace ?? "tutorials";
await mt.DeployAsync("../maitento", ns);

// Start the workbench capsule. It stays up, so it can take commands one at a time.
var capsule = await mt.CapsuleProcesses.StartAsync(ns, "workbench", new CapsuleProcessStartRequest());

// Run a command as the sandbox user, and wait for it to end. Each argument reaches the program as one word.
var listing = await mt.CapsuleProcesses.RunCommandAndWaitAsync(capsule.Id, new CapsuleProcessRunCommandRequest
{
    Command = "ls",
    Arguments = ["-l", "/tmp/data"],
    RunAsUser = "sandbox",
});
Console.WriteLine($"exit code {listing.ExitCode}\n{listing.OutputStandard}");

// A command that fails is a result too. The mounted file system belongs to the default user, so sandbox can't read it.
var denied = await mt.CapsuleProcesses.RunCommandAndWaitAsync(capsule.Id, new CapsuleProcessRunCommandRequest
{
    Command = "cat",
    Arguments = ["/mnt/data/sales.csv"],
    RunAsUser = "sandbox",
});
Console.WriteLine($"exit code {denied.ExitCode}\n{denied.OutputError}");

await mt.CapsuleProcesses.TerminateAsync(capsule.Id);
