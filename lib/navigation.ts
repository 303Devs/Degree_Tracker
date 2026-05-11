export type NavIcon = "audit" | "planner" | "courses" | "gpa" | "upload" | "settings" | "more";

export interface NavItem {
  href: string;
  label: string;
  shortLabel?: string;
  icon: NavIcon;
  tier: "primary" | "secondary";
}

export const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Audit Dashboard", shortLabel: "Audit", icon: "audit", tier: "primary" },
  { href: "/planner", label: "Semester Planner", shortLabel: "Planner", icon: "planner", tier: "primary" },
  { href: "/courses", label: "Courses", icon: "courses", tier: "secondary" },
  { href: "/gpa", label: "GPA", icon: "gpa", tier: "secondary" },
  { href: "/upload", label: "Upload", icon: "upload", tier: "secondary" },
  { href: "/settings", label: "Settings", icon: "settings", tier: "secondary" },
];

export const DESKTOP_PRIMARY_NAV = PRIMARY_NAV.filter((item) => item.tier === "primary");
export const DESKTOP_SECONDARY_NAV = PRIMARY_NAV.filter((item) => item.tier === "secondary");
export const MOBILE_TAB_NAV = PRIMARY_NAV.filter((item) => ["/", "/planner", "/courses"].includes(item.href));
export const MOBILE_MORE_NAV = PRIMARY_NAV.filter((item) => ["/gpa", "/upload", "/settings"].includes(item.href));
