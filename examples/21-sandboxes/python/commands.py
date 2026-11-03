from maitento import Maitento

# Run sandbox.py first: the workbench capsule mounts the sales-data file system it creates.
mt = Maitento()
mt.deploy("../maitento")

# Start the workbench capsule. It stays up, so it can take commands one at a time.
capsule = mt.capsules.start("workbench")

# Run a command as the sandbox user, and wait for it to end. Each argument reaches the program as one word.
listing = mt.capsule_runs.exec_and_wait(capsule.id, "ls", ["-l", "/tmp/data"], run_as_user="sandbox")
print(f"exit code {listing.exit_code}\n{listing.output_standard}")

# A command that fails is a result too. The mounted file system belongs to the default user, so sandbox can't read it.
denied = mt.capsule_runs.exec_and_wait(capsule.id, "cat", ["/mnt/data/sales.csv"], run_as_user="sandbox")
print(f"exit code {denied.exit_code}\n{denied.output_error}")

mt.capsule_runs.terminate(capsule.id)
