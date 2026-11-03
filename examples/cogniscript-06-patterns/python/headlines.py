import sys

from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")

# Run the headlines app: one headline per topic, at most two at a time.
topics = sys.argv[1] if len(sys.argv) > 1 else "electric cars, city farming, space tourism, quantum computing"
run = mt.apps.run("headlines", inputs={"topics": topics})

for line in run.console_outputs:
    print(line.text.rstrip())
print(f"\nReturned: {run.return_value}")
for output in run.outputs:
    print(f'Output "{output.name}": {output.value}')
