import { useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'

function RegisterPage({ onShowLogin }) {
  const { register } = useAuth()
  const [form, setForm] = useState({ display_name: '', email: '', password: '', confirmPassword: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setSubmitting(true)
    try {
      await register({ display_name: form.display_name, email: form.email, password: form.password })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  const update = (field) => (event) => setForm({ ...form, [field]: event.target.value })

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div>
          <h1>Create your account</h1>
          <p>Your vocabulary, reviews, and progress will stay private to you.</p>
        </div>
        {error && <p className="error-message" role="alert">{error}</p>}
        <label className="form-field"><span>Display Name</span><input autoComplete="name" required value={form.display_name} onChange={update('display_name')} /></label>
        <label className="form-field"><span>Email</span><input autoComplete="email" required type="email" value={form.email} onChange={update('email')} /></label>
        <label className="form-field"><span>Password</span><input autoComplete="new-password" minLength="8" required type="password" value={form.password} onChange={update('password')} /></label>
        <label className="form-field"><span>Confirm Password</span><input autoComplete="new-password" minLength="8" required type="password" value={form.confirmPassword} onChange={update('confirmPassword')} /></label>
        <button className="primary-button" disabled={submitting} type="submit">{submitting ? 'Creating account…' : 'Register'}</button>
        <p className="auth-switch">Already have an account? <button className="auth-link" onClick={onShowLogin} type="button">Login</button></p>
      </form>
    </main>
  )
}

export default RegisterPage
