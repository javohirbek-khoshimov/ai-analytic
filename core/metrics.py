# core/metrics.py
from prometheus_client import Counter, Summary, Gauge

# HTTP umumiy metriks
REQUEST_COUNT   = Counter('sinoai_requests_total', 'HTTP requests', ['method', 'path'])
REQUEST_LATENCY = Summary('sinoai_request_latency_seconds', 'Request latency (s)', ['path'])

# AI chaqiruvlari (xohlasang foydalanasan)
AI_RESPONSE_LATENCY = Summary('sinoai_ai_response_latency_seconds', 'AI response latency (s)', ['route'])
AI_ERROR_COUNT      = Counter('sinoai_ai_errors_total', 'AI errors')
AI_TOKENS_GAUGE     = Gauge('sinoai_ai_response_tokens', 'Avg tokens per AI response')

# System
CPU_USAGE = Gauge('sinoai_cpu_usage_percent', 'CPU %')
RAM_USAGE = Gauge('sinoai_ram_usage_mb', 'RAM MB')

# Biznes (faqat READ)
ACTIVE_USERS_24H = Gauge('sinoai_active_users_24h', 'Active users last 24h')
AI_MSGS_PER_MIN  = Gauge('sinoai_ai_msgs_per_min', 'AI messages per minute')