// Exercice : notification simple avec Pub/Sub.
// Lancement : docker compose run --rm app npm run valkey:pubsub
import type { PubSubMsg } from "@valkey/valkey-glide";
import { connectValkey } from "../lib/valkey.ts";
import { section } from "../lib/wait.ts";

let onMessage: (message: PubSubMsg) => void = () => {};

// 1. Créer un subscriber : le callback est appelé à chaque message reçu.
const subscriber = await connectValkey({
  pubsubSubscriptions: {
    channelsAndPatterns: {},
    callback: (message: PubSubMsg, _context: unknown) => {
      // 3. Afficher chaque message reçu.
      console.log(message.channel.toString());
      console.log(message.message.toString());
      onMessage(message);
    },
    context: null,
  },
});

// 4. Créer un publisher : un client classique.
const publisher = await connectValkey();

try {
  section("Exercice : notification simple");
  // 2. S'abonner au canal notifications (5000 ms d'attente maximum).
  await subscriber.subscribe(new Set(["notifications"]), 5000);

  const received = new Promise<void>((resolve) => {
    onMessage = () => resolve();
  });

  // 5. Publier le message hello.
  const receivers = await publisher.publish("hello", "notifications");
  console.log(`(publié à ${receivers} abonné(s))`);
  await received;

  section("Pub/Sub n'est pas une queue");
  const nobody = await publisher.publish("payment-created", "payments");
  console.log(`payments : ${nobody} abonné → le message est perdu, rien n'est conservé.`);
} finally {
  subscriber.close();
  publisher.close();
}
