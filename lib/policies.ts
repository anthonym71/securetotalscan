import type { ComplianceGap, RagContextItem } from "./api";

export interface PolicyGroup {
  framework: string;
  gaps: ComplianceGap[];
}

/** Group compliance gaps by framework for dashboard display. */
export function groupPoliciesByFramework(
  gaps: ComplianceGap[] | undefined,
): PolicyGroup[] {
  if (!gaps?.length) return [];

  const order = ["NIST CSF 2.0", "SOC 2 Type II"];
  const grouped = new Map<string, ComplianceGap[]>();

  for (const gap of gaps) {
    const fw = gap.framework || "Other";
    const list = grouped.get(fw) ?? [];
    list.push(gap);
    grouped.set(fw, list);
  }

  const frameworks = [...grouped.keys()].sort((a, b) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  return frameworks.map((framework) => ({
    framework,
    gaps: grouped.get(framework) ?? [],
  }));
}

/** Match retrieved RAG chunks to a control id. */
export function contextForControl(
  controlId: string,
  context: RagContextItem[] | undefined,
): RagContextItem[] {
  if (!context?.length) return [];
  return context.filter((c) => c.linked_to === controlId);
}

export function frameworkBadgeClass(framework: string): string {
  if (framework.includes("NIST")) return "bg-blue-500/20 text-blue-200";
  if (framework.includes("SOC")) return "bg-purple-500/20 text-purple-200";
  return "bg-white/10 text-white/70";
}
