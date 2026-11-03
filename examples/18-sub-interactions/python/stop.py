from maitento import Maitento

mt = Maitento()
mt.events.connect()

# Run the comparison again, and stop the first sub-interaction as soon as the lead researcher has started it.
stopped: list[str] = []


def on_update(current):
    children = current.swarm.children if current.swarm else []
    if children and not stopped:
        stopped.append(children[0].process_id)
        mt.runs.kill(children[0].process_id, type="Interaction")
        print(f"Stopped sub-interaction {children[0].process_id}\n")


run = mt.interactions.run(
    "compare-countries",
    inputs={"countries": "Portugal, Japan, Kenya"},
    on_update=on_update,
)
print(run.output)

mt.close()
