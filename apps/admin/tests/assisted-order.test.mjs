import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  findExactAssistedCustomer,
  getPreferredAssistedAddress,
  toSavedAddressSelection,
} from "../src/widgets/assisted-order/model/assisted-customer-selection.ts";

const addresses = [
  {
    id: "older-address",
    deliveryEtrapId: null,
    label: "Офис",
    address: "Старый адрес",
    latitude: 37.91,
    longitude: 58.31,
    entrance: null,
    floor: null,
    apartment: null,
    isActive: false,
  },
  {
    id: "active-address",
    deliveryEtrapId: 25,
    label: "Дом",
    address: "Активный адрес",
    latitude: 37.95,
    longitude: 58.38,
    entrance: "2",
    floor: "3",
    apartment: "12",
    isActive: true,
  },
];

const customer = {
  id: "customer-1",
  phone: "+993 65 123456",
  firstName: "Ayna",
  lastName: null,
  addresses,
};

test("exact caller match selects their active saved address and all address fields", () => {
  assert.equal(findExactAssistedCustomer([customer], "+99365123456"), customer);
  assert.equal(findExactAssistedCustomer([customer], "123456"), null);

  const preferred = getPreferredAssistedAddress(customer);
  assert.equal(preferred, addresses[1]);
  assert.deepEqual(toSavedAddressSelection(preferred), {
    values: {
      addressId: "active-address",
      deliveryEtrapId: "25",
      addressLabel: "Дом",
      address: "Активный адрес",
      entrance: "2",
      floor: "3",
      apartment: "12",
    },
    coordinates: { latitude: 37.95, longitude: 58.38 },
  });
});

