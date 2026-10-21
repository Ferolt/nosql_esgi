# TP NoSQL – Marketplace (PostgreSQL / MongoDB / Valkey)

Le même domaine métier (produits, catégories, clients, commandes, lignes, stock) est modélisé
avec trois bases. Chaque partie du cours a son script, et chaque exercice y est résolu.

```
tp_note/
├─ compose.yml                     Node + PostgreSQL + MongoDB + Valkey (+ Replica Set, profil "cluster")
├─ package.json / tsconfig.json
├─ database/
│  ├─ postgres/01-schema.sql       tables relationnelles
│  ├─ postgres/02-seed.sql         jeu de données
│  └─ mongo/01-seed.js             mêmes données en documents
└─ src/
   ├─ main.ts                      partie SQL (lancée par `npm run dev`)
   ├─ mongo/01-intro.ts … 06-change-stream.ts
   ├─ valkey/01-modelisation.ts … 05-stream.ts
   └─ lib/                         connexions et helpers partagés
```

## Lancer le TP

```bash
docker compose up
```

`docker compose up` démarre les bases puis exécute la partie SQL (`npm run dev`).
Les autres parties se lancent une par une :

```bash
docker compose run --rm app npm run mongo:intro
docker compose run --rm app npm run mongo:crud
docker compose run --rm app npm run mongo:exercices
docker compose run --rm app npm run mongo:index
docker compose run --rm app npm run mongo:aggregation
docker compose run --rm app npm run valkey:modelisation
docker compose run --rm app npm run valkey:structures
docker compose run --rm app npm run valkey:cache
docker compose run --rm app npm run valkey:pubsub
docker compose run --rm app npm run valkey:stream
```

Ou tout d'un coup (sauf le Replica Set) : `docker compose run --rm app npm run all`.

Replica Set + Change Streams :

```bash
docker compose --profile cluster up -d mongo-1 mongo-2 mongo-3 mongo-init valkey
docker compose --profile cluster run --rm app npm run mongo:change-stream
```

Réinitialiser les bases (les scripts d'init ne tournent qu'au premier démarrage) :

```bash
docker compose --profile cluster down -v
```

---

## Partie 1 – SQL (PostgreSQL)

