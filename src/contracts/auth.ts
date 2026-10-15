import { z } from 'zod'
import { accountUserSchema, usernameSchema } from './account'
import { isoDateTimeSchema } from './common'

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Informe um e-mail válido.'))

export const passwordSchema = z
  .string()
  .min(8, 'A senha precisa ter pelo menos 8 caracteres.')
  .max(72, 'A senha pode ter no máximo 72 caracteres.')
  .regex(/[a-zA-Z]/, 'A senha precisa ter pelo menos uma letra.')
  .regex(/\d/, 'A senha precisa ter pelo menos um número.')

/** POST /api/auth/signup. The API validates with this same schema. */
export const signupRequestSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
})
export type SignupRequest = z.infer<typeof signupRequestSchema>

/** Signup form: the request plus the client-only confirmation field. */
export const signupFormSchema = signupRequestSchema
  .extend({ confirmPassword: z.string().min(1, 'Confirme a senha.') })
  .refine((form) => form.password === form.confirmPassword, {
    path: ['confirmPassword'],
    message: 'As senhas não coincidem.',
  })
export type SignupForm = z.input<typeof signupFormSchema>

/** POST /api/auth/login. Only presence is checked: the password policy is not revealed. */
export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Informe a senha.'),
})
export type LoginRequest = z.infer<typeof loginRequestSchema>

/**
 * Response of signup (201) and login (200). The token is opaque: the API stores only
 * its SHA-256 digest, so a leaked mock database does not leak usable sessions.
 */
export const authSessionSchema = z.object({
  token: z.string().min(32),
  expiresAt: isoDateTimeSchema,
  user: accountUserSchema,
})
export type AuthSession = z.infer<typeof authSessionSchema>

/** GET /api/auth/session. 401 UNAUTHENTICATED or SESSION_EXPIRED when not valid. */
export const currentSessionSchema = z.object({
  expiresAt: isoDateTimeSchema,
  user: accountUserSchema,
})
export type CurrentSession = z.infer<typeof currentSessionSchema>
