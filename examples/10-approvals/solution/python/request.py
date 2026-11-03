from maitento import Maitento

# Starts a refund request and returns at once. The run waits for a person in the approvals queue.
mt = Maitento()
message = "Hi, the tea sampler in order A-1001 was missing two of its teas. Could I get 5.00 back?"
run = mt.interactions.start("support", inputs={"message": message})
print(f"Started run {run.id}")
