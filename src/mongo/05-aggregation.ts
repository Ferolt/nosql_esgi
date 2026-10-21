// Pipelines d'agrégation : exemples du cours puis exercices 1 à 3.
// Lancement : docker compose run --rm app npm run mongo:aggregation
import { connectMongo } from "../lib/mongo.ts";
import { section } from "../lib/wait.ts";

const { client, commands } = await connectMongo();

try {
  section("$facet : commandes payées par pays + total");
  const facets = await commands
    .aggregate([
      { $match: { status: "paid" } },
      {
        $facet: {
          byCountry: [{ $group: { _id: "$customer.country", count: { $sum: 1 } } }, { $sort: { _id: 1 } }],
          totalCommands: [{ $count: "value" }],
        },
      },
    ])
    .toArray();
  console.dir(facets, { depth: null });

  section("Exercice 1 : commandes paid créées depuis le 2026-09-01");
  const exercise1 = await commands
    .aggregate<{ commandId: string; customerId: string; linesCount: number }>([
      {
        $match: {
          status: "paid",
          createdAt: { $gte: new Date("2026-09-01") },
        },
      },
      {
        $project: {
          _id: 0,
          commandId: "$_id",
          customerId: "$customer.id",
          linesCount: { $size: "$lines" },
        },
      },
    ])
    .toArray();
  console.log(exercise1);

  section("Exercice 2 : chiffre d'affaires par catégorie (commandes paid)");
  const exercise2 = await commands
    .aggregate<{ _id: string; revenue: number }>([
      // On filtre avant $unwind : moins de documents à éclater.
      { $match: { status: "paid" } },
      { $unwind: "$lines" },
      {
        $project: {
          categoryId: "$lines.categoryId",
          lineTotal: {
            $multiply: ["$lines.quantity", "$lines.unitPrice"],
          },
        },
      },
      {
        $group: {
          _id: "$categoryId",
          revenue: { $sum: "$lineTotal" },
        },
      },
      { $sort: { revenue: -1 } },
    ])
    .toArray();
  console.log(exercise2);

  section("Exercice 3 : top 5 des produits vendus (commandes paid)");
  const exercise3 = await commands
    .aggregate<{ _id: string; totalQuantity: number }>([
      { $match: { status: "paid" } },
      { $unwind: "$lines" },
      {
        $group: {
          _id: "$lines.productId",
          totalQuantity: { $sum: "$lines.quantity" },
        },
      },
      // _id en second critère pour un classement stable en cas d'égalité.
      { $sort: { totalQuantity: -1, _id: 1 } },
      { $limit: 5 },
    ])
    .toArray();
  console.log(exercise3);
} finally {
  await client.close();
}
