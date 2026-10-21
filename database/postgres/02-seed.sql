-- Petit jeu de données de la marketplace.

INSERT INTO customers (id, name, email) VALUES
    (1, 'Alice Martin', 'alice@example.com'),
    (2, 'Nassim Bernard', 'nassim@example.com');

INSERT INTO products (id, name, description, price) VALUES
    (1, 'Laptop Pro 14', 'Ordinateur portable performant', 1499.00),
    (2, 'Clavier mécanique', 'Clavier RGB switch brown', 129.00),
    (3, 'Souris verticale', 'Souris ergonomique sans fil', 59.00);

INSERT INTO categories (id, name) VALUES
    (1, 'Ordinateurs'),
    (2, 'Accessoires'),
    (3, 'Ergonomie');

INSERT INTO product_categories (product_id, category_id) VALUES
    (1, 1),
    (2, 2),
    (3, 2),
    (3, 3);

INSERT INTO stocks (product_id, quantity) VALUES
    (1, 12),
    (2, 50),
    (3, 30);

INSERT INTO commands (id, customer_id, status, created_at) VALUES
    (1, 1, 'paid', '2026-09-01T10:00:00Z'),
    (2, 1, 'pending', '2026-09-02T14:30:00Z');

INSERT INTO command_lines (id, command_id, product_id, quantity, unit_price) VALUES
    (1, 1, 1, 1, 1499.00),
    (2, 1, 2, 1, 129.00),
    (3, 2, 3, 2, 59.00);
