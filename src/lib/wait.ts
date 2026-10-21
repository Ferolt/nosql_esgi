// `depends_on: service_started` n'attend pas que la base accepte les connexions :
// au premier démarrage, PostgreSQL et MongoDB exécutent d'abord leurs scripts d'init.
export async function waitFor(label: string, probe: () => Promise<unknown>, retries = 60): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await probe();
      return;
    } catch {
      console.log(`En attente de ${label}... (${attempt}/${retries})`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error(`${label} est injoignable`);
}

export function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