test("phone order uses real typed APIs and is lazy-loaded from the order board", async () => {
  const board = await readFile(
    new URL("../src/widgets/order-board/ui/order-board.tsx", import.meta.url),
    "utf8",
  );
  const action = await readFile(
    new URL(
      "../src/features/assisted-order/api/use-assisted-order-actions.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const customers = await readFile(
    new URL(
      "../src/entities/customer/api/customer-queries.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    board,
    /lazy\(\(\) => import\("@\/src\/widgets\/assisted-order"\)\)/,
  );
  assert.match(board, /data-testid="assisted-order-open"/);
  assert.match(board, /"OPERATOR", "ADMIN", "SUPER_ADMIN"/);
  assert.match(action, /authorizedRequest<Order>\("\/orders\/assisted"/);
  assert.match(
    action,
    /invalidateQueries\(\{ queryKey: orderQueryKeys\.all \}\)/,
  );
  assert.match(customers, /\/orders\/assisted\/customers\?/);
});

test("address search uses an in-flow choose-then-map workflow", async () => {
  const dialog = await readFile(
    new URL(
      "../src/widgets/assisted-order/ui/assisted-order-dialog.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const geocoding = await readFile(
    new URL(
      "../src/entities/geocoding/api/geocoding-queries.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const map = await readFile(
    new URL(
      "../src/widgets/assisted-order/ui/assisted-order-map-picker.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const deliverySelection = await readFile(
    new URL(
      "../src/widgets/assisted-order/model/assisted-order-delivery.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const styles = await readFile(
    new URL("../src/app/styles/globals.css", import.meta.url),
    "utf8",
  );

  assert.match(dialog, /onClick=\{findAddress\}/);
  assert.match(dialog, /ADDRESS_SEARCH_DEBOUNCE_MS = 350/);
  assert.match(dialog, /window\.setTimeout/);
  assert.match(dialog, /window\.clearTimeout/);
  assert.match(dialog, /role="combobox"/);
  assert.match(dialog, /role="listbox"/);
  assert.match(dialog, /role="option"/);
  assert.match(dialog, /data-testid="assisted-address-workflow"/);
  assert.match(dialog, /data-testid="assisted-address-search-panel"/);
  assert.match(dialog, /Выберите вариант — карта переместится к нему/);
  assert.match(dialog, /Улица, дом или известное место/);
  assert.match(dialog, /data-testid="assisted-address-change"/);
  assert.match(dialog, /data-testid="assisted-courier-address-details"/);
  assert.match(dialog, /selectedLocationLabel/);
  assert.match(dialog, /setSelectedLocationLabel\(result\.label\)/);
  assert.match(dialog, /\(!coordinates \|\| isAddressEditing\) &&/);
  assert.match(
    dialog,
    /function findAddress[\s\S]*?setIsAddressEditing\(true\);[\s\S]*?setIsAddressDropdownOpen\(true\);/,
  );
  assert.match(dialog, /Эти поля не двигают маркер/);
  assert.match(dialog, /Ориентир для курьера \(необязательно\)/);
  assert.match(dialog, /buildAssistedOrderDeliverySelection/);
  assert.match(deliverySelection, /buildAssistedDeliveryAddress/);
  assert.match(deliverySelection, /canReuseAssistedSavedAddress/);
  assert.match(dialog, /data-testid="assisted-delivery-pricing"/);
  assert.match(dialog, /useDeliveryQuote/);
  assert.doesNotMatch(dialog, /setValue\("addressSearch", officialAddress/);
  assert.match(
    dialog,
    /function editAddressSearch[\s\S]*?setIsAddressEditing\(true\);[\s\S]*?function startAddressSearch/,
  );
  assert.doesNotMatch(
    dialog.match(
      /function editAddressSearch[\s\S]*?function startAddressSearch/,
    )?.[0] ?? "",
    /setCoordinates\(null\)/,
  );
  assert.match(dialog, /data-testid="assisted-delivery-etrap-auto"/);
  assert.match(dialog, /data-testid="assisted-delivery-fallback"/);
  assert.doesNotMatch(dialog, /Подтвердите тарифный район вручную/);
  assert.doesNotMatch(dialog, /<span>Район \/ этрап доставки<\/span>/);
  assert.match(
    dialog,
    /setValue\("deliveryEtrapId", "", \{ shouldValidate: true \}\)/,
  );
  assert.match(deliverySelection, /values\.deliveryEtrapId/);
  assert.match(dialog, /estimatedDeliveryFee\.toFixed\(2\)/);
  assert.match(dialog, /variantId: variant\.id/);
  assert.match(dialog, /assisted-product-variant-/);
  assert.match(dialog, /Выберите вариант/);
  assert.match(dialog, /disabled=\{requiresVariant && !selectedVariant\}/);
  assert.doesNotMatch(dialog, /\?\? variants\[0\]/);
  assert.match(dialog, /activeVariants\(product\)/);
  assert.match(map, /data-testid="assisted-order-map"/);
  assert.match(map, /ResizeObserver/);
  assert.match(map, /data-testid="assisted-map-status"/);
  assert.match(map, /data-testid="assisted-map-instruction"/);
  assert.match(map, /Точка выбрана/);
  assert.match(geocoding, /\/geocoding\/search\?/);
  assert.doesNotMatch(geocoding, /setTimeout|debounce/);
  assert.match(
    styles,
    /\.assisted-order-modal \{[\s\S]*?width: min\(1580px, 100%\);[\s\S]*?max-height: calc\(100dvh - 24px\);/,
  );
  assert.match(
    styles,
    /@media \(max-width: 620px\)[\s\S]*?\.assisted-order-modal \{[\s\S]*?max-height: 100dvh;/,
  );
  assert.match(styles, /height: clamp\(320px, 38vh, 450px\)/);
  assert.match(
    styles,
    /\.assisted-address-results \{[\s\S]*?position: static;[\s\S]*?max-height: 260px;/,
  );
  assert.match(
    styles,
    /@media \(max-width: 620px\)[\s\S]*?\.assisted-order-map,[\s\S]*?height: 340px;/,
  );
  assert.match(styles, /\.assisted-order-modal input[\s\S]*border-color:/);
});
