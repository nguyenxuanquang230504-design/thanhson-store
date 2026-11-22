# API documentation

## Public

- `GET /health` — application health and product count
- `GET /api/products` — product list/search
- `GET /api/products/:id` — product detail
- `GET /api/cart` — current session cart
- `POST /api/cart/add` — add `{ id, qty }`
- `POST /api/cart/update` — update `{ id, qty }`
- `POST /api/cart/remove` — remove `{ id }`
- `GET /api/wishlist` — wishlist
- `POST /api/wishlist/toggle` — toggle `{ id }`
- `POST /api/auth/register` — `{ username, password, fullName, phone }`
- `POST /api/auth/login` — `{ username, password }`
- `POST /api/auth/logout`
- `POST /api/checkout` — customer and address fields; optional `Idempotency-Key`

Mutating endpoints should use same-origin requests. Server returns JSON validation and conflict responses.
