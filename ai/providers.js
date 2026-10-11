const { GoogleGenAI } = require("@google/genai");
const axios = require("axios");
const { getSettings } = require("../database");

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

// Gemini is temporarily skipped after a quota/rate-limit error.
// It will be tested again automatically after the cooldown.
let geminiUnavailableUntil = 0;
let geminiRecoveryTimer = null;

const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const DEFAULT_OPENROUTER_MODEL =
    process.env.OPENROUTER_MODEL || "openrouter/free";

// Optional comma-separated list. Example:
// OPENROUTER_FALLBACK_MODELS=model-a:free,model-b:free
const configuredFallbackModels = () =>
    String(process.env.OPENROUTER_FALLBACK_MODELS || "")
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);

function isGeminiLimitError(error) {
    const status = error?.status || error?.response?.status;
    const text = JSON.stringify(
        error?.response?.data || error?.message || error || ""
    ).toLowerCase();

    return (
        status === 429 ||
        text.includes("quota") ||
        text.includes("rate limit") ||
        text.includes("resource_exhausted")
    );
}

function getOpenRouterModel() {
    const settingsModel = getSettings().openRouterModel;

    return (
        (typeof settingsModel === "string" && settingsModel.trim()) ||
        DEFAULT_OPENROUTER_MODEL
    );
}

function getSafeAxiosError(error) {
    return {
        status: error?.response?.status,
        statusText: error?.response?.statusText,
        message: error?.message,
        response: error?.response?.data
    };
}

function extractOpenRouterText(data) {
    const content = data?.choices?.[0]?.message?.content;

    if (typeof content === "string" && content.trim()) {
        return content.trim();
    }

    // Some OpenRouter/OpenAI-compatible responses may expose text in a
    // slightly different shape. Do not silently return undefined.
    if (Array.isArray(content)) {
        const text = content
            .map(part => {
                if (typeof part === "string") return part;
                if (typeof part?.text === "string") return part.text;
                return "";
            })
            .join("")
            .trim();

        if (text) return text;
    }

    return null;
}

function classifyOpenRouterError(error) {
    const status = error?.response?.status;

    if (status === 400) return "invalid_request";
    if (status === 401) return "authentication";
    if (status === 403) return "forbidden";
    if (status === 404) return "not_found";
    if (status === 408) return "timeout";
    if (status === 429) return "rate_limit";
    if (status >= 500) return "provider_error";
    return "unknown";
}

async function requestOpenRouter(messages, model) {
    const apiKey = String(process.env.OPENROUTER_API_KEY || "").trim();

    if (!apiKey) {
        throw new Error("OPENROUTER_API_KEY is missing");
    }

    try {
        const response = await axios.post(
            "https://openrouter.ai/api/v1/chat/completions",
            {
                model,
                messages
            },
            {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer":
                        process.env.OPENROUTER_SITE || "http://localhost",
                    "X-Title": process.env.OPENROUTER_TITLE || "Aiko Discord Bot"
                },
                timeout: Number(process.env.OPENROUTER_TIMEOUT_MS || 30000),
                validateStatus: () => true
            }
        );

        if (response.status < 200 || response.status >= 300) {
            const error = new Error(
                `OpenRouter HTTP ${response.status}`
            );
            error.response = response;
            throw error;
        }

        const text = extractOpenRouterText(response.data);

        if (!text) {
            const error = new Error("OpenRouter response contained no choices/content");
            error.response = response;
            throw error;
        }

        return text;
    } catch (error) {
        const info = getSafeAxiosError(error);
        const category = classifyOpenRouterError(error);

        console.error("[AI] OpenRouter request failed:", {
            category,
            status: info.status,
            message: info.message,
            response: info.response,
            model
        });

        throw error;
    }
}
async function generateWithOpenRouter(messages) {
    if (!process.env.OPENROUTER_API_KEY) {
        throw new Error("OPENROUTER_API_KEY is missing");
    }

    const models = [
        getOpenRouterModel(),
        ...configuredFallbackModels()
    ].filter((model, index, arr) => model && arr.indexOf(model) === index);

    let lastError = null;

    for (const model of models) {
        try {
            console.log(`[AI] OpenRouter trying model: ${model}`);
            const text = await requestOpenRouter(messages, model);

            console.log(`[AI] OpenRouter success: ${model}`);
            return text;
        } catch (error) {
            lastError = error;
            const category = classifyOpenRouterError(error);

            // A bad request/not-found is usually model/config specific.
            // Try the next configured model instead of killing the fallback.
            if (
                category === "invalid_request" ||
                category === "not_found" ||
                category === "provider_error" ||
                category === "rate_limit"
            ) {
                continue;
            }

            // Authentication/forbidden errors affect the whole provider;
            // retrying other models will not fix the key.
            throw error;
        }
    }

    throw lastError || new Error("No OpenRouter model succeeded");
}

