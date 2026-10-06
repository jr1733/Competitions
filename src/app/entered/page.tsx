import type { Metadata } from "next";
import { EnteredScreen } from "@/components/screens/EnteredScreen";

export const metadata: Metadata = { title: "Entered" };

export default function EnteredPage() {
  return <EnteredScreen />;
}
