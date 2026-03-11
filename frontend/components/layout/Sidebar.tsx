"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth-store";

const teacherLinks = [
  { href: "/dashboard/teacher", label: "Dashboard", icon: "🏠" },
  { href: "/dashboard/teacher/courses", label: "My Courses", icon: "📚" },
  { href: "/dashboard/teacher/quizzes", label: "Quizzes", icon: "📝" },
  { href: "/dashboard/teacher/analytics", label: "Analytics", icon: "📊" },
  { href: "/dashboard/teacher/announcements", label: "Announcements", icon: "📢" },
  { href: "/dashboard/admin/db", label: "DB Browser", icon: "🗄️" },
];

const studentLinks = [
  { href: "/dashboard/student", label: "Dashboard", icon: "🏠" },
  { href: "/dashboard/student/courses", label: "My Courses", icon: "📚" },
  { href: "/dashboard/student/quizzes", label: "Quizzes", icon: "📝" },
  { href: "/dashboard/student/progress", label: "My Progress", icon: "📊" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const links = user?.role === "teacher" ? teacherLinks : studentLinks;

  return (
    <aside className="flex h-full w-64 flex-col bg-base-200">
      {/* Logo */}
      <div className="flex items-center gap-2 px-6 py-5 border-b border-base-300">
        <span className="text-2xl">🎓</span>
        <span className="text-lg font-bold">AI LMS</span>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 py-4">
        <ul className="menu gap-1">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={pathname === link.href ? "active" : ""}
              >
                <span>{link.icon}</span>
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* User info + logout */}
      <div className="border-t border-base-300 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="avatar placeholder">
            <div className="w-10 rounded-full bg-primary text-primary-content">
              <span className="text-sm">
                {user?.full_name?.charAt(0)?.toUpperCase() ?? "?"}
              </span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium">{user?.full_name}</p>
            <p className="truncate text-xs text-base-content/60">
              {user?.role}
            </p>
          </div>
        </div>
        <button
          onClick={logout}
          className="btn btn-ghost btn-sm w-full mt-3 justify-start"
        >
          🚪 Sign out
        </button>
      </div>
    </aside>
  );
}
