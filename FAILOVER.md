# Aiko AI Failover

- Gemini is primary in `auto` mode.
- Gemini 429/quota errors put Gemini into cooldown.
- The same normalized messages are sent to OpenRouter.
- OpenRouter errors now expose the response body safely (never the API key).
- OpenRouter can try `OPENROUTER_FALLBACK_MODELS` when the selected model fails.
- Gemini is automatically tested again after its cooldown.
- When Gemini succeeds, it becomes primary again.
- `data/settings.json` no longer pins a stale OpenRouter model; `.env` controls `OPENROUTER_MODEL`.

Recommended `.env`:
`OPENROUTER_MODEL=openrouter/free`

If a specific model is preferred, set that model instead.
