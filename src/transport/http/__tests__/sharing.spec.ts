import { describe, expect, it, vi } from "vitest";
import { MegaHttpClient } from "../mega-client.js";

const SN = "T8410P0000000000";
const STATION = "T8010P0000000000";
const ref = { invite_id: 7, device_sn: SN, sub_sns: "", category: "eufy_security", owner_user_id: "owner-0" };

function client() {
  const mega = new MegaHttpClient({ email: "synthetic@example.invalid", password: "synthetic", region: "us-pr" });
  return { mega, post: vi.spyOn(mega, "post").mockResolvedValue({}) };
}

describe("MegaHttpClient sharing calls", () => {
  it("invites by email with the app's defaults, forcing admin on eufy_pet, and answers email_sent", async () => {
    const { mega, post } = client();
    post.mockResolvedValueOnce({ email_sent: true });
    const sent = await mega.inviteShare("guest@example.invalid", "Guest", [
      { device_sn: SN, category: "eufy_security", member_type: 0, device_name: "Cam" },
      { device_sn: "PET0000000000000", category: "eufy_pet", member_type: 0 },
    ]);
    expect(sent).toBe(true);
    expect(post).toHaveBeenCalledWith("devicerelation", "/app/devicerelation/device_invite", {
      email: "guest@example.invalid",
      nick_name: "Guest",
      invites: [
        {
          permissions: 0,
          encrypted_data: "",
          sub_sns: "",
          device_sn: SN,
          category: "eufy_security",
          member_type: 0,
          device_name: "Cam",
        },
        {
          permissions: 0,
          encrypted_data: "",
          sub_sns: "",
          device_sn: "PET0000000000000",
          category: "eufy_pet",
          member_type: 1,
        },
      ],
    });
  });

  it("lists members and invites, sending is_inviter as the inverse of own", async () => {
    const { mega, post } = client();
    post.mockResolvedValueOnce({ relateds: [{ member_user_id: "m-0" }] });
    expect(await mega.getShareMembers()).toEqual([{ member_user_id: "m-0" }]);
    expect(post).toHaveBeenLastCalledWith("devicerelation", "/app/devicerelation/get_related", {
      num: 300,
      page: 0,
      orderby: "",
      categories: [],
      add_pns: [],
    });
    post.mockResolvedValueOnce({ invites: [{ id: 7 }] });
    expect(await mega.getShareInvites(false)).toEqual([{ id: 7 }]);
    expect(post).toHaveBeenLastCalledWith("devicerelation", "/app/devicerelation/get_invites", {
      is_inviter: 1,
      categories: [],
      add_pns: [],
    });
    expect(await mega.getShareInvites(true)).toEqual([]);
    expect(post).toHaveBeenLastCalledWith("devicerelation", "/app/devicerelation/get_invites", {
      is_inviter: 0,
      categories: [],
      add_pns: [],
    });
  });

  it("confirms, ignores, updates, promotes and leaves on devicerelation", async () => {
    const { mega, post } = client();
    await mega.confirmShareInvites([ref]);
    expect(post).toHaveBeenLastCalledWith("devicerelation", "/app/devicerelation/confirm_invite", { invites: [ref] });
    await mega.ignoreShareInvites([ref], false);
    expect(post).toHaveBeenLastCalledWith("devicerelation", "/app/devicerelation/ignore_invite", {
      invites: [ref],
      is_inviter: 1,
    });
    await mega.updateShare({ user_id: "m-0", nick_name: "Guest", receive_email: "guest@example.invalid" }, [
      { device_sn: SN, category: "eufy_security", member_type: 0, is_delete: true },
    ]);
    expect(post).toHaveBeenLastCalledWith("devicerelation", "/app/devicerelation/update_share", {
      user_id: "m-0",
      nick_name: "Guest",
      receive_email: "guest@example.invalid",
      devices: [
        { permissions: 0, is_delete: true, sub_devices: [], device_sn: SN, category: "eufy_security", member_type: 0 },
      ],
    });
    await mega.promoteGuest("m-0", [{ device_sn: SN, category: "eufy_security" }]);
    expect(post).toHaveBeenLastCalledWith("devicerelation", "/app/devicerelation/promote_guest", {
      device_sn: "",
      user_id: "m-0",
      promote_devices: [{ device_sn: SN, category: "eufy_security" }],
    });
    const leave = { device_sn: STATION, sub_sns: SN, category: "eufy_security", owner_user_id: "owner-0" };
    await mega.clearShare(leave);
    expect(post).toHaveBeenLastCalledWith("devicerelation", "/app/devicerelation/clear_share", leave);
  });

  it("speaks the home-sharing calls on the house service", async () => {
    const { mega, post } = client();
    const cat = { categories: [], add_pns: [] };
    await mega.inviteHouseMember("house-0", "guest@example.invalid");
    expect(post).toHaveBeenLastCalledWith("house", "/app/house/invite_house_member", {
      house_id: "house-0",
      email: "guest@example.invalid",
      encrypted_data: "",
      ...cat,
    });
    post.mockResolvedValueOnce({ house_invite_records: [{ id: 3 }] });
    expect(await mega.getHouseInvites()).toEqual([{ id: 3 }]);
    expect(post).toHaveBeenLastCalledWith("house", "/app/house/get_house_invite_records", { is_inviter: 1 });
    await mega.confirmHouseInvite("house-0", 3);
    expect(post).toHaveBeenLastCalledWith("house", "/app/house/confirm_house_invited", {
      house_id: "house-0",
      is_inviter: 1,
      invite_id: 3,
      ...cat,
    });
    await mega.ignoreHouseInvite("house-0", 3, true);
    expect(post).toHaveBeenLastCalledWith("house", "/app/house/ignore_house_invited", {
      house_id: "house-0",
      is_inviter: 0,
      invite_id: 3,
      ...cat,
    });
    await mega.removeHouseUser("house-0", "m-0");
    expect(post).toHaveBeenLastCalledWith("house", "/app/house/remove_house_user", {
      house_id: "house-0",
      user_id: "m-0",
      ...cat,
    });
    await mega.leaveHouse("house-0");
    expect(post).toHaveBeenLastCalledWith("house", "/app/house/clear_share_member", { house_id: "house-0", ...cat });
  });
});
