// Partie SQL : PostgreSQL comme baseline relationnelle.
// Lancement : docker compose up   (le service app exécute `npm run dev`)
import postgres from "postgres";
import { section, waitFor } from "./lib/wait.ts";

// postgres.js renvoie bigint et numeric sous forme de string pour ne pas perdre de précision.
type PgBigInt = string;
type PgNumeric = string;
type CommandStatus = "pending" | "paid" | "cancelled";

const sql = postgres(process.env.POSTGRES_URL!);

// Lignes plates renvoyées par la requête « achats d'un client ».
type PurchaseRow = {
  customerId: PgBigInt;
  customerName: string;
  commandId: PgBigInt;
  commandStatus: CommandStatus;
  commandLineId: PgBigInt;
  quantity: number;
  unitPrice: PgNumeric;
  productId: PgBigInt;
  productName: string;
};

// Objet métier que l'application veut réellement manipuler.
type CustomerPurchases = {
  id: PgBigInt;
  name: string;
  commands: {
    id: PgBigInt;
    status: CommandStatus;
    lines: {
      id: PgBigInt;
      product: { id: PgBigInt; name: string };
      quantity: number;
      unitPrice: PgNumeric;
    }[];
  }[];
};

function findCustomerPurchases(customerId: number) {
  return sql<PurchaseRow[]>`
    SELECT
      c.id         AS "customerId",
      c.name       AS "customerName",
      cmd.id       AS "commandId",
      cmd.status   AS "commandStatus",
      cl.id        AS "commandLineId",
      cl.quantity  AS "quantity",
      cl.unit_price AS "unitPrice",
      p.id         AS "productId",
      p.name       AS "productName"
    FROM customers c
    JOIN commands cmd
      ON cmd.customer_id = c.id
    JOIN command_lines cl
      ON cl.command_id = cmd.id
    JOIN products p
      ON p.id = cl.product_id
    WHERE c.id = ${customerId}
    ORDER BY cmd.id, cl.id
  `;
}

// Les JOIN produisent une ligne par CommandLine : l'application doit regrouper
// elle-même les lignes pour reconstruire Customer → Command[] → CommandLine[].
function rebuildCustomer(rows: PurchaseRow[]): CustomerPurchases | null {
  const [first] = rows;
  if (first === undefined) {
    return null;
  }

  const customer: CustomerPurchases = { id: first.customerId, name: first.customerName, commands: [] };
  const commandsById = new Map<PgBigInt, CustomerPurchases["commands"][number]>();

  for (const row of rows) {
    let command = commandsById.get(row.commandId);
    if (command === undefined) {
      command = { id: row.commandId, status: row.commandStatus, lines: [] };
      commandsById.set(row.commandId, command);
      customer.commands.push(command);
    }
    command.lines.push({
      id: row.commandLineId,
      product: { id: row.productId, name: row.productName },
      quantity: row.quantity,
      unitPrice: row.unitPrice,
    });
  }

  return customer;
}

class Rollback extends Error {}

async function main(): Promise<void> {
  await waitFor("PostgreSQL", () => sql`SELECT 1`);

  section("Tester PostgreSQL depuis l'application");
  const [product] = await sql`
    SELECT *
    FROM products
    LIMIT 1
  `;
  console.log(product);

  section("Requête : achats du client 1 (résultat plat des JOIN)");
  const rows = await findCustomerPurchases(1);
  console.table(rows);
  console.log(`${rows.length} lignes : une par CommandLine, le client et la commande sont répétés.`);

  section("Reconstruction de l'objet métier côté application");
  console.dir(rebuildCustomer(rows), { depth: null });

  section("Problème : l'historique peut changer");
  // On renomme le produit dans une transaction annulée pour ne pas modifier le seed.
  try {
    await sql.begin(async (tx) => {
      await tx`UPDATE products SET name = 'Laptop Pro 15' WHERE id = 1`;
      const [line] = await tx<{ commandId: PgBigInt; productName: string; unitPrice: PgNumeric }[]>`
        SELECT cl.command_id AS "commandId", p.name AS "productName", cl.unit_price AS "unitPrice"
        FROM command_lines cl
        JOIN products p ON p.id = cl.product_id
        WHERE cl.id = 1
      `;
      console.log(
        `Commande ${line!.commandId} (passée avec "Laptop Pro 14") affiche maintenant : ` +
          `"${line!.productName}" à ${line!.unitPrice} €`,
      );
      console.log("→ unit_price est un snapshot, mais le nom vient du produit actuel.");
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) {
      throw error;
    }
  }
}

try {
  await main();
} catch (error) {
  console.error("Erreur :", error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
