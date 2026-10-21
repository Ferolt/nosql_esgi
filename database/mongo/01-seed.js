// Seed MongoDB : exécuté par mongosh au premier démarrage, dans la base marketplace.
// Mêmes données métier que PostgreSQL, mais pensées pour être lues comme des documents.

db.customers.insertMany([
  { _id: "customer-1", name: "Alice Martin", email: "alice@example.com", country: "FR" },
  { _id: "customer-2", name: "Nassim Bernard", email: "nassim@example.com", country: "BE" },
]);

db.products.insertMany([
  {
    _id: "product-1",
    name: "Laptop Pro 14",
    description: "Ordinateur portable performant",
    price: 1499,
    categories: [{ id: "computers", name: "Ordinateurs" }],
    stock: { quantity: 12, reserved: 3, warehouse: "PAR" },
    variants: [
      { color: "black", price: 1499, stock: 0 },
      { color: "silver", price: 1899, stock: 12 },
    ],
  },
  {
    _id: "product-2",
    name: "Clavier mécanique",
    description: "Clavier RGB switch brown",
    price: 129,
    categories: [{ id: "accessories", name: "Accessoires" }],
    stock: { quantity: 50, reserved: 0, warehouse: "LYS" },
    variants: [
      { color: "black", price: 129, stock: 40 },
      { color: "white", price: 139, stock: 10 },
    ],
  },
  {
    _id: "product-3",
    name: "Souris verticale",
    description: "Souris ergonomique sans fil",
    price: 59,
    categories: [
      { id: "accessories", name: "Accessoires" },
      { id: "ergonomics", name: "Ergonomie" },
    ],
    stock: { quantity: 30, reserved: 2, warehouse: "PAR" },
    variants: [{ color: "grey", price: 59, stock: 30 }],
  },
  {
    _id: "product-5",
    name: "Hub USB-C",
    description: "Hub 7 ports avec alimentation",
    price: 39,
    categories: [{ id: "accessories", name: "Accessoires" }],
    stock: { quantity: 5, reserved: 0, warehouse: "LYS" },
    variants: [{ color: "grey", price: 39, stock: 5 }],
  },
]);

// Une commande embarque ses lignes et un snapshot du produit au moment de l'achat.
db.commands.insertMany([
  {
    _id: "command-1",
    customer: { id: "customer-1", name: "Alice Martin", country: "FR" },
    status: "paid",
    createdAt: new Date("2026-09-01T10:00:00Z"),
    lines: [
      { productId: "product-1", productName: "Laptop Pro 14", categoryId: "computers", quantity: 1, unitPrice: 1499 },
      { productId: "product-2", productName: "Clavier mécanique", categoryId: "accessories", quantity: 1, unitPrice: 129 },
    ],
  },
  {
    _id: "command-2",
    customer: { id: "customer-1", name: "Alice Martin", country: "FR" },
    status: "pending",
    createdAt: new Date("2026-09-02T14:30:00Z"),
    lines: [
      { productId: "product-3", productName: "Souris verticale", categoryId: "accessories", quantity: 2, unitPrice: 59 },
    ],
  },
  {
    _id: "command-3",
    customer: { id: "customer-2", name: "Nassim Bernard", country: "BE" },
    status: "paid",
    createdAt: new Date("2026-09-03T09:15:00Z"),
    lines: [
      { productId: "product-3", productName: "Souris verticale", categoryId: "accessories", quantity: 3, unitPrice: 59 },
      { productId: "product-2", productName: "Clavier mécanique", categoryId: "accessories", quantity: 1, unitPrice: 129 },
    ],
  },
  {
    _id: "command-4",
    customer: { id: "customer-2", name: "Nassim Bernard", country: "BE" },
    status: "cancelled",
    createdAt: new Date("2026-08-20T16:00:00Z"),
    lines: [
      { productId: "product-1", productName: "Laptop Pro 14", categoryId: "computers", quantity: 1, unitPrice: 1499 },
    ],
  },
  {
    _id: "command-5",
    customer: { id: "customer-1", name: "Alice Martin", country: "FR" },
    status: "paid",
    createdAt: new Date("2026-08-28T11:45:00Z"),
    lines: [
      { productId: "product-5", productName: "Hub USB-C", categoryId: "accessories", quantity: 2, unitPrice: 39 },
      { productId: "product-1", productName: "Laptop Pro 14", categoryId: "computers", quantity: 1, unitPrice: 1449 },
    ],
  },
]);
