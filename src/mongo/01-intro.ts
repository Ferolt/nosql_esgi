// MongoDB : la même marketplace pensée en documents.
// Lancement : docker compose run --rm app npm run mongo:intro
import { connectMongo } from "../lib/mongo.ts";
import { section } from "../lib/wait.ts";

const { client, products, commands } = await connectMongo();

try {
  section("Tester MongoDB depuis l'application");
  console.dir(await products.findOne(), { depth: null });

  section("Retrouver les commandes de customer-1 (une requête, lignes embarquées)");
  const customerCommands = await commands
    .find({
      "customer.id": "customer-1",
    })
    .toArray();
  console.dir(customerCommands, { depth: null });

  section("Référencer un autre document : $lookup vers customers");
  const withCustomer = await commands
    .aggregate([
      { $match: { _id: "command-1" } },
      // On ne garde qu'une référence vers le client, puis on rapproche les deux collections.
      { $project: { customerId: "$customer.id", status: 1, lines: 1 } },
      {
        $lookup: {
          from: "customers",
          localField: "customerId",
          foreignField: "_id",
          as: "customer",
        },
      },
      {
        $unwind: "$customer",
      },
    ])
    .toArray();
  console.dir(withCustomer, { depth: null });
} finally {
  await client.close();
}
