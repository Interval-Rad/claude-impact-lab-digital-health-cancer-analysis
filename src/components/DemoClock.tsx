"use client";
import { useEffect, useState } from "react";

const two = (n: number) => String(n).padStart(2, "0");

export default function DemoClock() {
  // Empty on the server so the first client render matches; filled in after mount.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const text = now ? `${two(now.getHours())}:${two(now.getMinutes())}:${two(now.getSeconds())}` : "--:--:--";
  return (
    <span className="data text-[11px]">
      <span className="label mr-2">demo clock</span>
      <time suppressHydrationWarning>{text}</time>
    </span>
  );
}
