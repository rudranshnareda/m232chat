// Shared server-side input validation helpers.

export interface ValidationError {
  field: string
  message: string
}

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/

export function validateUsername(username: unknown): ValidationError | null {
  if (typeof username !== 'string' || !username.trim()) {
    return { field: 'username', message: 'Username is required.' }
  }
  if (!USERNAME_REGEX.test(username.trim())) {
    return {
      field: 'username',
      message: 'Username must be 3–20 characters and contain only letters, numbers, or underscores.',
    }
  }
  return null
}

export function validatePassword(password: unknown): ValidationError | null {
  if (typeof password !== 'string' || !password) {
    return { field: 'password', message: 'Password is required.' }
  }
  if (password.length < 8) {
    return { field: 'password', message: 'Password must be at least 8 characters.' }
  }
  return null
}

export function validateBio(bio: unknown): ValidationError | null {
  if (bio === undefined || bio === null || bio === '') return null
  if (typeof bio !== 'string') return { field: 'bio', message: 'Invalid bio.' }
  if (bio.length > 150) return { field: 'bio', message: 'Bio must be 150 characters or less.' }
  return null
}

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
export const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024  // 5 MB

export function validateProfilePhoto(file: unknown): ValidationError | null {
  if (!(file instanceof File) || file.size === 0) {
    return { field: 'profilePhoto', message: 'Profile photo is required.' }
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { field: 'profilePhoto', message: 'Profile photo must be JPEG, PNG, WebP, or GIF.' }
  }
  if (file.size > MAX_PROFILE_PHOTO_BYTES) {
    return { field: 'profilePhoto', message: 'Profile photo must be under 5 MB.' }
  }
  return null
}
