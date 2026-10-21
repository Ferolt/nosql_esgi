// Premier CRUD MongoDB : insertOne, find, updateOne, deleteOne.
// Lancement : docker compose run --rm app npm run mongo:crud
import { connectMongo } from "../lib/mongo.ts";
import { section } from "../lib/wait.ts";

const { client, products } = await connectMongo();

try {
  // Rend le script rejouable si une exécution précédente s'est arrêtée en route.
  await products.deleteOne({ _id: "product-4" });

  section("Create : insertOne");
  const inserted = await products.insertOne({
    _id: "product-4",
    name: "Écran 27 pouces",
    description: "Écran QHD pour poste de travail",
    price: 299,
    categories: [{ id: "accessories", name: "Accessoires" }],
    stock: {
      quantity: 20,
    },
  });
  console.log(inserted.insertedId);

  section("Read : produits de la catégorie accessories");
  const accessories = await products
    .find({
      "categories.id": "accessories",
    })
    .toArray();
  console.log(accessories.map((product) => `${product._id} ${product.name}`));

  section("Update : $set sur le prix, $inc sur le stock");
  const updated = await products.updateOne(
    {
      _id: "product-4",
    },
    {
      $set: {
        price: 279,
      },
      $inc: {
        "stock.quantity": -1,
      },
    },
  );
  console.log(updated.modifiedCount);
  console.log(await products.findOne({ _id: "product-4" }, { projection: { price: 1, stock: 1 } }));

  section("Delete : deleteOne");
  const deleted = await products.deleteOne({
    _id: "product-4",
  });
  console.log(deleted.deletedCount);
} finally {
  await client.close();
}
