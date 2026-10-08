import type { PublicScanReport } from "./scanner/types";
import { renderReportPdf } from "./report/reportDoc";

export interface EmailDeliveryResult {
  delivered: boolean;
  id?: string;
  reason?: "not_configured" | "provider_error";
}

function sender(): string | null {
  const value = (process.env.REPORT_FROM_EMAIL ?? "").trim();
  return value && value.includes("@") ? value : null;
}

export function reportEmailConfigured(): boolean {
  return Boolean((process.env.RESEND_API_KEY ?? "").trim() && sender());
}

export async function sendReportEmail(
  to: string,
  report: PublicScanReport,
  scanId: string,
): Promise<EmailDeliveryResult> {
  const apiKey = (process.env.RESEND_API_KEY ?? "").trim();
  const from = sender();
  if (!apiKey || !from) return { delivered: false, reason: "not_configured" };

  const pdf = renderReportPdf(report);
  const attachment = Buffer.from(pdf).toString("base64");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Secure Total Scan report — ${report.grade ?? "security scan"}`,
      html:
        "<p>Your Secure Total Scan report is attached.</p>" +
        "<p>Keep this email private: the report may contain security findings about your site.</p>",
      attachments: [
        {
          filename: `secure-total-scan-${scanId}.pdf`,
          content: attachment,
        },
      ],
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    console.error("report email provider error:", response.status);
    return { delivered: false, reason: "provider_error" };
  }

  const body = (await response.json().catch(() => ({}))) as { id?: unknown };
  return {
    delivered: true,
    ...(typeof body.id === "string" ? { id: body.id } : {}),
  };
}
