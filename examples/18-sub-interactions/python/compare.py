from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")

# region: run
# The lead researcher starts one sub-interaction per country, in parallel, then compares the answers.
run = mt.interactions.run("compare-countries", inputs={"countries": "Portugal, Japan, Kenya"})
print(run.output)
# endregion

# region: lineage
# Every run the lead researcher started names this run as its parent.
print(f"\nSub-interactions of {run.id}:")
for summary in mt.runs.list(parent_process_id=run.id).items:
    child = mt.interaction_runs.get(summary.id)
    country = next((i.value for i in child.inputs if i.name == "country"), None)
    why = f" ({summary.failure_summary})" if summary.failure_summary else ""
    print(f"- {summary.definition_name} for {country}: {summary.status}{why}")
# endregion
