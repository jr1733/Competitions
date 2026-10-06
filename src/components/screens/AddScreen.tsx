"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AddCompetitionForm, firstUrl } from "../AddCompetitionForm";
import { PageHeader } from "../PageHeader";

/** Target of the PWA share sheet (Android): Share → Comper pre-fills the link. */
export function AddScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const url = params.get("url") || firstUrl(params.get("text") ?? "") || "";
  const title = params.get("title") ?? "";

  return (
    <>
      <PageHeader
        title="Add competition"
        actions={
          <Link href="/settings" className="flex size-11 items-center justify-center rounded-full text-zinc-600 dark:text-zinc-300" aria-label="Back to settings">
            <ArrowLeft className="size-6" aria-hidden />
          </Link>
        }
      />
      <main className="px-4 pt-4">
        <div className="card p-4">
          <AddCompetitionForm key={`${url}|${title}`} initialUrl={url} initialTitle={title} onAdded={() => router.push("/")} />
        </div>
      </main>
    </>
  );
}
