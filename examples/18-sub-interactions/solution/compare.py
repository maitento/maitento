from maitento import Maitento

mt = Maitento()
mt.deploy("./maitento")

# The lead researcher starts a country-facts and a country-dish run per country, all at once.
run = mt.interactions.run("compare-countries", inputs={"countries": "Portugal, Japan, Kenya"})
print(run.output)

print(f"\nSub-interactions of {run.id}:")
for summary in mt.runs.list(parent_process_id=run.id).items:
    child = mt.interaction_runs.get(summary.id)
    country = next((i.value for i in child.inputs if i.name == "country"), None)
    print(f"- {summary.definition_name} for {country}: {summary.status}")
