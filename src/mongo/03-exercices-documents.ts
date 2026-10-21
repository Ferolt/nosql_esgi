// Exercices 1 à 3 : rechercher et modifier dans des documents imbriqués.
// Lancement : docker compose run --rm app npm run mongo:exercices
import { connectMongo } from "../lib/mongo.ts";
import { section } from "../lib/wait.ts";

const { client, products } = await connectMongo();

const names = (docs: { _id: string; name: string }[]) => docs.map((doc) => `${doc._id} (${doc.name})`);

try {
  section("Exercice 1 : accessoires avec au moins 20 unités en stock");
  const exercise1 = await products
    .find({
      "categories.id": "accessories",
      "stock.quantity": { $gte: 20 },
    })
    .toArray();
  console.log(names(exercise1));

  section("Exercice 2 : variante à moins de 1600 € ET en stock");
  // Piège : sans $elemMatch, chaque condition peut être satisfaite par une variante différente.
  // product-1 remonte à tort : la variante noire coûte 1499 € mais n'a pas de stock,
  // la variante argent a du stock mais coûte 1899 €.
  const naive = await products
    .find({
      "variants.price": { $lt: 1600 },
      "variants.stock": { $gt: 0 },
    })
    .toArray();
  console.log("Sans $elemMatch :", names(naive));

  // $elemMatch impose que les deux conditions portent sur la même variante.
  const exercise2 = await products
    .find({
      variants: {
        $elemMatch: {
          price: { $lt: 1600 },
          stock: { $gt: 0 },
        },
      },
    })
    .toArray();
  console.log("Avec $elemMatch :", names(exercise2));

  section("Exercice 3 : modifier un document imbriqué");
  const original = { quantity: 12, reserved: 3, warehouse: "PAR" };
  await products.updateOne({ _id: "product-1" }, { $set: { stock: original } });

  // Requête proposée : $set sur l'objet stock remplace l'objet entier.
  await products.updateOne(
    { _id: "product-1" },
    {
      $set: {
        stock: {
          quantity: 8,
        },
      },
    },
  );
  const replaced = await products.findOne({ _id: "product-1" }, { projection: { stock: 1 } });
  console.log("Requête proposée →", replaced);
  console.log("reserved et warehouse ont disparu : tout l'objet stock a été remplacé.");

  // Correction : la notation par point ne cible que le champ quantity.
  await products.updateOne({ _id: "product-1" }, { $set: { stock: original } });
  await products.updateOne(
    { _id: "product-1" },
    {
      $set: {
        "stock.quantity": 8,
      },
    },
  );
  const fixed = await products.findOne({ _id: "product-1" }, { projection: { stock: 1 } });
  console.log("Requête corrigée →", fixed);

  // On remet le seed dans son état initial pour les autres scripts.
  await products.updateOne({ _id: "product-1" }, { $set: { stock: original } });
} finally {
  await client.close();
}
