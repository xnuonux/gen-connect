"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { listContacts, updateContactStage } from "@/lib/supabase/contacts";
import { KANBAN_STAGES, type Contact } from "@/lib/types/contact";

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
