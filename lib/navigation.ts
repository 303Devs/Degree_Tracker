export interface NavItem {
  href: string;
  label: string;
  icon: "upload" | "plan" | "library" | "gpa" | "settings";
}

export const PRIMARY_NAV: NavItem[] = [
  { href: "/upload", label: "Upload", icon: "upload" },
  { href: "/degree-plan", label: "Degree Plan", icon: "plan" },
  { href: "/course-library", label: "Course Library", icon: "library" },
  { href: "/gpa", label: "GPA", icon: "gpa" },
  { href: "/settings", label: "Settings", icon: "settings" },
];
