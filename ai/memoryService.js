const crypto = require("node:crypto");
const { getMemory, saveMemory, getSettings } = require("../database");

const DAY = 24 * 60 * 60 * 1000;
const DEFAULTS = {
    freshLimit: 12,
    freshHours: 24,
    retrievalLimit: 8,
    weeklyAfterDays: 7,
    monthlyAfterDays: 30,
    deleteBelow: 0.12
};
const TYPE_DECAY = {
    temporary: 0.25,
    event: 0.12,
    conversation_summary: 0.1,
    context: 0.08,
    habit: 0.06,
    goal: 0.045,
    project: 0.035,
    fact: 0.03,
    preference: 0.02,
    relationship: 0.015
};

const iso = (value = Date.now()) => new Date(value).toISOString();
const timestamp = value => {
    const parsed = Date.parse(value || "");
    return Number.isFinite(parsed) ? parsed : 0;
};
const config = () => {
    const saved = getSettings();
    const deleteThreshold = Number(saved.memoryDeleteThreshold);
    return {
        freshLimit: Math.max(2, Number(saved.memoryFreshLimit) || DEFAULTS.freshLimit),
        freshHours: Math.max(1, Number(saved.memoryFreshHours) || DEFAULTS.freshHours),
        retrievalLimit: Math.max(1, Number(saved.memoryRetrievalLimit) || DEFAULTS.retrievalLimit),
        weeklyAfterDays: Math.max(1, Number(saved.memoryWeeklyDays) || DEFAULTS.weeklyAfterDays),
        monthlyAfterDays: Math.max(7, Number(saved.memoryMonthlyDays) || DEFAULTS.monthlyAfterDays),
        deleteBelow: Number.isFinite(deleteThreshold)
            ? Math.min(1, Math.max(0, deleteThreshold))
            : DEFAULTS.deleteBelow
    };
};

function emptyStore() {
    return { version: 2, users: {}, universal: [], lastMaintenanceAt: null };
}

function normalizeStore(raw) {
    if (raw && raw.version === 2 && raw.users) {
        raw.universal = Array.isArray(raw.universal) ? raw.universal : [];
        return raw;
    }

    const store = emptyStore();
    if (!raw || typeof raw !== "object") return store;
    for (const [userId, history] of Object.entries(raw)) {
        if (!Array.isArray(history)) continue;
        store.users[userId] = {
            fresh: history.map(item => ({
                role: item.role || "user",
                content: String(item.content || "").slice(0, 2000),
                createdAt: item.createdAt || iso(),
                messageId: item.messageId || null
            })),
            memories: []
        };
    }
    return store;
}

const loadStore = () => normalizeStore(getMemory());
const saveStore = store => saveMemory(store);

function tokens(text) {
    return new Set(
        String(text || "")
            .toLowerCase()
            .normalize("NFKC")
            .replace(/[^\p{L}\p{N}\s]/gu, " ")
            .split(/\s+/)
            .filter(token => token.length > 1)
    );
}

function similarity(first, second) {
    const a = tokens(first);
    const b = tokens(second);
    if (!a.size || !b.size) return 0;
    let overlap = 0;
    for (const token of a) if (b.has(token)) overlap++;
    return overlap / Math.max(a.size, b.size);
}

