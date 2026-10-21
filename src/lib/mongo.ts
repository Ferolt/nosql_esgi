import { MongoClient } from "mongodb";
import { waitFor } from "./wait.ts";

export type ProductDocument = {
  _id: string;
  name: string;
  description: string;
  price: number;
  categories: { id: string; name: string }[];
  stock: { quantity: number; reserved?: number; warehouse?: string };
  variants?: { color: string; price: number; stock: number }[];
};

export type CustomerDocument = {
  _id: string;
  name: string;
  email: string;
  country: string;
};

export type CommandDocument = {
  _id: string;
  customer: { id: string; name: string; country: string };
  status: "pending" | "paid" | "cancelled";
  createdAt: Date;
  lines: {
    productId: string;
    productName: string;
    categoryId: string;
    quantity: number;
    unitPrice: number;
  }[];
};

export async function connectMongo(url = process.env.MONGO_URL!) {
  let connected: MongoClient | undefined;
  await waitFor("MongoDB", async () => {
    // Nouveau client à chaque essai : tant que rs.initiate() n'a pas tourné, les nœuds
    // sont écartés définitivement de la topologie du client qui les a contactés.
    const candidate = new MongoClient(url, { serverSelectionTimeoutMS: 2000 });
    try {
      await candidate.db("admin").command({ ping: 1 });
      connected = candidate;
    } catch (error) {
      await candidate.close();
      throw error;
    }
  });

  const client = connected!;
  const db = client.db("marketplace");
  return {
    client,
    db,
    products: db.collection<ProductDocument>("products"),
    customers: db.collection<CustomerDocument>("customers"),
    commands: db.collection<CommandDocument>("commands"),
  };
}

// Parcourt un plan d'exécution et liste les stages rencontrés (FETCH, IXSCAN, COLLSCAN...).
export function planStages(plan: unknown): string[] {
  if (plan === null || typeof plan !== "object") {
    return [];
  }
  if (Array.isArray(plan)) {
    return plan.flatMap(planStages);
  }
  const node = plan as Record<string, unknown>;
  const own = typeof node.stage === "string" ? [node.stage] : [];
  return [
    ...own,
    ...planStages(node.queryPlan),
    ...planStages(node.inputStage),
    ...planStages(node.inputStages),
  ];
}
