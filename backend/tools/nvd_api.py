"""NVD CVE API client for threat intelligence lookups."""

import os

import httpx

NVD_BASE = "https://services.nvd.nist.gov/rest/json/cves/2.0"


def search_nvd_cve(keyword: str) -> list[dict]:
    """Search NVD for CVEs matching a keyword.

    Args:
        keyword: Search term derived from anomaly type (e.g. ``SSH brute force``).

    Returns:
        Up to five simplified CVE dicts with ``id``, ``description``, and
        ``cvss_score``. Returns an empty list on API failure.
    """
    params = {"keywordSearch": keyword, "resultsPerPage": 5}
    headers = {}
    api_key = os.getenv("NVD_API_KEY")
    if api_key:
        headers["apiKey"] = api_key
    try:
        resp = httpx.get(NVD_BASE, params=params, headers=headers, timeout=10)
        resp.raise_for_status()
        items = resp.json().get("vulnerabilities", [])
        results = []
        for item in items:
            cve = item.get("cve", {})
            desc = next(
                (d["value"] for d in cve.get("descriptions", []) if d["lang"] == "en"),
                "",
            )
            metrics = cve.get("metrics", {})
            cvss = 0.0
            if "cvssMetricV31" in metrics:
                cvss = metrics["cvssMetricV31"][0]["cvssData"]["baseScore"]
            elif "cvssMetricV2" in metrics:
                cvss = metrics["cvssMetricV2"][0]["cvssData"]["baseScore"]
            results.append({"id": cve["id"], "description": desc, "cvss_score": cvss})
        return results
    except Exception:
        return []
