// Valkey comme cache devant MongoDB : Cache Aside, invalidation, Write Through,
// Refresh Ahead, protections (stampede, penetration) et batch.
// Lancement : docker compose run --rm app npm run valkey:cache
import { Batch, TimeUnit } from "@valkey/valkey-glide";
import { connectMongo, type ProductDocument } from "../lib/mongo.ts";
import { connectValkey } from "../lib/valkey.ts";
import { section, sleep } from "../lib/wait.ts";

const { client, products } = await connectMongo();
const valkey = await connectValkey();

const cacheKey = (id: string) => `cache:product:${id}`;
let databaseReads = 0;

// Jitter : 60 s ± 10 s pour que les clés n'expirent pas toutes en même temps.
const ttlWithJitter = (base: number) => base + Math.floor(Math.random() * 21) - 10;

async function loadAndCache(id: string): Promise<ProductDocument | null> {
  databaseReads += 1;
  const product = await products.findOne({ _id: id });
  // Cache penetration : on met aussi l'absence en cache, avec un TTL court.
  await valkey.set(cacheKey(id), JSON.stringify(product), {
    expiry: { type: TimeUnit.Seconds, count: product === null ? 30 : ttlWithJitter(60) },
  });
  return product;
}

async function refreshProductCache(id: string): Promise<void> {
  await loadAndCache(id);
  console.log(`  ↻ ${cacheKey(id)} rafraîchi en arrière-plan`);
}

// Cache Aside + Refresh Ahead.
async function getProduct(id: string): Promise<ProductDocument | null> {
  const key = cacheKey(id);
  const cached = await valkey.get(key);

  if (cached !== null) {
    const ttl = await valkey.ttl(key);
    console.log(`  cache hit  ${key} (TTL restant ${ttl} s)`);
    if (ttl < 20) {
      void refreshProductCache(id);
    }
    return JSON.parse(cached.toString());
  }

  console.log(`  cache miss ${key} → lecture MongoDB`);
  return loadAndCache(id);
}

// Cache stampede : lors d'un miss, une seule requête reconstruit le cache grâce à un lock.
async function getProductWithLock(id: string): Promise<ProductDocument | null> {
  const cached = await valkey.get(cacheKey(id));
  if (cached !== null) {
    return JSON.parse(cached.toString());
  }

  const lockKey = `lock:${cacheKey(id)}`;
  const acquired = await valkey.set(lockKey, "1", {
    conditionalSet: "onlyIfDoesNotExist",
    expiry: { type: TimeUnit.Seconds, count: 5 },
  });
  if (acquired === "OK") {
    try {
      return await loadAndCache(id);
    } finally {
      await valkey.del([lockKey]);
    }
  }

  // Une autre requête reconstruit déjà : on attend puis on relit le cache.
  await sleep(20);
  return getProductWithLock(id);
}

// Invalidation par suppression.
async function updateProductPrice(id: string, price: number): Promise<void> {
  await products.updateOne({ _id: id }, { $set: { price } });
  await valkey.del([cacheKey(id)]);
}

// Write Through : la base puis le cache sont mis à jour avant de répondre.
async function updateProductPriceWriteThrough(id: string, price: number): Promise<void> {
  await products.updateOne({ _id: id }, { $set: { price } });
  const product = await products.findOne({ _id: id });
  await valkey.set(cacheKey(id), JSON.stringify(product), {
    expiry: { type: TimeUnit.Seconds, count: ttlWithJitter(60) },
  });
}

const price = (product: ProductDocument | null) => product?.price;

try {
  await products.updateOne({ _id: "product-1" }, { $set: { price: 1499 } });
  await valkey.del([cacheKey("product-1"), cacheKey("product-999999")]);

  section("Cache Aside : miss puis hit");
  console.log("prix :", price(await getProduct("product-1")));
  console.log("prix :", price(await getProduct("product-1")));

  section("Problème : donnée obsolète si on oublie d'invalider");
  await products.updateOne({ _id: "product-1" }, { $set: { price: 1299 } });
  console.log("MongoDB : 1299, application :", price(await getProduct("product-1")));

  section("Invalidation par suppression");
  await updateProductPrice("product-1", 1299);
  console.log("prix :", price(await getProduct("product-1")));

  section("Write Through : le cache contient immédiatement la nouvelle valeur");
  await updateProductPriceWriteThrough("product-1", 1399);
  console.log("prix :", price(await getProduct("product-1")));

  section("Refresh Ahead : TTL sous le seuil de 20 s");
  await valkey.expire(cacheKey("product-1"), 12);
  console.log("prix :", price(await getProduct("product-1")));
  await sleep(200);
  console.log("TTL après rafraîchissement :", await valkey.ttl(cacheKey("product-1")), "s");

  section("Cache penetration : l'absence est mise en cache");
  databaseReads = 0;
  for (let i = 0; i < 3; i++) {
    console.log("produit :", await getProduct("product-999999"));
  }
  console.log(`lectures MongoDB pour 3 demandes : ${databaseReads}`);

  section("Cache stampede : 50 requêtes simultanées sur une clé expirée");
  await valkey.del([cacheKey("product-1")]);
  databaseReads = 0;
  await Promise.all(Array.from({ length: 50 }, () => getProductWithLock("product-1")));
  console.log(`lectures MongoDB : ${databaseReads}`);

  section("Pipeline / batch : 3 commandes, 1 aller-retour");
  await valkey.set("product:2:name", "Clavier mécanique");
  await valkey.set("product:3:name", "Souris verticale");
  const batch = new Batch(false).get(cacheKey("product-1")).get("product:2:name").get("product:3:name");
  const results = await valkey.exec(batch, true);
  console.log(results?.map((value) => value?.toString().slice(0, 40)));

  // Remet le seed dans son état initial.
  await updateProductPrice("product-1", 1499);
} finally {
  valkey.close();
  await client.close();
}
