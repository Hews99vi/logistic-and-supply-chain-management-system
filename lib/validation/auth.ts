import { z } from "zod";

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  email: z.string().trim().email(),
  password: z.string().min(8).max(72)
});

export type SignUpInput = z.infer<typeof signUpSchema>;
