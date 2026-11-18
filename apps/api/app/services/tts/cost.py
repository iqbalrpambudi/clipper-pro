from app.schemas.tts import CostEstimateResponse


def estimate_tts_cost(text: str, provider: str = "gemini") -> CostEstimateResponse:
    char_count = len(text)
    word_count = len(text.split())
    # Speech rate average ~ 14.5 chars/sec in Indonesian
    est_duration_sec = round(char_count / 14.5, 1)

    prov = provider.lower()
    if prov == "elevenlabs":
        rate_per_char = 0.00025  # ~ $0.25 - $0.30 per 1,000 characters
    else:
        rate_per_char = 0.000004  # gemini ~ $4 per 1M characters

    est_cost = round(char_count * rate_per_char, 4)

    return CostEstimateResponse(
        char_count=char_count,
        word_count=word_count,
        estimated_duration_sec=est_duration_sec,
        estimated_cost_usd=est_cost,
        currency="USD",
        provider=provider,
    )
