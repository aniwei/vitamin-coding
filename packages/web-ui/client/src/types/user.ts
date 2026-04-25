import { z } from 'zod'

export type UserPreferences = {
  displayName?: string
  profession?: string
  responseStyleExample?: string
  botName?: string
}

export interface User {
  id: string
  name: string
  email: string
  image?: string | null
  role?: string | null
  banned?: boolean | null
  banReason?: string | null
  banExpires?: Date | null
  createdAt?: Date
  preferences: UserPreferences | null
  lastLogin?: Date | null
}

export type BasicUser = {
  id: string
  name: string
  email: string
  image?: string | null
  role?: string | null
  banned?: boolean | null
  banReason?: string | null
  banExpires?: Date | null
  createdAt?: Date
}

export interface BasicUserWithLastLogin extends BasicUser {
  lastLogin: Date | null
}

export type UserSession = {
  user: {
    id: string
    name: string
    email: string
    image?: string | null
    role?: string | null
  }
  session: {
    id: string
    expiresAt: Date
  }
}

export type UserSessionUser = UserSession['user']

export const UserPreferencesZodSchema = z.object({
  displayName: z.string().optional(),
  profession: z.string().optional(),
  responseStyleExample: z.string().optional(),
  botName: z.string().optional(),
})
