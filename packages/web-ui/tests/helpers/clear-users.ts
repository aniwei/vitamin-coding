import { pgDb } from '../../src/lib/db/pg/db.pg'
import {
  UserTable,
  SessionTable,
  AccountTable,
  VerificationTable,
  ChatThreadTable,
  ChatMessageTable,
  WorkflowTable,
  McpServerTable,
  ArchiveTable,
  ArchiveItemTable,
} from '../../src/lib/db/pg/schema.pg'

/**
 * Clear all users from the database for first-user testing
 * WARNING: Only use in test environment!
 */
export async function clearAllUsers() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Cannot clear users in production!')
  }

  console.log('🧹 Clearing all users for first-user testing...')

  // Clear in order of dependencies (most dependent first)
  // 1. Clear archive items first (depends on archives)
  await pgDb.delete(ArchiveItemTable)

  // 2. Clear archives (depends on users)
  await pgDb.delete(ArchiveTable)

  // 3. Clear chat messages (depends on threads)
  await pgDb.delete(ChatMessageTable)

  // 4. Clear chat threads (depends on users)
  await pgDb.delete(ChatThreadTable)

  // 5. Clear workflows (depends on users)
  await pgDb.delete(WorkflowTable)

  // 6. Clear MCP servers (depends on users)
  await pgDb.delete(McpServerTable)

  // 7. Clear sessions (depends on users)
  await pgDb.delete(SessionTable)

  // 8. Clear accounts (depends on users)
  await pgDb.delete(AccountTable)

  // 9. Clear verifications (depends on users)
  await pgDb.delete(VerificationTable)

  // 10. Finally clear users
  await pgDb.delete(UserTable)

  console.log('✅ All users and related data cleared')
}

/**
 * Check if any users exist in the database
 */
export async function getUserCount(): Promise<number> {
  const users = await pgDb.select().from(UserTable)
  return users.length
}
