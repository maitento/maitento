from maitento import Maitento

# The challenge: a delete-note tool. Deploy the tutorial's project, then this folder's three files, which use its tools.
mt = Maitento()
mt.deploy("../../maitento")
mt.deploy("../maitento")

notes = mt.vfs.find_by_name("notes") or mt.vfs.create("notes")
files = mt.vfs.open("notes")
files.write_text("/old-ideas.md", "# Old ideas\n\n- a cat cafe\n")

run = mt.interactions.run("tidy-notes", inputs={"request": "Delete my old ideas note.", "notesVfsId": notes.id})
print(run.output)

print(f"\nDoes /old-ideas.md still exist? {files.exists('/old-ideas.md')}")
