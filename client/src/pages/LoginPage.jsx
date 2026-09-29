import { useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'

function LoginPage({ onShowRegister }) {
  const { login } = useAuth()
  const [form, setForm] = useState({ identifier: '', password: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(form)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div>
          <h1>Welcome back</h1>
          <p>Sign in to continue learning your vocabulary.</p>
        </div>
        {error && <p className="error-message" role="alert">{error}</p>}
        <label className="form-field">
          <span>Email or Display Name</span>
          <input autoComplete="username" placeholder="you@example.com or your display name" required value={form.identifier} onChange={(event) => setForm({ ...form, identifier: event.target.value })} />
        </label>
        <label className="form-field">
          <span>Password</span>
          <input autoComplete="current-password" minLength="8" required type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
        </label>
        <button className="primary-button" disabled={submitting} type="submit">{submitting ? 'Signing in…' : 'Login'}</button>
        <p className="auth-switch">New here? <button className="auth-link" onClick={onShowRegister} type="button">Create an account</button></p>
      </form>
    </main>
  )
}

export default LoginPage
