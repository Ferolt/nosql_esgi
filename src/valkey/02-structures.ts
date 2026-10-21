// Types Valkey (String, Hash, List, Set, Sorted Set), expiration,
// puis l'exercice « choisir une structure ».
// Lancement : docker compose run --rm app npm run valkey:structures
import { TimeUnit } from "@valkey/valkey-glide";
import { connectValkey, hashToObject } from "../lib/valkey.ts";
import { section } from "../lib/wait.ts";

const valkey = await connectValkey();

try {
  await valkey.del([
    "message",
    "feature:new-checkout",
    "counter:product:1:views",
    "user:1",
    "user:1:json",
    "queue:emails",
    "online:users",
    "product:1:favorites",
    "users:premium",
    "users:beta",
    "leaderboard:products",
    "session:abc",
    "cache:product:1",
    "views:product:1",
    "session:user:1",
    "recent:products:user:1",
    "online:users:now",
    "ranking:products:views",
    "cache:product:1:json",
  ]);

  section("Une commande Valkey : SET / GET");
  await valkey.set("message", "hello");
  console.log(await valkey.get("message"));

  section("Commandes génériques : EXISTS, TYPE, DEL");
  console.log("EXISTS message :", await valkey.exists(["message"]));
  console.log("TYPE message   :", await valkey.type("message"));
  console.log("DEL message    :", await valkey.del(["message"]));

  section("String : CRUD d'un feature flag");
  await valkey.set("feature:new-checkout", "enabled");
  console.log(await valkey.get("feature:new-checkout"));
  await valkey.set("feature:new-checkout", "disabled");
  console.log(await valkey.get("feature:new-checkout"));
  await valkey.del(["feature:new-checkout"]);
  console.log(await valkey.get("feature:new-checkout"));

  section("Compteurs atomiques");
  await valkey.set("counter:product:1:views", "0");
  console.log(await valkey.incr("counter:product:1:views"));
  console.log(await valkey.incrBy("counter:product:1:views", 10));

  section("Hash : CRUD champ par champ");
  await valkey.hset("user:1", { name: "Alice", email: "alice@example.com", country: "FR" });
  console.log("HGET country :", await valkey.hget("user:1", "country"));
  await valkey.hset("user:1", { country: "BE" });
  console.log("après merge  :", hashToObject(await valkey.hgetall("user:1")));
  await valkey.hdel("user:1", ["country"]);
  console.log("après HDEL   :", hashToObject(await valkey.hgetall("user:1")));

  section("String JSON ou Hash ?");
  await valkey.set("user:1:json", JSON.stringify({ name: "Alice", country: "FR" }));
  console.log("JSON (lecture complète simple) :", JSON.parse((await valkey.get("user:1:json"))!.toString()));

  section("List : file simple (RPUSH à droite, LPOP à gauche)");
  await valkey.rpush("queue:emails", ["email:1", "email:2"]);
  console.log("LPOP :", await valkey.lpop("queue:emails"));
  console.log("reste :", await valkey.lrange("queue:emails", 0, -1));

  section("Set : valeurs uniques et appartenance");
  await valkey.sadd("online:users", ["user:1", "user:2"]);
  console.log("SADD d'un doublon ajoute :", await valkey.sadd("online:users", ["user:1"]));
  await valkey.sadd("product:1:favorites", ["user:1", "user:2"]);
  console.log("user:1 favori ?", await valkey.sismember("product:1:favorites", "user:1"));
  await valkey.srem("product:1:favorites", ["user:1"]);
  console.log("après SREM    :", await valkey.sismember("product:1:favorites", "user:1"));

  await valkey.sadd("users:premium", ["user:1", "user:2", "user:3"]);
  await valkey.sadd("users:beta", ["user:2", "user:4"]);
  console.log("premium ET beta      :", [...(await valkey.sinter(["users:premium", "users:beta"]))]);
  console.log("premium OU beta      :", [...(await valkey.sunion(["users:premium", "users:beta"]))].sort());
  console.log("premium mais pas beta:", [...(await valkey.sdiff(["users:premium", "users:beta"]))].sort());

  section("Sorted Set : classement");
  await valkey.zadd("leaderboard:products", [
    { element: "product:1", score: 120 },
    { element: "product:2", score: 42 },
    { element: "product:3", score: 980 },
  ]);
  await valkey.zincrby("leaderboard:products", 1, "product:1");
  // reverse: true pour avoir le meilleur score en premier.
  console.log(await valkey.zrangeWithScores("leaderboard:products", { start: 0, end: 9 }, { reverse: true }));

  section("Expiration : TTL");
  await valkey.set("session:abc", "user:1");
  await valkey.expire("session:abc", 1800);
  console.log("TTL session:abc :", await valkey.ttl("session:abc"), "s");
  await valkey.set("cache:product:1", JSON.stringify({ id: "product-1", price: 1499 }), {
    expiry: { type: TimeUnit.Seconds, count: 60 },
  });
  console.log("TTL cache:product:1 :", await valkey.ttl("cache:product:1"), "s");

  // ---------------------------------------------------------------------------
  section("Exercice : choisir une structure");

  // 1. Nombre de vues d'un produit → String + INCR (atomique).
  await valkey.incr("views:product:1");
  await valkey.incr("views:product:1");
  console.log("1. String  views:product:1 =", await valkey.get("views:product:1"));

  // 2. Champs d'une session utilisateur → Hash (+ TTL : une session est temporaire).
  await valkey.hset("session:user:1", { userId: "user:1", cartId: "cart:42", locale: "fr-FR" });
  await valkey.expire("session:user:1", 1800);
  console.log("2. Hash    session:user:1 =", hashToObject(await valkey.hgetall("session:user:1")));

  // 3. 20 derniers produits consultés → List : LPUSH puis LTRIM pour plafonner à 20.
  for (let i = 1; i <= 25; i++) {
    await valkey.lpush("recent:products:user:1", [`product:${i}`]);
    await valkey.ltrim("recent:products:user:1", 0, 19);
  }
  const recent = await valkey.lrange("recent:products:user:1", 0, -1);
  console.log(`3. List    recent:products:user:1 = ${recent.length} éléments, du plus récent :`, recent.slice(0, 3));

  // 4. Savoir si un utilisateur est connecté → Set + SISMEMBER.
  await valkey.sadd("online:users:now", ["user:1"]);
  console.log("4. Set     user:1 connecté ?", await valkey.sismember("online:users:now", "user:1"));

  // 5. Produits les plus consultés → Sorted Set + ZINCRBY.
  await valkey.zincrby("ranking:products:views", 5, "product:1");
  await valkey.zincrby("ranking:products:views", 9, "product:2");
  await valkey.zincrby("ranking:products:views", 2, "product:3");
  console.log(
    "5. ZSet    top consultés =",
    await valkey.zrange("ranking:products:views", { start: 0, end: 9 }, { reverse: true }),
  );

  // 6. Fiche produit complète en cache → String JSON avec TTL (lecture complète en un GET).
  await valkey.set(
    "cache:product:1:json",
    JSON.stringify({ id: "product-1", name: "Laptop Pro 14", price: 1499, categories: ["computers"] }),
    { expiry: { type: TimeUnit.Seconds, count: 60 } },
  );
  console.log("6. String  cache:product:1:json =", (await valkey.get("cache:product:1:json"))?.toString());
} finally {
  valkey.close();
}
