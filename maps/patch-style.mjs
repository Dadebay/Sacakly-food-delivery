import { readFile, writeFile } from "node:fs/promises";

const [, , sourcePath, destinationPath] = process.argv;

if (!sourcePath || !destinationPath) {
  throw new Error("Usage: node patch-style.mjs <source> <destination>");
}

const style = JSON.parse(await readFile(sourcePath, "utf8"));
const sourceId = "versatiles-shortbread";

if (!style.sources?.[sourceId]) {
  throw new Error(`The upstream style does not define ${sourceId}`);
}

style.name = "Saçakly Colorful OpenStreetMap";
style.glyphs = "{fontstack}/{range}.pbf";
style.sprite = "basics/sprites";
style.sources[sourceId] = {
  type: "vector",
  url: "mbtiles://{turkmenistan}",
  attribution:
    '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
};

await writeFile(destinationPath, `${JSON.stringify(style, null, 2)}\n`);
