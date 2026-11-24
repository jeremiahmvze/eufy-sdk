import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCatalog } from "../thing-catalog.ts";

/** A synthetic corpus: product codes, identifiers, values and labels are made up. */
function corpus(things: Record<string, unknown[]>): string {
  const dir = mkdtempSync(join(tmpdir(), "thing-catalog-"));
  mkdirSync(join(dir, "things"));
  for (const [code, properties] of Object.entries(things)) {
    writeFileSync(join(dir, "things", `${code}.json`), JSON.stringify({ properties }));
  }
  return dir;
}

const option = (value: string, desc: string, associatedValue?: string) => ({ value, desc, associatedValue });
const listing = (identifier: string, ...eunmList: unknown[]) => ({
  identifier,
  access_mode: "RW",
  data_type: { type: "enum", specs: { eunmList } },
});

let dir: string;
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test("an option list keeps every value any product names, and each distinct list with its own labels", () => {
  dir = corpus({
    T0001: [listing("mode_set", option("100", "mode_off", "0"), option("102", "mode_on", "1"))],
    T0002: [listing("mode_set", option("100", "mode_off", "0"), option("102", "mode_on", "1"))],
    T0003: [
      listing("mode_set", option("100", "mode_off", "0"), option("101", "mode_on", "3"), option("102", "mode_on", "1")),
    ],
  });
  const entry = buildCatalog(dir).identifiers.mode_set!;
  expect(entry.options).toEqual({ "100": "mode_off", "101": "mode_on", "102": "mode_on" });
  expect(entry.sets).toEqual([
    {
      values: ["100", "102"],
      labels: { "100": "mode_off", "102": "mode_on" },
      raw: { "100": "0", "102": "1" },
      products: ["T0001", "T0002"],
    },
    {
      values: ["100", "101", "102"],
      labels: { "100": "mode_off", "101": "mode_on", "102": "mode_on" },
      raw: { "100": "0", "101": "3", "102": "1" },
      products: ["T0003"],
    },
  ]);
});

test("a range and unit are kept only where every product stating them agrees", () => {
  const volume = (max: number, unit: string) => ({
    identifier: "volume_set",
    access_mode: "RW",
    data_type: { type: "int", specs: { min: 0, max, step: 1, unit } },
  });
  dir = corpus({ T0001: [volume(100, "%")], T0002: [volume(10, "%")] });
  expect(buildCatalog(dir).identifiers.volume_set).toEqual({
    type: ["int"],
    access: ["RW"],
    min: 0,
    step: 1,
    unit: "%",
  });
});

test("the source names the corpus and a digest of each product's description", () => {
  dir = corpus({ T0001: [listing("mode_set", option("1", "On"))] });
  const { source } = buildCatalog(dir);
  expect(Object.keys(source.things)).toEqual(["T0001"]);
  expect(source.things.T0001).toMatch(/^[0-9a-f]{12}$/);
});
