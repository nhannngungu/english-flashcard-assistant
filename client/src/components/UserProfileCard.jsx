import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'

const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const maximumAvatarBytes = 5 * 1024 * 1024

function UserAvatar({ avatarUrl, displayName, size = 'normal' }) {
  const [imageFailed, setImageFailed] = useState(false)
  useEffect(() => setImageFailed(false), [avatarUrl])
  const initial = displayName?.trim().charAt(0).toLocaleUpperCase() || '?'

  return (
    <span className={`user-avatar user-avatar-${size}`} aria-label={`${displayName} avatar`}>
      {avatarUrl && !imageFailed
        ? <img alt="" onError={() => setImageFailed(true)} src={avatarUrl} />
        : <span aria-hidden="true">{initial}</span>}
    </span>
  )
}

function UserProfileCard() {
  const { user, updateProfile, uploadAvatar, removeAvatar, logout } = useAuth()
  const fileInputRef = useRef(null)
  const [editing, setEditing] = useState(false)
  const [displayName, setDisplayName] = useState(user.display_name)
  const [selectedFile, setSelectedFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl('')
      return undefined
    }
    const localUrl = URL.createObjectURL(selectedFile)
    setPreviewUrl(localUrl)
    return () => URL.revokeObjectURL(localUrl)
  }, [selectedFile])

  function openEditor() {
    setDisplayName(user.display_name)
    setSelectedFile(null)
    setError('')
    setEditing(true)
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0] || null
    setError('')
    if (!file) {
      setSelectedFile(null)
      return
    }
    if (!allowedImageTypes.has(file.type)) {
      setError('Choose a JPEG, PNG, or WebP image.')
      event.target.value = ''
      setSelectedFile(null)
      return
    }
    if (file.size > maximumAvatarBytes) {
      setError('Avatar images must be 5 MB or smaller.')
      event.target.value = ''
      setSelectedFile(null)
      return
    }
    setSelectedFile(file)
  }

  async function handleSave(event) {
    event.preventDefault()
    setError('')
    setSaving(true)
    try {
      if (displayName.trim() !== user.display_name) await updateProfile({ display_name: displayName })
      if (selectedFile) await uploadAvatar(selectedFile)
      setEditing(false)
      setSelectedFile(null)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleRemoveAvatar() {
    setError('')
    if (selectedFile && !user.avatar_url) {
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    setSaving(true)
    try {
      await removeAvatar()
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <section className="user-profile-card" aria-label="Signed-in user">
        <UserAvatar avatarUrl={user.avatar_url} displayName={user.display_name} />
        <div className="user-profile-details">
          <strong>{user.display_name}</strong>
          <small>{user.email}</small>
        </div>
        <div className="user-profile-actions">
          <button className="subtle-button" onClick={openEditor} type="button">Edit Profile</button>
          <button className="subtle-button" onClick={logout} type="button">Logout</button>
        </div>
      </section>

      {editing && (
        <div className="profile-editor-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !saving) setEditing(false)
        }}>
          <form aria-labelledby="profile-editor-title" className="profile-editor" onSubmit={handleSave} role="dialog">
            <div className="profile-editor-heading">
              <UserAvatar avatarUrl={previewUrl || user.avatar_url} displayName={displayName} size="large" />
              <div><h2 id="profile-editor-title">Edit Profile</h2><p>Update your name or profile image.</p></div>
            </div>
            {error && <p className="error-message" role="alert">{error}</p>}
            <label className="form-field">
              <span>Display Name</span>
              <input maxLength="100" required value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            </label>
            <div className="form-field profile-avatar-field">
              <label htmlFor="profile-avatar-input">Avatar Image</label>
              <input accept="image/jpeg,image/png,image/webp" id="profile-avatar-input" onChange={handleFileChange} ref={fileInputRef} type="file" />
              {selectedFile && <span className="selected-avatar-name">Selected: {selectedFile.name}</span>}
              {(user.avatar_url || selectedFile) && (
                <button className="delete-button" disabled={saving} onClick={handleRemoveAvatar} type="button">
                  {selectedFile && !user.avatar_url ? 'Clear Selection' : 'Remove Avatar'}
                </button>
              )}
              <small>JPEG, PNG, or WebP. Maximum 5 MB. The image uploads only when you save.</small>
            </div>
            <div className="form-actions">
              <button className="primary-button" disabled={saving} type="submit">{saving ? 'Saving…' : 'Save'}</button>
              <button className="secondary-button" disabled={saving} onClick={() => setEditing(false)} type="button">Cancel</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}

export default UserProfileCard
