import {
  authSessionSchema,
  currentSessionSchema,
  type AuthSession,
  type CurrentSession,
  type LoginRequest,
  type SignupRequest,
} from '@/contracts/auth'
import { http, parseResponse } from '@/shared/api/http'

export async function signup(body: SignupRequest): Promise<AuthSession> {
  const response = await http.post('/auth/signup', body)
  return parseResponse(authSessionSchema, response.data)
}

export async function login(body: LoginRequest): Promise<AuthSession> {
  const response = await http.post('/auth/login', body)
  return parseResponse(authSessionSchema, response.data)
}

export async function fetchCurrentSession(signal?: AbortSignal): Promise<CurrentSession> {
  const response = await http.get('/auth/session', { signal })
  return parseResponse(currentSessionSchema, response.data)
}

export async function logout(): Promise<void> {
  await http.post('/auth/logout')
}