**Schéma** ([01-schema.sql](database/postgres/01-schema.sql)) : `products`, `categories`,
`product_categories` (N-N), `stocks` (séparé car il change souvent), `customers`, `commands`,
`command_lines` (`unit_price` = prix figé au moment de l'achat).

**Requêtes** ([src/main.ts](src/main.ts)) :

1. Test de connexion : `SELECT * FROM products LIMIT 1`.
2. Achats du client 1 : `customers ⨝ commands ⨝ command_lines ⨝ products`.
3. Reconstruction de l'objet `Customer → Command[] → CommandLine[]` côté application.
4. Démonstration du problème d'historique (dans une transaction annulée).

**Résultat de la requête « achats d'un client »** : 3 lignes plates, une par `CommandLine`.

| customerName | commandId | status  | line | quantity | unitPrice | productName       |
|--------------|-----------|---------|------|----------|-----------|-------------------|
| Alice Martin | 1         | paid    | 1    | 1        | 1499.00   | Laptop Pro 14     |
| Alice Martin | 1         | paid    | 2    | 1        | 129.00    | Clavier mécanique |
| Alice Martin | 2         | pending | 3    | 2        | 59.00     | Souris verticale  |

**Constats** :

- Les JOIN multiplient les lignes : le client et la commande sont répétés sur chaque ligne.
  L'application doit ensuite regrouper ces lignes pour retrouver l'objet imbriqué.
- Le SQL est du texte : le type TypeScript du résultat est déclaré, pas vérifié par la base.
- **Historique** : si `products.name` devient « Laptop Pro 15 », l'ancienne commande affiche le
  nouveau nom, car le JOIN lit le produit actuel. `unit_price` est déjà un snapshot ; pour protéger
  l'historique il faudrait aussi copier `product_name` (référence, variante…) dans `command_lines`.
  Ici, dupliquer protège l'historique.

---

## Partie 2 – MongoDB

### Modèle document ([01-intro.ts](src/mongo/01-intro.ts))

Une commande embarque ses lignes et un snapshot du produit : une seule requête
`find({ "customer.id": "customer-1" })` renvoie les commandes complètes, sans multiplication de
lignes. La contrepartie : le nom du client dupliqué dans chaque commande doit être mis à jour
partout s'il change (1 update client + N updates commandes). On peut alors ne garder qu'une
référence et utiliser `$lookup`, mais ce n'est pas gratuit à grande échelle.

### CRUD ([02-crud.ts](src/mongo/02-crud.ts))

`insertOne` → `find({ "categories.id": "accessories" })` → `updateOne` (`$set` prix, `$inc` stock)
→ `deleteOne`.

### Exercices sur les documents ([03-exercices-documents.ts](src/mongo/03-exercices-documents.ts))

**Exercice 1** : accessoires avec au moins 20 unités en stock.

```js
products.find({
  "categories.id": "accessories",
  "stock.quantity": { $gte: 20 },
});
// → product-2 (50), product-3 (30) ; product-5 (5) est exclu
```

**Exercice 2** : variante à moins de 1600 € **et** en stock.

```js
// Faux : chaque condition peut être remplie par une variante différente.
products.find({ "variants.price": { $lt: 1600 }, "variants.stock": { $gt: 0 } });
// → product-1, product-2, product-3, product-5
//   product-1 remonte à tort (noire 1499 € sans stock, argent 1899 € en stock)

// Correct : $elemMatch applique les deux conditions au même élément du tableau.
products.find({
  variants: { $elemMatch: { price: { $lt: 1600 }, stock: { $gt: 0 } } },
});
// → product-2, product-3, product-5 (product-1 n'est plus retourné)
```

**Exercice 3** : passer `stock.quantity` à 8.

La requête proposée `$set: { stock: { quantity: 8 } }` **remplace tout l'objet** `stock`.
Document obtenu :

```js
{ _id: "product-1", stock: { quantity: 8 } }   // reserved et warehouse sont perdus
```

Correction avec la notation par point, qui ne touche que le champ ciblé :

```js
await collection.updateOne(
  { _id: "product-1" },
  { $set: { "stock.quantity": 8 } },
);
// → { quantity: 8, reserved: 3, warehouse: "PAR" }
```

### Exercice : créer et utiliser un index ([04-index.ts](src/mongo/04-index.ts))

1. `products.createIndex({ "categories.id": 1 })`
2. Relance de `find({ "categories.id": "accessories" })`
3. `explain("executionStats")` : avant l'index, le plan est `COLLSCAN` (tous les documents sont
   examinés) ; après, `FETCH → IXSCAN` sur `categories.id_1`, et `totalDocsExamined` = `nReturned`.

Le script montre aussi l'index composé `{ "categories.id": 1, price: 1 }` pour le filtre
catégorie + prix.

### Agrégations ([05-aggregation.ts](src/mongo/05-aggregation.ts))

**Exercice 1** : commandes `paid` depuis le 2026-09-01.

```js
[
  { $match: { status: "paid", createdAt: { $gte: new Date("2026-09-01") } } },
  { $project: { _id: 0, commandId: "$_id", customerId: "$customer.id", linesCount: { $size: "$lines" } } },
]
// → { commandId: "command-1", customerId: "customer-1", linesCount: 2 }
//   { commandId: "command-3", customerId: "customer-2", linesCount: 2 }
```

**Exercice 2** : chiffre d'affaires par catégorie (`paid`).

```js
[
  { $match: { status: "paid" } },     // filtrer AVANT $unwind : moins de documents à éclater
  { $unwind: "$lines" },
  { $project: { categoryId: "$lines.categoryId", lineTotal: { $multiply: ["$lines.quantity", "$lines.unitPrice"] } } },
  { $group: { _id: "$categoryId", revenue: { $sum: "$lineTotal" } } },
]
// → { _id: "computers", revenue: 2948 }, { _id: "accessories", revenue: 513 }
```

**Exercice 3** : top 5 des produits vendus (`paid`).

```js
[
  { $match: { status: "paid" } },
  { $unwind: "$lines" },
  { $group: { _id: "$lines.productId", totalQuantity: { $sum: "$lines.quantity" } } },
  { $sort: { totalQuantity: -1, _id: 1 } },
  { $limit: 5 },
]
// → product-3: 3, product-1: 2, product-2: 2, product-5: 2
```

### Replica Set et Change Streams ([06-change-stream.ts](src/mongo/06-change-stream.ts))

Trois nœuds `mongo-1..3` dans le Replica Set `rs0`, initialisés par `mongo-init`. Le script
vérifie les rôles (`PRIMARY` / `SECONDARY`), ouvre `products.watch()` filtré sur
`insert/update/replace/delete` avec `fullDocument: "updateLookup"`, produit des écritures et
invalide la clé Valkey `cache:product:<id>` à chaque modification.

