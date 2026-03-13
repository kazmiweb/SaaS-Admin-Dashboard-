export function serviceToPath(serviceName: string, role: "USER"|"RESELLER"|"ADMIN") {
  const name = (serviceName || "").toLowerCase();
  const base = role === "ADMIN" ? "/admin" : role === "RESELLER" ? "/reseller" : "/user";

  if (name.includes("cnic")) return `${base}/cnic-intelligence`;
  if (name.includes("phone") || name.includes("mobile")) return `${base}/mobile-intelligence`;
  if (name.includes("vehicle")) return `${base}/vehicle/punjab`;
  if (name.includes("family")) return `${base}/family-tree`;

  const slug = name.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${base}/service/${slug}`;
}
