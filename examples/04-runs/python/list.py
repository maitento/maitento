from maitento import Maitento
from maitento.models import ProcessSummary

mt = Maitento()


# One line per run: when it started, what it ran, and how it is doing.
def show(run: ProcessSummary) -> None:
    print(f"{run.date_created:%Y-%m-%dT%H:%M:%S}  {run.definition_name}  {run.status}")


# Runs of every kind, newest first, a page at a time. Here: the runs in your namespace, five to a page.
page = mt.runs.list(namespace=mt.namespace, limit=5)
for run in page.items:
    show(run)

# The next page starts where this one ended. next_page() is None after the last one.
next_page = page.next_page()
if next_page:
    print("--- next page")
    for run in next_page.items:
        show(run)
