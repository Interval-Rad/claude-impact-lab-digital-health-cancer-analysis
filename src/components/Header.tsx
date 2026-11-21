import Link from "next/link";
import DemoClock from "./DemoClock";
import RoleNav from "./RoleNav";

// One line, every screen: product name, role switch, demo clock. Dark theme only, no toggle.
export default function Header() {
  return (
    <header
      className="flex shrink-0 items-center gap-5 border-b border-rule bg-surface px-[10px]"
      style={{ height: "var(--header-h)" }}
    >
      <Link href="/" className="data text-[12px] font-medium tracking-[0.18em]">
        SCANSHIFT
      </Link>
      <RoleNav />
      <span className="data ml-auto text-[11px] text-muted">
        demo only, not for clinical use
      </span>
      <DemoClock />
    </header>
  );
}
