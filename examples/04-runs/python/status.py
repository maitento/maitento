import sys

from maitento import Maitento

if len(sys.argv) < 2:
    sys.exit("Pass the id of a run: python status.py <run id>")
run_id = sys.argv[1]

mt = Maitento()

# The run as it is right now.
run = mt.interaction_runs.get(run_id)
print(f"Run {run.id}: {run.status}")

if run.status == "Finished":
    # runs.get() gives a short summary of any kind of run, with the tokens it used.
    tokens = mt.runs.get(run_id).tokens
    assert tokens is not None  # interaction runs always count them
    seconds = run.execution_time.total_seconds()
    print(f"Worked for {seconds:.1f}s, using {tokens.input} tokens in and {tokens.output} out.")
    # The start of the answer.
    print(f"{(run.output or '')[:160]}…")
elif run.status in ("Error", "Killed"):
    print(f"It stopped: {run.failure_details}")
