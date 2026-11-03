from maitento import Maitento

mt = Maitento()

# A virtual file system for the notes. It lives in your namespace, and its files stay until you delete them.
notes = mt.vfs.find_by_name("notes") or mt.vfs.create("notes")

# Start from a fresh shopping list each time you run this.
files = mt.vfs.open("notes")
files.write_text("/shopping.md", "# Shopping\n\n- milk\n- bread\n")

print(files.read_text("/shopping.md"))
print(f"The notes file system is ready. Its id: {notes.id}")