Observation : `updateDescription.updatedFields` donne bien `{ price: 1399 }`, mais le
`fullDocument` du même événement peut déjà afficher `1499`. `updateLookup` relit le document
**au moment où l'événement est lu**, pas au moment du changement.

---

## Partie 3 – Valkey

### Modélisation par clés ([01-modelisation.ts](src/valkey/01-modelisation.ts))

`product:1` (Hash), `stock:product:1` (String), `product:1:categories` (Set), `command:1` et
`command-line:1` (Hash), `command:1:lines` (List), `customer:1:commands` (Sorted Set, score = date).

Ça marche, mais chaque relation et chaque recherche est un index construit à la main, et
l'application reconstruit l'historique en plusieurs allers-retours : mauvais candidat pour ce
besoin, très bon pour des lectures directes par clé.

### Exercice : choisir une structure ([02-structures.ts](src/valkey/02-structures.ts))

| Besoin | Structure | Commandes |
|---|---|---|
| 1. Nombre de vues d'un produit | **String** (compteur) | `INCR views:product:1` |
| 2. Champs d'une session utilisateur | **Hash** (+ TTL) | `HSET session:user:1 …`, `EXPIRE` |
| 3. 20 derniers produits consultés | **List** | `LPUSH` puis `LTRIM 0 19` |
| 4. Savoir si un utilisateur est connecté | **Set** | `SADD`, `SISMEMBER` |
| 5. Classer les produits les plus consultés | **Sorted Set** | `ZINCRBY`, `ZRANGE … REV` |
| 6. Fiche produit complète en cache | **String JSON** (+ TTL) | `SET … EX 60`, `GET` |

Pour 6, un Hash convient aussi si on veut mettre à jour champ par champ ; le JSON est plus simple
quand on lit toujours la fiche entière.

### Cache ([03-cache.ts](src/valkey/03-cache.ts))

- **Cache Aside** : `GET` → si miss, lecture MongoDB → `SET … EX` → retour.
- **Donnée obsolète** : sans invalidation, l'application renvoie l'ancien prix.
- **Invalidation** par `DEL` après l'update, et **Write Through** (base + cache avant de répondre).
- **Refresh Ahead** : sur un hit dont le TTL < 20 s, le cache est rafraîchi en arrière-plan.
- **Cache penetration** : l'absence (`null`) est mise en cache 30 s.
- **Cache stampede** : TTL avec jitter + lock `SET NX EX 5` pour qu'une seule requête recharge.
- **Batch** : `new Batch(false)` envoie plusieurs commandes en un aller-retour.

### Exercice : notification simple ([04-pubsub.ts](src/valkey/04-pubsub.ts))

Subscriber avec callback, `subscribe(new Set(["notifications"]), 5000)`, publisher
`publish("hello", "notifications")`. Sortie attendue :

```
notifications
hello
```

Le script montre aussi qu'un message publié sans abonné est perdu : Pub/Sub n'est pas une queue.

### Exercice : écrire et lire un Stream ([05-stream.ts](src/valkey/05-stream.ts))

Deux `XADD stream:events` (`type=product.updated`, `productId=product:1` puis `product:2`), puis
`XREAD` depuis `0-0` et affichage brut. Le script reprend ensuite après le dernier id lu.

---

## Écarts entre les slides et l'API réelle (GLIDE 2.5.1)

- `zadd` attend `{ element, score }` (et non `{ member, score }`).
- `get("product:1")` échoue si la clé est un Hash (`WRONGTYPE`) : il faut `hgetall`.
- `hgetall` renvoie un tableau `[{ field, value }]`, converti en objet par `hashToObject`.
- L'expiration s'écrit `expiry: { type: TimeUnit.Seconds, count: 60 }`.
- `xread` renvoie `[{ key: "stream:events", value: { "<id>": [[champ, valeur], …] } }]`.
- `depends_on: service_started` n'attend pas que les bases soient prêtes : les scripts réessaient
  la connexion (`src/lib/wait.ts`).
- Replica Set : un client lancé avant `rs.initiate()` écarte définitivement les nœuds de sa
  topologie, donc chaque nouvel essai de connexion crée un nouveau `MongoClient`.
- GLIDE n'a pas de binaire Windows : les scripts Valkey tournent dans Docker (`docker compose run`).
