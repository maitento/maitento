import sys

from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")

# Ask your own question with: python helpdesk.py "your question"
question = sys.argv[1] if len(sys.argv) > 1 else "When should I plant tulip bulbs?"

# The router hands the question to the specialist whose subject fits.
run = mt.interactions.run("ask-help-desk", inputs={"question": question})

# Each choice the router made is kept on the run: which agent took the turn, and why.
for decision in run.routing_decisions:
    chosen = mt.agents.get(decision.chosen.id)
    fallback = " (fallback)" if decision.is_fallback else ""
    print(f"Router chose {chosen.name}{fallback}: {decision.reason}\n")
print(run.output)
