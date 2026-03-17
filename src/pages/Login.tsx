import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Login.css';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError('Please enter both username and password.');
      return;
    }
    if (login(username, password)) {
      navigate('/', { replace: true });
    } else {
      setError('Invalid credentials. Please try again.');
    }
  }

  return (
    <div className="login-page">
      <div className="login-card card">
        <div className="login-brand">
          <span className="login-logo">CIA</span>
          <h1>CIAssist</h1>
          <p className="login-tagline">Change Impact Assessment</p>
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your username"
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
          />
          {error && <p className="login-error">{error}</p>}
          <button type="submit" className="btn btn-primary login-submit">
            Sign in
          </button>
        </form>
        <p className="login-footer">
          Authorised use only. Change Management Team access.
        </p>
      </div>
    </div>
  );
}