function markGeminiUnavailable(error) {
    const retryMs = Math.max(
        1000,
        Number(process.env.GEMINI_RETRY_MS || 3600000)
    );

    geminiUnavailableUntil = Date.now() + retryMs;

    console.warn(
        `[AI] Gemini unavailable until ${new Date(
            geminiUnavailableUntil
        ).toISOString()}`
    );

    startGeminiRecoveryTimer();
}

function startGeminiRecoveryTimer() {
    if (geminiRecoveryTimer) return;

    const intervalMs = Math.max(
        30000,
        Number(process.env.GEMINI_RECOVERY_CHECK_MS || 300000)
    );

    geminiRecoveryTimer = setInterval(async () => {
        if (Date.now() < geminiUnavailableUntil) return;

        clearInterval(geminiRecoveryTimer);
        geminiRecoveryTimer = null;

        console.log("[AI] Testing Gemini recovery...");

        try {
            const response = await ai.models.generateContent({
                model: DEFAULT_GEMINI_MODEL,
                contents: [
                    {
                        role: "user",
                        parts: [{ text: "Reply with OK." }]
                    }
                ]
            });

            const text = response?.text?.trim();

            if (text) {
                geminiUnavailableUntil = 0;
                console.log("[AI] Gemini recovered. Primary provider restored.");
            } else {
                geminiUnavailableUntil = Date.now() + intervalMs;
                startGeminiRecoveryTimer();
            }
        } catch (error) {
            if (isGeminiLimitError(error)) {
                geminiUnavailableUntil = Date.now() + intervalMs;
                console.warn(
                    `[AI] Gemini still unavailable. Next check in ${Math.round(
                        intervalMs / 1000
                    )}s.`
                );
                startGeminiRecoveryTimer();
            } else {
                // Do not permanently disable Gemini for unrelated errors.
                geminiUnavailableUntil = Date.now() + intervalMs;
                console.warn(
                    "[AI] Gemini recovery check failed:",
                    error?.message || error
                );
                startGeminiRecoveryTimer();
            }
        }
    }, intervalMs);

    if (typeof geminiRecoveryTimer.unref === "function") {
        geminiRecoveryTimer.unref();
    }
}

async function generateWithGemini(messages) {
    const contents = messages.map(msg => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: String(msg.content ?? "") }]
    }));

    const response = await ai.models.generateContent({
        model: DEFAULT_GEMINI_MODEL,
        contents
    });

    const text = response?.text;

    if (!text || !text.trim()) {
        throw new Error("Gemini response contained no text");
    }

    return text.trim();
}

async function generateResponse(messages) {
    const provider = getSettings().aiProvider || "auto";

    if (provider === "gemini" || provider === "auto") {
        if (Date.now() >= geminiUnavailableUntil) {
            try {
                console.log("[AI] Provider: gemini");
                return await generateWithGemini(messages);
            } catch (error) {
                console.error(
                    "[AI] Gemini failed:",
                    error?.message || error
                );

                if (isGeminiLimitError(error)) {
                    markGeminiUnavailable(error);
                    console.warn(
                        "[AI] Switching provider: gemini → openrouter"
                    );
                } else if (provider === "gemini") {
                    throw error;
                }
            }
        } else if (provider === "auto") {
            console.log(
                `[AI] Gemini cooldown active until ${new Date(
                    geminiUnavailableUntil
                ).toISOString()}`
            );
        }
    }

    if (provider === "openrouter" || provider === "auto") {
        try {
            console.log("[AI] Provider: openrouter");
            return await generateWithOpenRouter(messages);
        } catch (error) {
            console.error(
                "[AI] OpenRouter failed:",
                error?.message || error
            );
        }
    }

    return "😴 Aaj meri AI energy khatam ho gayi.";
}

module.exports = {
    generateResponse
};









