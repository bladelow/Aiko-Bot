(() => {
    const groups = {
        "Progression": ["xpEnabled", "xpPerMessage", "xpCooldownMs", "levelUpCoins", "levelUpChannelId", "levelUpMessage", "levelUp"],
        "Moderation and links": ["moderationEnabled", "spamEnabled", "spamLimit", "spamWindowMs", "spamTimeoutMs", "linkFilterEnabled", "allowServerOwner", "allowAdministrators", "ignoredLinkRoles", "allowedLinks", "allowedDomains", "blockedDomains", "linkRules"],
        "AI": ["aiEnabled", "aiProvider", "openRouterModel", "aiPrompt"],
        "AI memory": ["memoryFreshLimit", "memoryFreshHours", "memoryRetrievalLimit", "memoryWeeklyDays", "memoryMonthlyDays", "memoryDeleteThreshold", "universalMemoryFacts"],
        "Automatic conversation": ["autoConversationEnabled", "autoConversationChannels", "inactiveMinutes", "autoConversationCooldownMinutes", "maxAutoMessagesPerDay", "excludedChannels"],
        "Daily quiz": ["quizChannelId", "quizTimezone", "quizDurationHours", "quizWinnerCoins", "quizParticipantCoins"]
    };
    const labels = {
        xpEnabled: "Enable XP and levels",
        xpPerMessage: "XP per message",
        xpCooldownMs: "XP cooldown (ms)",
        levelUpCoins: "Coins per level",
        levelUpChannelId: "Level-up channel ID",
        levelUpMessage: "Level-up message template",
        moderationEnabled: "Enable moderation",
        spamEnabled: "Detect repeated messages",
        spamLimit: "Repeated messages before timeout",
        spamWindowMs: "Spam detection window (ms)",
        spamTimeoutMs: "Timeout duration (ms)",
        linkFilterEnabled: "Block non-allowed links",
        allowServerOwner: "Allow server owner to bypass link filter",
        allowAdministrators: "Allow administrators to bypass link filter",
        ignoredLinkRoles: "Ignored link-filter role IDs (JSON list)",
        allowedLinks: "Allowed link domains (JSON list)",
        allowedDomains: "Allowed domains (JSON list)",
        blockedDomains: "Blocked domains (JSON list)",
        linkRules: "Per-channel link rules (JSON object)",
        aiEnabled: "Enable AI chat",
        aiProvider: "AI provider (auto, gemini, openrouter)",
        openRouterModel: "OpenRouter model",
        aiPrompt: "Extra AI instructions",
        memoryFreshLimit: "Recent messages to retain",
        memoryFreshHours: "Recent chat retention (hours)",
        memoryRetrievalLimit: "Memories per prompt",
        memoryWeeklyDays: "Compress memories after (days)",
        memoryMonthlyDays: "Archive/delete memories after (days)",
        memoryDeleteThreshold: "Memory deletion threshold (0–1)",
        universalMemoryFacts: "Universal facts (JSON list)",
        autoConversationEnabled: "Allow AI to start conversations",
        autoConversationChannels: "Allowed channel IDs (JSON list)",
        inactiveMinutes: "Start after inactivity (minutes)",
        autoConversationCooldownMinutes: "Channel cooldown (minutes)",
        maxAutoMessagesPerDay: "Daily message limit",
        excludedChannels: "Excluded channel IDs (JSON list)",
        quizChannelId: "Daily quiz channel ID",
        quizTimezone: "Quiz timezone",
        quizDurationHours: "Quiz duration (hours)",
        quizWinnerCoins: "Winner Blade Coins",
        quizParticipantCoins: "Participant Blade Coins",
        levelUp: "Level-up settings (JSON object)"
    };

    const botUrlInput = document.querySelector("#botUrl");
    const tokenInput = document.querySelector("#panelToken");
    const connectButton = document.querySelector("#connectButton");
    const sendButton = document.querySelector("#sendButton");
    const settingsPanel = document.querySelector("#settingsPanel");
    const settingsContainer = document.querySelector("#settings");
    const payloadInput = document.querySelector("#payload");
    const status = document.querySelector("#status");
    let savedSettings = {};
    let settingInputs = new Map();

    function setStatus(message, isError = false) {
        status.textContent = message;
        status.className = isError ? "error" : "success";
    }

    function apiUrl() {
        const value = botUrlInput.value.trim().replace(/\/+$/, "");
        if (!/^https?:\/\//i.test(value)) throw new Error("Enter the public bot URL, including https://.");
        return `${value}/api/settings`;
    }

    function authHeaders() {
        const token = tokenInput.value.trim();
        if (!token) throw new Error("Enter the bot's PANEL_TOKEN.");
        return { Authorization: `Bearer ${token}` };
    }

    function currentSettings() {
        const settings = { ...savedSettings };
        for (const [key, input] of settingInputs) {
            if (input.type === "checkbox") {
                settings[key] = input.checked;
            } else if (input.dataset.json === "true") {
                try {
                    settings[key] = JSON.parse(input.value);
                } catch {
                    throw new Error(`${labels[key] || key}: enter valid JSON.`);
                }
            } else if (input.type === "number") {
                const value = Number(input.value);
                if (!Number.isFinite(value)) throw new Error(`${labels[key] || key}: enter a valid number.`);
                settings[key] = value;
            } else {
                settings[key] = input.value;
            }
        }
        return settings;
    }

    function updatePayload() {
        try {
            const bytes = new TextEncoder().encode(JSON.stringify(currentSettings()));
            let binary = "";
            bytes.forEach(byte => { binary += String.fromCharCode(byte); });
            payloadInput.value = btoa(binary);
            sendButton.disabled = false;
        } catch (error) {
            payloadInput.value = "";
            sendButton.disabled = true;
            setStatus(error.message, true);
        }
    }

    function createControl(key, value) {
        let input;
        if (typeof value === "boolean") {
            input = document.createElement("input");
            input.type = "checkbox";
            input.checked = value;
        } else if (typeof value === "number") {
            input = document.createElement("input");
            input.type = "number";
            input.step = Number.isInteger(value) ? "1" : "0.01";
            input.value = String(value);
        } else if (value !== null && typeof value === "object") {
            input = document.createElement("textarea");
            input.value = JSON.stringify(value, null, 2);
            input.dataset.json = "true";
        } else {
            input = document.createElement("textarea");
            input.value = String(value ?? "");
            if (["aiPrompt", "levelUpMessage"].includes(key)) input.rows = 4;
        }
        input.id = `setting-${key}`;
        input.addEventListener("input", updatePayload);
        input.addEventListener("change", updatePayload);
        settingInputs.set(key, input);
        return input;
    }

    function renderSettings(settings) {
        savedSettings = settings;
        settingInputs = new Map();
        settingsContainer.replaceChildren();
        for (const [group, keys] of Object.entries(groups)) {
            const section = document.createElement("section");
            section.className = "panel";
            const heading = document.createElement("h2");
            heading.textContent = group;
            section.append(heading);
            for (const key of keys) {
                if (!Object.prototype.hasOwnProperty.call(settings, key)) continue;
                const row = document.createElement("div");
                row.className = "setting";
                const label = document.createElement("label");
                label.htmlFor = `setting-${key}`;
                label.textContent = labels[key] || key;
                const input = createControl(key, settings[key]);
                if (input.type === "checkbox") {
                    label.className = "check";
                    row.append(input, label);
                } else {
                    row.append(label, input);
                }
                section.append(row);
            }
            settingsContainer.append(section);
        }
        settingsPanel.hidden = false;
        updatePayload();
    }

    async function loadSettings() {
        connectButton.disabled = true;
        setStatus("Connecting to bot...");
        try {
            const response = await fetch(apiUrl(), { headers: authHeaders(), cache: "no-store" });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `Bot returned HTTP ${response.status}.`);
            renderSettings(result);
            setStatus("Connected. Edit settings and send them to the bot.");
        } catch (error) {
            setStatus(error.message || "Could not connect to the bot.", true);
        } finally {
            connectButton.disabled = false;
        }
    }

    async function sendSettings() {
        sendButton.disabled = true;
        setStatus("Sending encoded settings to the bot...");
        try {
            updatePayload();
            if (!payloadInput.value) return;
            const response = await fetch(apiUrl(), {
                method: "POST",
                headers: { ...authHeaders(), "Content-Type": "application/json" },
                body: JSON.stringify({ payload: payloadInput.value })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `Bot returned HTTP ${response.status}.`);
            renderSettings(result.settings);
            setStatus("Settings saved and sent to the bot successfully.");
        } catch (error) {
            setStatus(error.message || "Could not send settings.", true);
        } finally {
            sendButton.disabled = false;
        }
    }

    connectButton.addEventListener("click", loadSettings);
    sendButton.addEventListener("click", sendSettings);
    document.querySelector("#reloadButton").addEventListener("click", loadSettings);
    document.querySelector("#copyButton").addEventListener("click", async () => {
        if (!payloadInput.value) return;
        try {
            await navigator.clipboard.writeText(payloadInput.value);
            setStatus("Encoded payload copied.");
        } catch {
            payloadInput.select();
            setStatus("Select and copy the payload manually.", true);
        }
    });
})();
