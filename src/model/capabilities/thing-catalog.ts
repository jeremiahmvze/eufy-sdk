/**
 * The products' thing descriptions as data: per identifier, what every product's description states about
 * it — its types, its access, its range and unit where the products agree, and for an option list every
 * option any product names and each distinct list a product states. Generated from a corpus of descriptions
 * (`thing-catalog.generated.json`, do not edit by hand) by `scripts/dev/thing-catalog.ts`.
 *
 * A device's own description stays the authority on what that device offers: this is what the products
 * state between them, known before any device is bound. Labels are the descriptions' own text, as the
 * vendor writes it (some are translation keys, some are not English).
 *
 * @module model/capabilities/thing-catalog
 */
import DATA from "./thing-catalog.generated.json" with { type: "json" };

/** One distinct option list a product's description states for an identifier. */
export interface ThingOptionSet {
  /** The options' values (the app's UI values), in the order the description lists them. */
  readonly values: readonly string[];
  /** Each value's label, as the products stating this list most often give it. */
  readonly labels: Readonly<Record<string, string>>;
  /** Each value's `associatedValue`: the value the device stores for that option, where the list names one. */
  readonly raw?: Readonly<Record<string, string>>;
  /** The product codes whose description states exactly this list. */
  readonly products: readonly string[];
}

/** What the products' descriptions state about one identifier. */
export interface ThingCatalogEntry {
  /** Each `data_type.type` a product states (`bool`, `int`, `enum`, `string`, …). */
  readonly type: readonly string[];
  /** Each `access_mode` a product states (`R`, `RW`, …). */
  readonly access: readonly string[];
  /** Bounds, step and unit, where every product stating one agrees. */
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly unit?: string;
  /** For an option list: every value any product names, with its most common label. */
  readonly options?: Readonly<Record<string, string>>;
  /** For an option list: each distinct list a product states, most stated first. */
  readonly sets?: readonly ThingOptionSet[];
}

const CATALOG = DATA as unknown as {
  readonly source: { readonly corpus: string; readonly things: Readonly<Record<string, string>> };
  readonly identifiers: Readonly<Record<string, ThingCatalogEntry>>;
};

/** What the products' descriptions state about `identifier`; `undefined` for one no product describes. */
export function thingCatalog(identifier: string): ThingCatalogEntry | undefined {
  return Object.hasOwn(CATALOG.identifiers, identifier) ? CATALOG.identifiers[identifier] : undefined;
}

/**
 * Every numeric option the products name for any of `identifiers`, labelled as the first identifier naming
 * the value labels it; `undefined` where none names one. The domain of a member that resolves its options per
 * device from the product's description, before a device is bound.
 */
export function catalogOptions(identifiers: readonly string[]): Record<number, string> | undefined {
  const out: Record<number, string> = {};
  for (const identifier of identifiers) {
    for (const [value, label] of Object.entries(thingCatalog(identifier)?.options ?? {})) {
      if (/^-?\d+$/.test(value) && !(Number(value) in out)) out[Number(value)] = label;
    }
  }
  return Object.keys(out).length ? out : undefined;
}
