// Exercice : créer et utiliser un index, puis vérifier avec explain().
// Lancement : docker compose run --rm app npm run mongo:index
import type { Document } from "mongodb";
import { connectMongo, planStages } from "../lib/mongo.ts";
import { section } from "../lib/wait.ts";

const { client, products } = await connectMongo();

function summarize(plan: Document) {
  const stats = plan.executionStats;
  return {
    stages: planStages(plan.queryPlanner.winningPlan).join(" → "),
    totalDocsExamined: stats.totalDocsExamined,
    totalKeysExamined: stats.totalKeysExamined,
    nReturned: stats.nReturned,
  };
}

const byCategory = { "categories.id": "accessories" };

try {
  // Repart d'une collection sans index secondaire pour observer le COLLSCAN.
  await products.dropIndexes();

  section("Sans index : collection scan");
  console.log(summarize(await products.find(byCategory).explain("executionStats")));

  section("1. Créer un index sur le champ utilisé par le filtre");
  console.log(
    await products.createIndex({
      "categories.id": 1,
    }),
  );

  section("2. Relancer la recherche");
  const accessories = await products.find(byCategory).toArray();
  console.log(accessories.map((product) => product._id));

  section("3. Vérifier avec explain() que MongoDB utilise l'index");
  console.log(summarize(await products.find(byCategory).explain("executionStats")));

  section("Index composé : catégorie + prix");
  await products.createIndex({
    "categories.id": 1,
    price: 1,
  });
  const cheapAccessories = { "categories.id": "accessories", price: { $lt: 500 } };
  const plan = await products.find(cheapAccessories).explain("executionStats");
  console.log(summarize(plan));
  console.log("Index retenu :", JSON.stringify(plan.queryPlanner.winningPlan).match(/"indexName":"([^"]+)"/)?.[1]);
} finally {
  await client.close();
}
