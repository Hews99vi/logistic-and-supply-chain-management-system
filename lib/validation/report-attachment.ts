import { z } from "zod";

export const reportAttachmentDeleteSchema = z.object({
  filePath: z.string().trim().min(1).max(1024)
});

export type ReportAttachmentDeleteInput = z.infer<typeof reportAttachmentDeleteSchema>;
