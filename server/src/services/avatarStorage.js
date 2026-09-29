import { v2 as cloudinary } from 'cloudinary'

export class AvatarStorageConfigurationError extends Error {}

export function createCloudinaryAvatarStorage({ cloudName, apiKey, apiSecret } = {}) {
  const configured = Boolean(cloudName?.trim() && apiKey?.trim() && apiSecret?.trim())
  if (configured) {
    cloudinary.config({
      cloud_name: cloudName.trim(),
      api_key: apiKey.trim(),
      api_secret: apiSecret.trim(),
      secure: true,
    })
  }

  function ensureConfigured() {
    if (!configured) {
      throw new AvatarStorageConfigurationError('Cloudinary avatar storage is not configured.')
    }
  }

  return {
    async upload(buffer) {
      ensureConfigured()
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({
          folder: 'english-flashcard-assistant/avatars',
          resource_type: 'image',
          transformation: [{ width: 256, height: 256, crop: 'fill', gravity: 'auto', quality: 'auto', fetch_format: 'auto' }],
        }, (error, result) => {
          if (error) return reject(error)
          return resolve({ avatarUrl: result.secure_url, publicId: result.public_id })
        })
        stream.end(buffer)
      })
    },

    async destroy(publicId) {
      ensureConfigured()
      if (!publicId) return
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true })
    },
  }
}
