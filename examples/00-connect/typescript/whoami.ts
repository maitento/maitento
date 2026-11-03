import { Maitento } from "@maitento/sdk";

// Reads your API key from MAITENTO_API_KEY.
const mt = new Maitento();

// Who the key belongs to, and which models you can use.
const me = await mt.users.self();
console.log(`Signed in as ${me.user.name} <${me.user.emailAddress}> in ${me.tenant.name}.`);

const models = await mt.models.list();
console.log(`${models.length} models available, for example ${models.slice(0, 3).map((m) => m.name).join(", ")}.`);
