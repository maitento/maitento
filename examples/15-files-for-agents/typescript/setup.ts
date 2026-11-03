import { Maitento } from "@maitento/sdk";

const mt = new Maitento();

// A virtual file system for the notes. It lives in your namespace, and its files stay until you delete them.
const notes = (await mt.vfs.findByName("notes")) ?? (await mt.vfs.create({ name: "notes" }));

// Start from a fresh shopping list each time you run this.
const files = mt.vfs.open("notes");
await files.writeText("/shopping.md", "# Shopping\n\n- milk\n- bread\n");

console.log(await files.readText("/shopping.md"));
console.log(`The notes file system is ready. Its id: ${notes.id}`);
