import type { Metadata } from "next";
import { Suspense } from "react";
import { AddScreen } from "@/components/screens/AddScreen";

export const metadata: Metadata = { title: "Add competition" };

export default function AddPage() {
  // The shared link arrives in the query string, which is only known at request time.
  return (
    <Suspense>
      <AddScreen />
    </Suspense>
  );
}
