// Valkey : modéliser la marketplace en clés (et constater ses limites).
// Lancement : docker compose run --rm app npm run valkey:modelisation
import { connectValkey, hashToObject } from "../lib/valkey.ts";
import { section } from "../lib/wait.ts";

const valkey = await connectValkey();

try {
  // Rend le script rejouable : RPUSH ajouterait sinon des doublons à chaque exécution.
  await valkey.del([
    "product:1",
    "stock:product:1",
    "product:1:categories",
    "product:1:commands",
    "command:1",
    "command:2",
    "command-line:1",
    "command-line:2",
    "command-line:3",
    "command:1:lines",
    "command:2:lines",
    "customer:1:commands",
  ]);

  section("Stocker un produit : Hash + String séparée pour le stock");
  // hset : stocke plusieurs champs sous une même clé.
  await valkey.hset("product:1", {
    id: "product-1",
    name: "Laptop Pro 14",
    price: "1499",
  });
  // set : le stock est séparé car il change souvent.
  await valkey.set("stock:product:1", "12");

  section("Relier un produit à ses catégories : Set");
  await valkey.sadd("product:1:categories", ["category:computers", "category:accessories"]);

  section("Stocker les commandes et leurs lignes : Hash + List");
  await valkey.hset("command:1", {
    id: "command-1",
    customerId: "customer:1",
    status: "paid",
    createdAt: "1756713600",
  });
  await valkey.hset("command:2", {
    id: "command-2",
    customerId: "customer:1",
    status: "pending",
    createdAt: "1756801800",
  });
  // productName est un snapshot au moment de l'achat.
  await valkey.hset("command-line:1", { productId: "product:1", productName: "Laptop Pro 14", quantity: "1", unitPrice: "1499" });
  await valkey.hset("command-line:2", { productId: "product:2", productName: "Clavier mécanique", quantity: "1", unitPrice: "129" });
  await valkey.hset("command-line:3", { productId: "product:3", productName: "Souris verticale", quantity: "2", unitPrice: "59" });
  await valkey.rpush("command:1:lines", ["command-line:1", "command-line:2"]);
  await valkey.rpush("command:2:lines", ["command-line:3"]);

  section("Index applicatif : commandes d'un client triées par date (Sorted Set)");
  // Avec GLIDE, chaque entrée s'écrit { element, score } (le score est la date de commande).
  await valkey.zadd("customer:1:commands", [
    { element: "command:1", score: 1756713600 },
    { element: "command:2", score: 1756801800 },
  ]);
  // Nouvelle question métier = nouvel index manuel.
  await valkey.sadd("product:1:commands", ["command:1"]);

  section("Lecture directe par clé");
  console.log(hashToObject(await valkey.hgetall("product:1")));
  console.log("stock :", await valkey.get("stock:product:1"));
  console.log("catégories :", [...(await valkey.smembers("product:1:categories"))]);
  try {
    // product:1 est un Hash : GET (réservé aux String) est refusé.
    await valkey.get("product:1");
  } catch (error) {
    console.log("GET sur un Hash →", (error as Error).message);
  }

  section("Reconstruire l'historique du client 1 côté application");
  // 1. Retrouver les clés des commandes du client.
  const commandKeys = await valkey.zrange("customer:1:commands", { start: 0, end: -1 });
  // 2. Lire chaque commande, puis 3. les clés de ses lignes, puis 4. chaque ligne.
  const history = await Promise.all(
    commandKeys.map(async (key) => {
      const command = hashToObject(await valkey.hgetall(key));
      const lineKeys = await valkey.lrange(`${key}:lines`, 0, -1);
      const lines = await Promise.all(lineKeys.map(async (lineKey) => hashToObject(await valkey.hgetall(lineKey))));
      return { ...command, lines };
    }),
  );
  console.dir(history, { depth: null });
  console.log("Quelles commandes contiennent product:1 ?", [...(await valkey.smembers("product:1:commands"))]);
} finally {
  valkey.close();
}
