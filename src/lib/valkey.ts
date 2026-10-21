import { GlideClient, type GlideClientConfiguration, type HashDataType } from "@valkey/valkey-glide";
import { waitFor } from "./wait.ts";

export async function connectValkey(
  options: Omit<GlideClientConfiguration, "addresses"> = {},
): Promise<GlideClient> {
  let client: GlideClient | undefined;
  await waitFor("Valkey", async () => {
    client = await GlideClient.createClient({
      addresses: [
        {
          host: process.env.VALKEY_HOST!,
          port: 6379,
        },
      ],
      ...options,
    });
  });
  return client!;
}

// HGETALL renvoie [{ field, value }] avec GLIDE : on le convertit en objet pour l'affichage.
export function hashToObject(hash: HashDataType): Record<string, string> {
  return Object.fromEntries(hash.map(({ field, value }) => [field.toString(), value.toString()]));
}
