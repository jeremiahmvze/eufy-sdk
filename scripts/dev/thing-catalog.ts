/**
 * Build `src/model/capabilities/thing-catalog.generated.json` from a corpus of product thing descriptions:
 * per identifier, what the descriptions state about it across every product.
 *
 *   node scripts/dev/thing-catalog.ts <corpus-dir>
 *
 * `<corpus-dir>` is what `things-corpus.ts` writes; only `things/<code>.json` is read. The catalog holds no
 * account data and no vendor code: identifiers, types, ranges, units, option values and their labels.
 *
 * Per identifier:
 * - `type`: the description's `data_type.type`, each one a product states (most products state one);
 * - `access`: each `access_mode` a product states;
 * - `min`/`max`/`step`/`unit`: where every product stating them agrees;
 * - for an option list (`eunmList`): `options`, every value any product lists with its most common label,
 *   and `sets`, each distinct list a product states — its values in the product's order, the label and
 *   raw value (`associatedValue`) each carries there, and the products stating it.
 *
 * A set keeps its own labels because one value means different things on different products: a set's
 * `raw` names the value the device stores for each option, and the products let a set be joined to the
 * same products' other identifiers.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** One `eunmList` entry as a description carries it. */
interface Entry {
  value?: unknown;
  desc?: unknown;
  associatedValue?: unknown;
}

/** One property as a description carries it. */
interface Property {
  identifier?: string;
  access_mode?: string;
  data_type?: {
    type?: string;
    specs?: { min?: unknown; max?: unknown; step?: unknown; unit?: unknown; eunmList?: Entry[] };
  };
}

/** One distinct option list: values in the product's order, their labels and raw values, and who states it. */
export interface OptionSet {
  values: string[];
  labels: Record<string, string>;
  raw?: Record<string, string>;
  products: string[];
}

/** What the descriptions state about one identifier. */
export interface CatalogEntry {
  type: string[];
  access: string[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: Record<string, string>;
  sets?: OptionSet[];
}

export interface Catalog {
  source: { corpus: string; things: Record<string, string> };
  identifiers: Record<string, CatalogEntry>;
}

/** One option list while the products stating it are read: each value's labels and raw values as stated. */
interface Tally {
  values: string[];
  labels: Map<string, string[]>;
  raw: Map<string, string[]>;
  products: string[];
}

/** The one value every product stating it agrees on, else `undefined`. */
function agreed<T>(values: (T | undefined)[]): T | undefined {
  const stated = values.filter((v): v is T => v !== undefined && v !== "");
  return stated.length && stated.every((v) => v === stated[0]) ? stated[0] : undefined;
}

const number = (v: unknown): number | undefined =>
  v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? undefined : Number(v);

/** The most common label, ties to the first in sort order. */
function common(labels: string[]): string {
  const counts = new Map<string, number>();
  for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
}

/** The catalog of the descriptions under `corpus/things`, each keyed by its product code. */
export function buildCatalog(corpus: string): Catalog {
  const files = readdirSync(join(corpus, "things"))
    .filter((f) => f.endsWith(".json"))
    .sort();
  const things: Record<string, string> = {};
  const rows = new Map<string, { product: string; p: Property }[]>();
  for (const file of files) {
    const product = file.slice(0, -".json".length);
    const text = readFileSync(join(corpus, "things", file), "utf8");
    things[product] = createHash("sha256").update(text).digest("hex").slice(0, 12);
    for (const p of (JSON.parse(text) as { properties?: Property[] }).properties ?? []) {
      if (!p.identifier) continue;
      rows.set(p.identifier, [...(rows.get(p.identifier) ?? []), { product, p }]);
    }
  }

  const identifiers: Record<string, CatalogEntry> = {};
  for (const id of [...rows.keys()].sort()) {
    const all = rows.get(id)!;
    const specs = all.map(({ p }) => p.data_type?.specs);
    const entry: CatalogEntry = {
      type: [...new Set(all.map(({ p }) => p.data_type?.type).filter((t): t is string => !!t))].sort(),
      access: [...new Set(all.map(({ p }) => p.access_mode).filter((a): a is string => !!a))].sort(),
    };
    const min = agreed(specs.map((s) => number(s?.min)));
    const max = agreed(specs.map((s) => number(s?.max)));
    const step = agreed(specs.map((s) => number(s?.step)));
    const unit = agreed(specs.map((s) => (typeof s?.unit === "string" ? s.unit.trim() : undefined)));
    if (min !== undefined) entry.min = min;
    if (max !== undefined) entry.max = max;
    if (step !== undefined) entry.step = step;
    if (unit !== undefined) entry.unit = unit;

    const listed = all
      .map(({ product, p }) => ({
        product,
        list: (p.data_type?.specs?.eunmList ?? []).filter(
          (e) => e.value !== undefined && e.value !== null && String(e.value) !== "",
        ),
      }))
      .filter(({ list }) => list.length);
    if (listed.length) {
      const labels = new Map<string, string[]>();
      const sets = new Map<string, Tally>();
      for (const { product, list } of listed) {
        const values = list.map((e) => String(e.value));
        const key = JSON.stringify(values);
        const set: Tally = sets.get(key) ?? { values, labels: new Map(), raw: new Map(), products: [] };
        set.products.push(product);
        for (const e of list) {
          const v = String(e.value);
          const label = String(e.desc ?? "").trim();
          if (label) {
            labels.set(v, [...(labels.get(v) ?? []), label]);
            set.labels.set(v, [...(set.labels.get(v) ?? []), label]);
          }
          if (e.associatedValue !== undefined && e.associatedValue !== null && String(e.associatedValue) !== "") {
            set.raw.set(v, [...(set.raw.get(v) ?? []), String(e.associatedValue)]);
          }
        }
        sets.set(key, set);
      }
      const byValue = (a: string, b: string) => Number(a) - Number(b) || a.localeCompare(b);
      entry.options = Object.fromEntries(
        [...labels].sort((a, b) => byValue(a[0], b[0])).map(([v, l]) => [v, common(l)]),
      );
      entry.sets = [...sets.values()]
        .sort(
          (a, b) =>
            b.products.length - a.products.length || JSON.stringify(a.values).localeCompare(JSON.stringify(b.values)),
        )
        .map((s) => ({
          values: s.values,
          labels: Object.fromEntries([...s.labels].map(([v, l]) => [v, common(l)])),
          ...(s.raw.size ? { raw: Object.fromEntries([...s.raw].map(([v, r]) => [v, common(r)])) } : {}),
          products: s.products,
        }));
    }
    identifiers[id] = entry;
  }
  return { source: { corpus: basename(corpus).replace(/^corpus-/, ""), things }, identifiers };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const corpus = process.argv[2];
  if (!corpus) {
    console.error("usage: node scripts/dev/thing-catalog.ts <corpus-dir>");
    process.exit(1);
  }
  const out = fileURLToPath(new URL("../../src/model/capabilities/thing-catalog.generated.json", import.meta.url));
  const catalog = buildCatalog(corpus);
  writeFileSync(out, `${JSON.stringify(catalog)}\n`);
  console.log(
    `wrote ${Object.keys(catalog.identifiers).length} identifiers from ${Object.keys(catalog.source.things).length} products`,
  );
}
