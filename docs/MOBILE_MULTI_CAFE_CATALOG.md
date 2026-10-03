# Mobile multi-cafe catalog contract

The customer application treats a cafe as the first catalog level. Cafes are
virtual customer-facing brands prepared at the same operational location; they
are not delivery branches.

## Navigation

1. Load `GET /api/v1/catalog/cafes` and render the returned active cafes in
   `sortOrder`, `name` order. Each card may show `imageUrl`, `name`, and
   `description`.
2. After a cafe is selected, load
   `GET /api/v1/catalog/categories?cafeId=<uuid>`. The response contains only
   that active cafe's active categories and orderable products.
3. A separate product request may use
   `GET /api/v1/catalog/products?cafeId=<uuid>` and may additionally include
   `categoryId=<uuid>`. The filters compose; a category from another cafe
   returns no products.
4. Back navigation returns to the cafe chooser without clearing the cart.
   Selecting another cafe replaces the visible menu, not the cart.
5. Quote and order payloads stay unchanged. Their `items` array may contain
   product IDs from several active cafes. NestJS validates every item and sends
   the complete order to one nearest active branch.

`imageUrl` is a same-origin private media path and must be resolved in the same
way as existing product/category images. Mobile must not infer availability
from cached UI state: a quote or create-order rejection after a cafe is hidden
is authoritative and should prompt a catalog refresh.

## Customer screen composition

The customer home/catalog screen uses this vertical order:

1. Current delivery address at the top. Tapping it opens the existing address
   selection flow.
2. The existing promotional banner carousel.
3. A horizontally scrollable cafe selector showing each cafe image and name.
4. The selected cafe's categories and products.

The cafe selector must feel like part of the A7-tagam brand, not a separate
green marketplace widget. Cafe cards use a calm warm-yellow/cream surface
derived from the existing cream and orange palette, navy text, and a restrained
orange border or indicator for the selected cafe. Do not use green, neon,
high-saturation gradients, or bright glow effects. Unselected cards stay pale;
the selected card may become a little warmer or more saturated without losing
text contrast. Cafe images remain the main visual distinction between cards.

The selector remains visible above the selected cafe menu so the customer can
switch cafes without returning to a separate full-screen chooser. Back from a
category or product returns to this home/catalog composition and never clears
the mixed-cafe cart.

## Backward compatibility

Clients that omit `cafeId` still receive the legacy combined category/product
catalog. New mobile releases should always use the cafe endpoint and filter.
The initial migration creates `Han tagam` and `Panda`; clients must render the
returned records rather than hard-code either name or ID.
Existing cart persistence needs no schema change because cart lines already
store product and variant IDs; cafe identity is display/navigation metadata,
not an order input or a pricing authority.
