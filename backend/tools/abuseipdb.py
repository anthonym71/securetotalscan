"""AbuseIPDB client for IP reputation lookups."""

import os

import httpx

ABUSEIPDB_BASE = "https://api.abuseipdb.com/api/v2/check"


def check_ip_reputation(ip: str) -> dict:
    """Check IP reputation via AbuseIPDB.

    Args:
        ip: IPv4 address to look up.

    Returns:
        Dict with ``score`` (0–100), ``flagged`` bool, and optional ``country``
        or ``note`` when the API is unavailable.
    """
    api_key = os.getenv("ABUSEIPDB_API_KEY", "")
    if not api_key:
        return {"score": 0, "flagged": False, "note": "no api key"}
    try:
        resp = httpx.get(
            ABUSEIPDB_BASE,
            headers={"Key": api_key, "Accept": "application/json"},
            params={"ipAddress": ip, "maxAgeInDays": 90},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json().get("data", {})
        score = data.get("abuseConfidenceScore", 0)
        return {
            "score": score,
            "flagged": score > 50,
            "country": data.get("countryCode", ""),
        }
    except Exception:
        return {"score": 0, "flagged": False, "note": "api error"}