function extractCandidates(text) {
    const raw = String(text || "").replace(/\s+/g, " ").trim();
    if (raw.length < 8 || raw.length > 1200) return [];
    if (/^(lol|lmao|ok|okay|yes|no|hi|hello|hey|hmm|what|why|how|bruh|bro)[.!?\s]*$/i.test(raw)) {
        return [];
    }
    const patterns = [
        ["preference", /\b(?:i|mai|main|mujhe)\s+(?:really\s+)?(?:like|love|prefer|hate|pasand|acha\s+lagta|accha\s+lagta|pasand\s+hai)\b/i],
        ["preference", /\b(?:my favorite|mera\s+favorite|meri\s+favorite)\b/i],
        ["fact", /\b(?:i am|i'm|my name is|i live|i use|i have|mai\s+hoon|main\s+hoon|mera\s+naam|main\s+rehta|main\s+rahta|mere\s+pass|mere\s+paas|mai\s+use)\b/i],
        ["project", /\b(?:working on|building|developing|coding|making|creating|bana\s+raha|bana\s+rahi|kaam\s+kar\s+raha|project)\b/i],
        ["goal", /\b(?:i want|i plan|my goal|trying to|i'm trying to|mai\s+chahta|main\s+chahta|mera\s+goal|mujhe\s+karna\s+hai|karna\s+chahta)\b/i],
        ["relationship", /\b(?:my friend|my brother|my sister|my family|my best friend|mera\s+dost|meri\s+dost|mera\s+bhai|meri\s+behen|mere\s+parents|mere\s+father|mere\s+dad)\b/i],
        ["habit", /\b(?:always|usually|often|every day|daily|hamesha|aksar|roz|har\s+din)\b/i]
    ];
    const candidates = [];
    for (const [type, pattern] of patterns) {
        if (pattern.test(raw)) candidates.push({ type, text: raw });
        if (candidates.length === 2) break;
    }
    if (/\b(?:remember|yaad\s+rakh|don't\s+forget|mat\s+bhoolna)\b/i.test(raw)) {
        candidates.unshift({ type: "fact", text: raw });
    }
    return candidates.filter((candidate, index, all) =>
        all.findIndex(item => item.type === candidate.type && item.text === candidate.text) === index
    );
}

function weekBucket(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "unknown";
    const day = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - day);
    return date.toISOString().slice(0, 10);
}

function createMemory(userId, content, type, messageId) {
    const now = iso();
    const explicit = /^remembered:/i.test(content);
    return {
        id: crypto.randomUUID(),
        userId,
        content,
        createdAt: now,
        updatedAt: now,
        lastRelevantAt: now,
        lastAccessedAt: null,
        importance: explicit ? 0.95 : (type === "project" || type === "goal" ? 0.7 : 0.45),
        relevance: 0.7,
        confidence: explicit ? 0.85 : 0.45,
        accessCount: 0,
        supportCount: 1,
        memoryType: type,
        compressionLevel: 0,
        weekBucket: weekBucket(now),
        sourceMessageIds: messageId ? [messageId] : [],
        status: "active"
    };
}

function remember(userId, message, reply, metadata = {}) {
    const store = loadStore();
    const user = store.users[userId] || { fresh: [], memories: [] };
    const createdAt = iso();
    const freshCutoff = Date.now() - config().freshHours * 60 * 60 * 1000;
    user.fresh = [
        ...(user.fresh || []).filter(item => timestamp(item.createdAt) >= freshCutoff),
        { role: "user", content: String(message).slice(0, 2000), createdAt, messageId: metadata.messageId || null },
        { role: "assistant", content: String(reply).slice(0, 2000), createdAt }
    ].slice(-config().freshLimit);

    for (const candidate of extractCandidates(message)) {
        const cleaned = candidate.text.replace(/\s+/g, " ").trim();
        const content = `${candidate.type}: ${cleaned}`.slice(0, 650);
        const explicit = /\b(?:remember|yaad\s+rakh|don't\s+forget|mat\s+bhoolna)\b/i.test(message);
        const existing = (user.memories || []).find(memory =>
            memory.status === "active" &&
            memory.memoryType === candidate.type &&
            similarity(memory.content, content) >= 0.42
        );
        if (existing) {
            existing.updatedAt = createdAt;
            existing.lastRelevantAt = createdAt;
            existing.importance = Math.min(1, existing.importance + (explicit ? 0.2 : 0.08));
            existing.confidence = Math.min(1, existing.confidence + 0.1);
            existing.supportCount = (existing.supportCount || 1) + 1;
            existing.compressionLevel = 0;
            existing.weekBucket = weekBucket(createdAt);
            if (metadata.messageId && !existing.sourceMessageIds.includes(metadata.messageId)) {
                existing.sourceMessageIds = [...existing.sourceMessageIds, metadata.messageId].slice(-10);
            }
        } else {
            const memory = createMemory(userId, `${explicit ? "remembered: " : ""}${content}`, candidate.type, metadata.messageId);
            user.memories.push(memory);
        }
    }
    store.users[userId] = user;
    saveStore(store);
    return user;
}

function backfillMemories() {
    const store = loadStore();
    let changed = false;
    for (const [userId, user] of Object.entries(store.users)) {
        user.memories = user.memories || [];
        for (const item of user.fresh || []) {
            if (item.role !== "user") continue;
            for (const candidate of extractCandidates(item.content)) {
                const content = `${candidate.type}: ${candidate.text}`.slice(0, 650);
                if (user.memories.some(memory =>
                    memory.status === "active" &&
                    memory.memoryType === candidate.type &&
                    similarity(memory.content, content) >= 0.42
                )) continue;
                user.memories.push(createMemory(userId, content, candidate.type, item.messageId));
                changed = true;
            }
        }
    }
    if (changed) saveStore(store);
    return store;
}

function scoreMemory(memory, query) {
    const ageDays = Math.max(0, (Date.now() - timestamp(memory.lastRelevantAt || memory.createdAt)) / DAY);
    const decay = Math.min(0.7, ageDays * (TYPE_DECAY[memory.memoryType] || 0.08));
    const reinforcement = Math.min(0.25, (memory.supportCount || 1) * 0.04);
    const recency = Math.max(0, 0.2 - ageDays * 0.01);
    return similarity(memory.content, query) * 0.55 +
        memory.importance * 0.2 +
        memory.confidence * 0.15 +
        reinforcement +
        recency -
        decay;
}

function retentionScore(memory, now = Date.now()) {
    const ageDays = Math.max(0, (now - timestamp(memory.lastRelevantAt || memory.createdAt)) / DAY);
    const decay = Math.min(0.75, ageDays * (TYPE_DECAY[memory.memoryType] || 0.08));
    const reinforcement = Math.min(0.25, Math.max(0, (memory.supportCount || 1) - 1) * 0.025);
    return (Number(memory.importance) || 0) * (Number(memory.confidence) || 0) + reinforcement - decay;
}

function retrieve(userId, query) {
    const store = loadStore();
    const user = store.users[userId] || { fresh: [], memories: [] };
    const freshCutoff = Date.now() - config().freshHours * 60 * 60 * 1000;
    const fresh = (user.fresh || [])
        .filter(item => timestamp(item.createdAt) >= freshCutoff)
        .slice(-6)
        .map(item => ({ text: `${item.role}: ${item.content}`, score: 0.35 }));
    const selected = (user.memories || [])
        .filter(memory => memory.status === "active")
        .map(memory => ({ memory, score: scoreMemory(memory, query) }))
        .filter(item => item.score > 0.08)
        .sort((a, b) => b.score - a.score)
        .slice(0, config().retrievalLimit);
    const now = iso();
    for (const item of selected) {
        item.memory.lastAccessedAt = now;
        item.memory.accessCount = (item.memory.accessCount || 0) + 1;
    }
    if (selected.length) saveStore(store);
    return [
        ...fresh,
        ...selected.map(item => ({
            text: `[${item.memory.memoryType}] ${item.memory.content}`,
            score: item.score
        }))
    ];
}

function summarize(memories, level, bucket) {
    const ranked = [...memories].sort((a, b) => b.importance - a.importance);
    const snippets = [];
    for (const memory of ranked) {
        const snippet = memory.content.replace(/\s+/g, " ").trim();
        if (!snippets.includes(snippet)) snippets.push(snippet);
    }
    const limit = level === 1 ? 5 : (level === 2 ? 4 : 3);
    const maxLength = level === 1 ? 650 : (level === 2 ? 450 : 300);
    let content = snippets.slice(0, limit).join(" | ");
    if (content.length > maxLength) content = `${content.slice(0, maxLength - 3).trim()}...`;
    const summary = { ...ranked[0] };
    summary.id = crypto.randomUUID();
    summary.content = content;
    summary.createdAt = memories.reduce((oldest, item) =>
        timestamp(item.createdAt) < timestamp(oldest) ? item.createdAt : oldest,
    memories[0].createdAt);
    summary.updatedAt = iso();
    summary.lastRelevantAt = memories.reduce((newest, item) =>
        timestamp(item.lastRelevantAt || item.createdAt) > timestamp(newest)
            ? item.lastRelevantAt || item.createdAt
            : newest,
    memories[0].lastRelevantAt || memories[0].createdAt);
    summary.importance = Math.max(...memories.map(item => item.importance || 0));
    summary.confidence = Math.max(...memories.map(item => item.confidence || 0));
    summary.supportCount = memories.reduce((total, item) => total + (item.supportCount || 1), 0);
    summary.compressionLevel = level;
    summary.weekBucket = bucket;
    summary.status = "active";
    summary.sourceMessageIds = [...new Set(memories.flatMap(item => item.sourceMessageIds || []))].slice(-20);
    if (level > 1) summary.memoryType = level === 2 ? "weekly_summary" : "monthly_summary";
    return summary;
}

function compressGroups(memories, select, level, bucketFor) {
    const groups = new Map();
    const keep = [];
    for (const memory of memories) {
        if (!select(memory)) {
            keep.push(memory);
            continue;
        }
        const bucket = bucketFor(memory);
        const key = `${bucket}:${level === 1 ? memory.memoryType : "summary"}`;
        groups.set(key, [...(groups.get(key) || []), memory]);
    }
    for (const [key, group] of groups) {
        const bucket = key.split(":")[0];
        keep.push(group.length === 1 && group[0].compressionLevel >= level
            ? group[0]
            : summarize(group, level, bucket));
    }
    return keep;
}

function maintain() {
    const store = loadStore();
    const cfg = config();
    const now = Date.now();
    const users = Object.values(store.users);
    for (const user of users) {
        user.fresh = (user.fresh || []).filter(item =>
            now - timestamp(item.createdAt) < cfg.freshHours * 60 * 60 * 1000
        );
        let memories = (user.memories || []).filter(memory => memory.status === "active");
        memories = compressGroups(
            memories,
            memory => memory.compressionLevel < 1 &&
                now - timestamp(memory.lastRelevantAt || memory.createdAt) >= cfg.weeklyAfterDays * DAY,
            1,
            memory => memory.weekBucket || weekBucket(memory.createdAt)
        );
        memories = compressGroups(
            memories,
            memory => memory.compressionLevel < 2 &&
                now - timestamp(memory.lastRelevantAt || memory.createdAt) >= cfg.weeklyAfterDays * 2 * DAY,
            2,
            memory => memory.weekBucket || weekBucket(memory.createdAt)
        );
        memories = memories.filter(memory => {
            const age = now - timestamp(memory.lastRelevantAt || memory.createdAt);
            if (age < cfg.monthlyAfterDays * DAY || memory.importance >= 0.85) return true;
            return retentionScore(memory, now) >= cfg.deleteBelow;
        });
        memories = compressGroups(
            memories,
            memory => memory.compressionLevel < 3 &&
                now - timestamp(memory.lastRelevantAt || memory.createdAt) >= cfg.monthlyAfterDays * DAY,
            3,
            memory => (memory.createdAt || "").slice(0, 7) || "unknown"
        );
        user.memories = memories;
    }
    store.lastMaintenanceAt = iso(now);
    saveStore(store);
    return store;
}

let backfilled = false;
function memoryContext(userId, query) {
    if (!backfilled) {
        backfillMemories();
        backfilled = true;
    }
    const savedUniversal = getSettings().universalMemoryFacts;
    const universal = [
        "Current server ownership and administrator roles must always be verified from live Discord data.",
        ...(Array.isArray(savedUniversal) ? savedUniversal.filter(item => typeof item === "string") : [])
    ];
    const memories = retrieve(userId, query)
        .sort((a, b) => b.score - a.score)
        .slice(0, config().retrievalLimit + 6)
        .map(item => item.text);
    return [...universal.map(fact => `[always remember] ${fact}`), ...memories].join("\n");
}

module.exports = {
    remember,
    retrieve,
    memoryContext,
    maintain,
    backfillMemories,
    extractCandidates,
    retentionScore
};
