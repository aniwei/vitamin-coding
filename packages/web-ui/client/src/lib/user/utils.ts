export const getUserAvatar = (user: { image?: string | null }): string => {
  return user.image || '/pf.png'
}

export const getIsUserAdmin = (user?: { role?: string | null }): boolean => {
  return user?.role?.split(',').includes('admin') || false
}
