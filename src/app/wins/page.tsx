import type { Metadata } from "next";
import { WinsScreen } from "@/components/screens/WinsScreen";

export const metadata: Metadata = { title: "Wins" };

export default function WinsPage() {
  return <WinsScreen />;
}
