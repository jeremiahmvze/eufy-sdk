import { CAPABILITY_MODULES } from "../index.js";
import { catalogOptions, thingCatalog } from "../thing-catalog.js";

type Member = {
  thing?: readonly string[];
  enumValuesFor?: unknown;
  enumValues?: Record<number, string>;
  type?: string;
};

/** Every member that resolves its options per device from the identifiers it declares. */
const perProduct = Object.entries(CAPABILITY_MODULES).flatMap(([capability, module]) =>
  Object.entries((module as { members?: Record<string, Member> }).members ?? {})
    .filter(([, m]) => m?.thing?.length && typeof m.enumValuesFor === "function" && m.type !== "bool")
    .map(([name, m]) => ({ key: `${capability}.${name}`, member: m })),
);

test("every member resolving its options per product declares every option the products name", () => {
  expect(perProduct.length).toBeGreaterThan(0);
  for (const { key, member } of perProduct) {
    if (!member.thing!.some((id) => thingCatalog(id)?.options)) continue;
    expect(member.enumValues, key).toEqual(catalogOptions(member.thing!));
  }
});

test("the night-vision options join both identifiers, the newer one's labels first", () => {
  const options = catalogOptions(["nightvision_type_new", "nightvision_type"])!;
  expect(options[100]).toBe(thingCatalog("nightvision_type_new")!.options!["100"]);
  expect(options[0]).toBe(thingCatalog("nightvision_type")!.options!["0"]);
});

test("an identifier no product describes has no entry", () => {
  expect(thingCatalog("no_such_identifier")).toBeUndefined();
  expect(thingCatalog("__proto__")).toBeUndefined();
  expect(catalogOptions(["no_such_identifier"])).toBeUndefined();
});

test("every option set's values and labels are the description's own strings", () => {
  const quality = thingCatalog("live_streaming_resolution")!;
  for (const set of quality.sets!) {
    for (const value of set.values) expect(typeof value).toBe("string");
    expect(set.products.length).toBeGreaterThan(0);
  }
});
