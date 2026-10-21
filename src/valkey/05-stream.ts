// Exercice : écrire et lire un Stream.
// Lancement : docker compose run --rm app npm run valkey:stream
import { connectValkey } from "../lib/valkey.ts";
import { section } from "../lib/wait.ts";

const valkey = await connectValkey();

async function publishProductUpdated(productId: string) {
  return valkey.xadd("stream:events", [
    ["type", "product.updated"],
    ["productId", productId],
  ]);
}

try {
  // Repart d'un stream vide pour obtenir exactement les deux événements attendus.
  await valkey.del(["stream:events"]);

  section("1-2. Ajouter deux événements (type + productId)");
  console.log(await publishProductUpdated("product:1"));
  console.log(await publishProductUpdated("product:2"));

  section("3-4. Lire le stream depuis 0-0 et afficher le résultat brut");
  const result = await valkey.xread({
    "stream:events": "0-0",
  });
  console.dir(result, { depth: null });

  section("Reprendre après le dernier message lu");
  // Avec GLIDE, chaque stream lu est { key, value } et value associe id → [champ, valeur][].
  const entries = result?.[0]?.value ?? {};
  const lastId = Object.keys(entries).at(-1) ?? "0-0";
  console.log("dernier id traité :", lastId);

  await publishProductUpdated("product:3");
  console.dir(await valkey.xread({ "stream:events": lastId }), { depth: null });
} finally {
  valkey.close();
}
