import { registry } from "@/lib/charge";
import { handle } from "@/lib/http";
export const dynamic = "force-dynamic";
export const GET = () => handle(() => registry());
