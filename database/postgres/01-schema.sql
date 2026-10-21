-- Schéma relationnel de la marketplace (baseline SQL du TP).
-- Exécuté automatiquement par PostgreSQL au premier démarrage du conteneur.

CREATE TABLE products (
    id          bigint PRIMARY KEY,
    name        text           NOT NULL,
    description text           NOT NULL,
    price       numeric(10, 2) NOT NULL
);

CREATE TABLE categories (
    id   bigint PRIMARY KEY,
    name text NOT NULL UNIQUE
);

-- Un produit peut appartenir à plusieurs catégories (relation N-N).
CREATE TABLE product_categories (
    product_id  bigint REFERENCES products(id),
    category_id bigint REFERENCES categories(id),
    PRIMARY KEY (product_id, category_id)
);

-- Le stock est séparé du produit : il change beaucoup plus souvent.
CREATE TABLE stocks (
    product_id bigint PRIMARY KEY REFERENCES products(id),
    quantity   integer NOT NULL CHECK (quantity >= 0)
);

CREATE TABLE customers (
    id    bigint PRIMARY KEY,
    name  text NOT NULL,
    email text NOT NULL UNIQUE
);

CREATE TABLE commands (
    id          bigint PRIMARY KEY,
    customer_id bigint REFERENCES customers(id),
    status      text        NOT NULL,
    created_at  timestamptz NOT NULL
);

-- unit_price est un snapshot : le prix payé reste figé même si products.price change.
CREATE TABLE command_lines (
    id          bigint PRIMARY KEY,
    command_id  bigint REFERENCES commands(id),
    product_id  bigint REFERENCES products(id),
    quantity    integer        NOT NULL,
    unit_price  numeric(10, 2) NOT NULL
);
