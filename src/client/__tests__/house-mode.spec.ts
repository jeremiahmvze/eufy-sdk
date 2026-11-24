import { describe, it, expect, vi, beforeEach } from "vitest";
import { EufyMega } from "../eufy-mega.js";
import type { EufyDevice } from "../../core/types.js";
import type { Command } from "../../core/contracts.js";
import { ArmingMode } from "../../model/capabilities/arming.js";

/**
 * `setHouseMode` as the app's house arming runs it: the cloud config first, then the stations its
 * `get_home_config` names (else the house's own), written in parallel where online and not already in the
 * mode. Serials and ids are synthetic.
 */
const HOUSE = "house-0";
const BASE = "T8030P0000000000";
const SOLO = "T8113P0000000000";
const OFFLINE = "T8030P0000000001";
const SAME = "T8030P0000000002";
const LOCK = "T8520P0000000000";
const GUEST = "T8010P0000000000";
const OTHER_HOUSE = "T8010P0000000001";

const common = { category: "eufy_security", api: "mega", realtime: "p2p", houseId: HOUSE, memberType: 2 };
const FLEET = [
  { ...common, sn: BASE, stationSn: BASE, params: { 1131: "1", 1224: "63" } },
  { ...common, sn: SOLO, stationSn: SOLO, params: { 1131: "1" } },
  { ...common, sn: OFFLINE, stationSn: OFFLINE, params: { 1131: "0", 1224: "63" } },
  { ...common, sn: SAME, stationSn: SAME, params: { 1131: "1", 1224: "0" } },
  { ...common, sn: LOCK, stationSn: LOCK, params: { 1131: "1" } },
  { ...common, sn: GUEST, stationSn: GUEST, memberType: 0, params: { 1131: "1" } },
  { ...common, sn: OTHER_HOUSE, stationSn: OTHER_HOUSE, houseId: "house-1", params: { 1131: "1" } },
] as unknown as EufyDevice[];

function client(stationSns: string[] | undefined, cloud: (path: string) => unknown = () => ({})) {
  const eufy = new EufyMega({ email: "t@example.com", password: "x" });
  const posts: Array<[string, string, unknown]> = [];
  const sent: Array<[string, Command]> = [];
  const t = eufy as any;
  t.mega.post = async (service: string, path: string, body: unknown) => {
    posts.push([service, path, body]);
    const answer = cloud(path);
    if (answer instanceof Error) throw answer;
    return path.endsWith("get_home_config") ? { station_sns: stationSns } : answer;
  };
  vi.spyOn(t.registry, "list").mockReturnValue(FLEET);
  vi.spyOn(t.registry, "paramOf").mockImplementation(
    (sn: unknown, p: unknown) => FLEET.find((d) => d.sn === sn)?.params?.[p as number],
  );
  vi.spyOn(t, "commandContext").mockImplementation(async (sn: unknown) => ({
    channel: 0,
    paramIds: new Set(),
    serial: sn,
  }));
  t.routeAndReflect = async (sn: string, cmd: Command) => (sent.push([sn, cmd]), sn !== SOLO);
  return { eufy, posts, sent };
}

describe("setHouseMode", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("updates the cloud config, then writes the online stations it names whose mode differs", async () => {
    const c = client([BASE, SOLO, OFFLINE, SAME, "T8030P0000000099"]);
    const results = await c.eufy.setHouseMode(HOUSE, ArmingMode.away);
    expect(c.posts).toEqual([
      ["butler", "/app/butler/update_home_config", { house_id: HOUSE, arm_status: 2 }],
      ["butler", "/app/butler/get_home_config", { house_id: HOUSE }],
    ]);
    expect(c.sent.map(([sn, cmd]) => [sn, cmd.kind, (cmd as { channel: number }).channel])).toEqual([
      [BASE, "p2p-station-scalar", 255],
      [SOLO, "p2p-station-scalar", 0],
    ]);
    expect(results).toEqual([
      { sn: BASE, result: "answered" },
      { sn: SOLO, result: "failed" },
      { sn: OFFLINE, result: "skipped" },
      { sn: SAME, result: "skipped" },
    ]);
  });

  it("treats an unreported mode as home", async () => {
    const c = client([SOLO]);
    expect(await c.eufy.setHouseMode(HOUSE, ArmingMode.home)).toEqual([{ sn: SOLO, result: "skipped" }]);
  });

  it("falls back to the house's own stations the app arms when the config names none it knows", async () => {
    const c = client(["T8030P0000000099"]);
    await c.eufy.setHouseMode(HOUSE, ArmingMode.disarmed);
    expect(c.posts[0]?.[2]).toEqual({ house_id: HOUSE, arm_status: 3 });
    expect(c.sent.map(([sn]) => sn)).toEqual([SOLO, SAME]);
  });

  it("sends nothing when the cloud refuses the config", async () => {
    const c = client([BASE], (path) => (path.endsWith("update_home_config") ? new Error("refused") : {}));
    await expect(c.eufy.setHouseMode(HOUSE, ArmingMode.away)).rejects.toThrow("refused");
    expect(c.posts).toHaveLength(1);
    expect(c.sent).toEqual([]);
  });
});
