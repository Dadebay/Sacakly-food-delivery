import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const clientHtmlUrl = new URL("../dist/client/index.html", import.meta.url);

test("builds a static React entry document", async () => {
  const html = await readFile(clientHtmlUrl, "utf8");

  assert.match(html, /<div id="root" data-testid="admin-root">/);
  assert.match(html, /A7-tagam — центр управления доставкой/);
  assert.match(html, /\/a7-tagam-logo\.png/);
  assert.match(html, /\/a7-tagam-logo\.webp/);
  assert.match(
    html,
    /Администрирование заказов, кухни, курьеров, каталога, промокодов и наличных/,
  );
  assert.match(
    html,
    /<script type="module" crossorigin src="\/assets\/.+\.js">/,
  );
  assert.doesNotMatch(html, /_next|__next|vinext|react-server-dom/);
});

test("production assets avoid HTTP-filtered semantic chunk names", async () => {
  const assets = await readdir(
    new URL("../dist/client/assets/", import.meta.url),
  );

  assert.ok(assets.some((asset) => asset.startsWith("chunk-")));
  assert.equal(
    assets.some((asset) => /runtime/i.test(asset)),
    false,
    "Telecom resets temporary HTTP requests whose URL contains runtime",
  );
});

test("emits only the static client bundle deployed to the VDS", async () => {
  const outputs = await readdir(new URL("../dist/", import.meta.url));

  assert.deepEqual(outputs, ["client"]);
});

test("Nginx serves browser routes through the SPA entry document", async () => {
  const config = await readFile(
    new URL("../nginx.conf", import.meta.url),
    "utf8",
  );

  assert.match(config, /try_files \$uri \$uri\/ \/index\.html;/);
  assert.match(config, /gzip on;/);
  assert.match(config, /gzip_types[^;]*application\/javascript[^;]*text\/css/);
  assert.doesNotMatch(config, /proxy_pass|fastcgi_pass/);
});

test("production gateway compresses static assets and JSON API responses", async () => {
  const config = await readFile(
    new URL("../../../docs/legacy/deploy/nginx/alowalow-production.conf", import.meta.url),
    "utf8",
  );

  assert.match(config, /gzip on;/);
  assert.match(config, /gzip_proxied any;/);
  assert.match(config, /gzip_types[^;]*application\/json/);
  assert.match(config, /gzip_types[^;]*application\/javascript/);
  assert.match(config, /gzip_types[^;]*text\/css/);
});
