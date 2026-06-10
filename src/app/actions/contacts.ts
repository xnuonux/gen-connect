"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  getContactDetail,
  listContacts,
  updateContactStage,
} from "@/lib/supabase/contacts";
import { moveContactsStage, addContactTags } from "@/lib/supabase/copilot";
import {
  KANBAN_STAGES,
  type Contact,
  type ContactDetail,
  type ContactStage,
} from "@/lib/types/contact";

// all eight stages incl the do_not_contact dismiss sink ... bulk move targets any.
const ALL_STAGES = [...KANBAN_STAGES, "do_not_contact"] as const;

const moveSchema = z.object({
  contactId: z.string().uuid(),
  stage: z.enum(KANBAN_STAGES),
});

export type MoveInput = z.infer<typeof moveSchema>;

export type MoveContactResult = { ok: true } | { ok: false; error: string };

// the react-query queryFn for the pipeline board. reads run server-side so
// every contacts query stays in src/lib/supabase ... never inlined client-side.
export async function fetchContacts(): Promise<Contact[]> {
  return listContacts();
}

const detailSchema = z.object({ contactId: z.string().uuid() });

// the side drawer's lazy load. returns the full contact (incl the resolved
// presence graph) for one id, or null. RLS scopes it ... an id that isn't the
// caller's simply returns null.
export async function fetchContactDetail(
  contactId: string,
): Promise<ContactDetail | null> {
  const parsed = detailSchema.safeParse({ contactId });
  if (!parsed.success) return null;
  return getContactDetail(parsed.data.contactId);
}

// move a contact to a new pipeline stage. the kanban applies the move
// optimistically on drop ... this is what makes it stick.
export async function moveContactToStage(
  input: MoveInput,
): Promise<MoveContactResult> {
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "that move didn't look right ... give it another go.",
    };
  }

  try {
    await updateContactStage(parsed.data.contactId, parsed.data.stage);
    revalidatePath("/pipeline");
    return { ok: true };
  } catch {
    return { ok: false, error: "that didn't land ... the move didn't save." };
  }
}

export type BulkResult = { ok: true; count: number } | { ok: false; error: string };

async function signedIn(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return !!data.user;
}

const bulkMoveSchema = z.object({
  contactIds: z.array(z.string().uuid()).min(1).max(500),
  stage: z.enum(ALL_STAGES),
});

// move a multi-selected set to a stage (incl 'do_not_contact' to dismiss). RLS
// scopes the write to the caller's own rows.
export async function bulkMoveStageAction(input: unknown): Promise<BulkResult> {
  if (!(await signedIn())) return { ok: false, error: "sign in first ..." };
  const parsed = bulkMoveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "that bulk move didn't look right ..." };
  }
  try {
    const { moved } = await moveContactsStage(
      parsed.data.contactIds,
      parsed.data.stage as ContactStage,
    );
    revalidatePath("/pipeline");
    return { ok: true, count: moved };
  } catch {
    return { ok: false, error: "that didn't land ... the move didn't save." };
  }
}

const bulkTagSchema = z.object({
  contactIds: z.array(z.string().uuid()).min(1).max(500),
  tags: z.array(z.string()).min(1).max(10),
});

// tag a multi-selected set (merges, deduped, lowercased ... per addContactTags).
export async function bulkTagAction(input: unknown): Promise<BulkResult> {
  if (!(await signedIn())) return { ok: false, error: "sign in first ..." };
  const parsed = bulkTagSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "those tags didn't look right ..." };
  }
  try {
    const { tagged } = await addContactTags(
      parsed.data.contactIds,
      parsed.data.tags,
    );
    revalidatePath("/pipeline");
    return { ok: true, count: tagged };
  } catch {
    return { ok: false, error: "couldn't tag those ... give it another shot." };
  }
}
