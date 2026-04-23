import { and, eq } from 'drizzle-orm'
import { pgDb as db } from '../db.pg'
import { BookmarkTable } from '../schema.pg'

export interface BookmarkRepository {
  createBookmark(
    userId: string,
    itemId: string,
    itemType: 'workflow'
  ): Promise<void>

  removeBookmark(
    userId: string,
    itemId: string,
    itemType: 'workflow'
  ): Promise<void>

  toggleBookmark(
    userId: string,
    itemId: string,
    itemType: 'workflow',
    isCurrentlyBookmarked: boolean
  ): Promise<boolean>

  checkItemAccess(
    itemId: string,
    itemType: 'workflow',
    userId: string
  ): Promise<boolean>
}

export const pgBookmarkRepository: BookmarkRepository = {
  async createBookmark(userId, itemId, itemType) {
    await db
      .insert(BookmarkTable)
      .values({
        userId,
        itemId,
        itemType,
      })
      .onConflictDoNothing()
  },

  async removeBookmark(userId, itemId, itemType) {
    await db
      .delete(BookmarkTable)
      .where(
        and(
          eq(BookmarkTable.userId, userId),
          eq(BookmarkTable.itemId, itemId),
          eq(BookmarkTable.itemType, itemType)
        )
      )
  },

  async toggleBookmark(userId, itemId, itemType, isCurrentlyBookmarked) {
    if (isCurrentlyBookmarked) {
      await this.removeBookmark(userId, itemId, itemType)
      return false
    } else {
      await this.createBookmark(userId, itemId, itemType)
      return true
    }
  },

  async checkItemAccess(_itemId, _itemType, _userId) {
    // TODO: Add workflow access check when workflows support bookmarking
    return false
  },
}
