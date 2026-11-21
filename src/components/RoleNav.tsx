"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Role switch in the header. The current role is underlined and carries aria-current.
export default function RoleNav() {
  const path = usePathname() ?? "/";
  const provider = path === "/inbox" || path.startsWith("/inbox/");
  const item = (href: string, text: string, current: boolean) => (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={current ? "underline underline-offset-4" : "text-muted hover:text-text"}
    >
      {text}
    </Link>
  );
  return (
    <nav aria-label="Role" className="data flex items-center gap-2 text-[11px]">
      {item("/", "Radiology", !provider)}
      <span aria-hidden="true" className="text-muted">|</span>
      {item("/inbox", "Ordering provider", provider)}
    </nav>
  );
}
