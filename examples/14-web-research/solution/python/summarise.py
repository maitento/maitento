from maitento import Maitento

# The challenge: summarise one page, with web search switched off for this run only.
mt = Maitento()
mt.deploy("../../maitento")

downloads = next((p for p in mt.partitions.list() if p.name == "web-downloads" and p.is_temporary), None)
if downloads is None:
    downloads = mt.partitions.create("web-downloads", is_temporary=True, file_lifetime_hours=24)

run = mt.interactions.run(
    "research",
    inputs={"question": "Summarise https://en.wikipedia.org/wiki/Vasco_da_Gama_Tower in three sentences."},
    web_download_partition_id=downloads.id,
    # With no agent_name, the override applies to every agent in the run. Fetching stays on.
    web_access_overrides=[{"search": False}],
)
print(run.output)

print("\nWhat the agent did:")
for call in run.context.tool_call:
    print(f"- {call.function_name} {call.arguments_json}")
