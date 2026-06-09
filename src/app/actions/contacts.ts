"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  getContactDetail,
  listContacts,
  updateContactStage,
} from "@/lib/supabase/contacts";
import {
  KANBAN_STAGES,
  type Contact,
  type ContactDetail,
} from "@/lib/types/contact";

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
