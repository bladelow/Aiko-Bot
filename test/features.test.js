const test = require("node:test");
const assert = require("node:assert/strict");
const { isLinkModerationBypassed } = require("../events/moderation");
const { extractCandidates, retentionScore } = require("../ai/memoryService");
const { parseRemoteSettings } = require("../web/panel");

const settings = {
    allowServerOwner: true,
    allowAdministrators: true,
    ignoredLinkRoles: ["role-allowed"]
};

function member(id, roleIds = [], administrator = false) {
    return {
        id,
        permissions: { has: permission => administrator && permission === "Administrator" },
        roles: { cache: { map: callback => roleIds.map(id => callback({ id })) } }
    };
}

test("server owner, administrators, and configured link-bypass roles are exempt", () => {
    const guild = { ownerId: "owner" };
    assert.equal(
        isLinkModerationBypassed({ guild, author: { id: "owner" }, member: null }, settings),
        true
    );
    assert.equal(
        isLinkModerationBypassed({
            guild,
            author: { id: "admin" },
            member: member("admin", [], true)
        }, settings),
        true
    );
    assert.equal(
        isLinkModerationBypassed({
            guild,
            author: { id: "role-user" },
            member: member("role-user", ["role-allowed"])
        }, settings),
        true
    );
    assert.equal(
        isLinkModerationBypassed({
            guild,
            author: { id: "regular" },
            member: member("regular", ["other-role"])
        }, settings),
        false
    );
});

test("memory candidate extraction prioritizes durable preferences", () => {
    const candidates = extractCandidates("I really love Minecraft and play it every day.");
    assert.equal(candidates[0].type, "preference");
});

test("old unreinforced memories decay while high-priority memories remain strong", () => {
    const now = Date.now();
    const old = new Date(now - 45 * 24 * 60 * 60 * 1000).toISOString();
    const lowPriority = {
        memoryType: "fact",
        importance: 0.45,
        confidence: 0.45,
        supportCount: 1,
        createdAt: old
    };
    const highPriority = {
        ...lowPriority,
        importance: 0.95,
        confidence: 0.85
    };
    assert.ok(retentionScore(lowPriority, now) < 0.12);
    assert.ok(retentionScore(highPriority, now) > retentionScore(lowPriority, now));
});

test("remote panel accepts encoded supported settings and rejects unknown keys", () => {
    const encoded = value => Buffer.from(JSON.stringify(value)).toString("base64");
    assert.deepEqual(
        parseRemoteSettings(encoded({ aiEnabled: true, quizWinnerCoins: 50 })),
        { aiEnabled: true, quizWinnerCoins: 50 }
    );
    assert.throws(
        () => parseRemoteSettings(encoded({ token: "should-not-be-editable" })),
        /Unsupported setting/
    );
    assert.throws(
        () => parseRemoteSettings(encoded({ memoryDeleteThreshold: 5 })),
        /must be a number/
    );
});
