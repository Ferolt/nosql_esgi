// Replica Set + Change Streams : écouter les écritures et invalider le cache Valkey.
// Lancement :
//   docker compose --profile cluster up -d mongo-1 mongo-2 mongo-3 mongo-init valkey
//   docker compose --profile cluster run --rm app npm run mongo:change-stream
import { connectMongo } from "../lib/mongo.ts";
import { connectValkey } from "../lib/valkey.ts";
import { section, waitFor } from "../lib/wait.ts";

const { client, db, products } = await connectMongo(process.env.MONGO_CLUSTER_URL!);
const valkey = await connectValkey();

const cacheKey = (id: string) => `cache:product:${id}`;

try {
  section("Vérifier le cluster");
  // Le Replica Set peut mettre quelques secondes à élire son primary après rs.initiate().
  await waitFor("le primary du Replica Set", async () => {
    const hello = await db.admin().command({ hello: 1 });
    if (!hello.isWritablePrimary) {
      throw new Error("pas encore de primary");
    }
  });
  const status = await db.admin().command({ replSetGetStatus: 1 });
  for (const member of status.members as { name: string; stateStr: string }[]) {
    console.log(`${member.name} : ${member.stateStr}`);
  }

  // La base du cluster est vide au départ : on (re)crée le produit observé.
  await products.updateOne(
    { _id: "product-1" },
    {
      $set: {
        name: "Laptop Pro 14",
        description: "Ordinateur portable performant",
        price: 1499,
        categories: [{ id: "computers", name: "Ordinateurs" }],
        stock: { quantity: 12 },
      },
    },
    { upsert: true },
  );
  await products.deleteOne({ _id: "product-4" });
  await valkey.set(cacheKey("product-1"), JSON.stringify(await products.findOne({ _id: "product-1" })));

  section("Écouter la collection products");
  const stream = products.watch(
    [
      {
        $match: {
          operationType: {
            $in: ["insert", "update", "replace", "delete"],
          },
        },
      },
    ],
    {
      fullDocument: "updateLookup",
    },
  );

  // Le flux s'ouvre de façon asynchrone. tryNext() ouvre le curseur sans bloquer :
  // les écritures qui suivent sont donc forcément capturées. On lit ensuite le flux
  // avec for await, l'équivalent de stream.on("change", ...) vu en cours.
  await stream.tryNext();

  section("Produire des événements");
  await products.insertOne({
    _id: "product-4",
    name: "Écran 27 pouces",
    description: "Écran QHD pour poste de travail",
    price: 299,
    categories: [{ id: "accessories", name: "Accessoires" }],
    stock: { quantity: 20 },
  });
  await products.updateOne({ _id: "product-1" }, { $set: { price: 1399 } });
  await products.deleteOne({ _id: "product-4" });
  await products.updateOne({ _id: "product-1" }, { $set: { price: 1499 } });

  section("Événements reçus");
  const expectedEvents = 4;
  let received = 0;
  for await (const event of stream) {
    if (!("documentKey" in event)) {
      continue;
    }
    const id = event.documentKey._id;
    console.log(`\n${event.operationType} → documentKey`, event.documentKey);

    if (event.operationType === "update") {
      console.log("updatedFields :", event.updateDescription.updatedFields);
      console.log("removedFields :", event.updateDescription.removedFields);
      console.log("fullDocument  :", event.fullDocument);
    }
    if (event.operationType === "insert") {
      console.log("fullDocument  :", event.fullDocument);
    }

    // Exemple du cours : l'écriture en base invalide automatiquement le cache.
    if (event.operationType !== "insert") {
      await valkey.del([cacheKey(id)]);
      console.log(`Cache ${cacheKey(id)} invalidé`);
    }

    received += 1;
    if (received === expectedEvents) {
      break;
    }
  }
  await stream.close();

  section("Résultat côté Valkey");
  console.log(`${cacheKey("product-1")} existe encore ?`, (await valkey.exists([cacheKey("product-1")])) === 1);
} finally {
  valkey.close();
  await client.close();
}
