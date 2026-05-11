export interface NavItem {
  href: string;
  label: string;
  icon: "upload" | "plan" | "planner" | "library" | "gpa" | "settings";
}

export const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Audit Plan", icon: "plan" },
  { href: "/planner", label: "Semester Planner", icon: "planner" },
  { href: "/courses", label: "Courses", icon: "library" },
  { href: "/gpa", label: "GPA", icon: "gpa" },
  { href: "/upload", label: "Upload Audit", icon: "upload" },
  { href: "/settings", label: "Settings", icon: "settings" },
];
