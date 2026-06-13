# Attribution

Secure Total Scan is built from two sources, combined with permission for the
group hackathon project.

## Web (front end + surface scanner)
- Origin: `secure-total-scan` (Rev 1), original work.
- Includes the marketing site, the free passive surface scanner, and the A–F
  grading engine (`lib/scanner/`). All original.

## Backend (agent engine)
- Origin: [dheerajrvanteru/c7-hackathon](https://github.com/dheerajrvanteru/c7-hackathon), `backend/`.
- Author: Dheeraj Vanteru.
- Used with the author's permission for this integrated build.
- Provides the five LangGraph agents (log monitor, threat intel, vulnerability
  scanner, incident response, compliance), the LLM caching layer, and the evals
  / cost-tracking API.

If this product is taken commercial, confirm the upstream license terms and the
author's consent for commercial use before distribution.
