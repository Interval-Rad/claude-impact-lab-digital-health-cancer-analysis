import Link from "next/link";
import DemoClock from "./DemoClock";

// One line, every screen: product name, role switch, demo clock. Dark theme only, no toggle.
export default function Header() {
  return (
    <header
      className="flex shrink-0 items-center gap-5 border-b border-rule bg-surface px-[10px]"
      style={{ height: "var(--header-h)" }}
    >
      <Link href="/" className="data text-[12px] font-medium tracking-[0.18em]">
        INTERVAL READ
      </Link>
      <nav aria-label="Role" className="data flex items-center gap-2 text-[11px]">
        <Link href="/" aria-current="true" className="underline underline-offset-4">
          Radiology
        </Link>
        <span aria-hidden="true" className="text-muted">|</span>
        {/* /inbox is not built. Shown as a disabled item, not a link. */}
        <span aria-disabled="true" className="text-muted" title="/inbox is not built yet">
          Ordering provider <span className="tag">not built yet</span>
        </span>
      </nav>
      <span className="data ml-auto text-[11px] text-muted">
        demo only, not for clinical use
      </span>
      <DemoClock />
    </header>
  );
}
