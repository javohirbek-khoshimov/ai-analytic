# core/ai_cost.py

def calc_gemini25_flash_cost(usage: dict) -> tuple[int, float]:
    """
    usage: {
      'promptTokenCount': int,
      'candidatesTokenCount': int,
      'totalTokenCount': int
    }
    return: (total_tokens, cost_usd)
    """
    in_tok  = int(usage.get("promptTokenCount", 0) or 0)
    out_tok = int(usage.get("candidatesTokenCount", 0) or 0)
    total_tok = int(usage.get("totalTokenCount", in_tok + out_tok) or 0)

    # Gemini 2.5 Flash — $0.0000003 per token
    rate = 0.0000003
    cost = total_tok * rate
    return total_tok, round(cost, 8)