import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  Check,
  ChevronRight,
  RefreshCw,
  Wallet,
  X,
} from 'lucide-react';

export default function AuthConnectModal({
  onClose,
  isConnecting,
  authEmail,
  setAuthEmail,
  authCode,
  setAuthCode,
  authCodeSent,
  setAuthCodeSent,
  authStatus,
  handleSendEmailCode,
  handleVerifyEmailCode,
  handleConnect,
}) {
  const [screen, setScreen] = useState('welcome');

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`modal-dialog connect-modal-dialog auth-screen-${screen}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-screen-title"
      >
        <div className="auth-modal-topbar">
          {screen !== 'welcome' && !authCodeSent ? (
            <button type="button" className="auth-back-button" onClick={() => setScreen('welcome')} aria-label="Back">
              <ArrowLeft size={18} />
            </button>
          ) : <span />}
          <button type="button" className="auth-close-button" onClick={onClose} aria-label="Close sign in">
            <X size={18} />
          </button>
        </div>

        {screen === 'welcome' && (
          <div className="auth-welcome-screen">
            <div className="auth-hero-art" aria-hidden="true">
              <span className="auth-orbit auth-orbit-one" />
              <span className="auth-orbit auth-orbit-two" />
              <img className="auth-hero-logo" src="/nairatag-logo.png" alt="NairaTag" />
              <span className="auth-hero-spark auth-hero-spark-one">✦</span>
              <span className="auth-hero-spark auth-hero-spark-two">✦</span>
            </div>
            <div className="auth-welcome-copy">
              <h2 id="auth-screen-title">Your NairaTag<br />starts here.</h2>
            </div>
            <div className="auth-welcome-actions">
              <button type="button" className="auth-main-cta" onClick={() => setScreen('create')}>
                Continue with email <ArrowRight size={17} />
              </button>
              <button type="button" className="auth-signin-link" onClick={() => setScreen('signin')}>
                I already have an account <span>Sign in</span>
              </button>
            </div>
            <div className="auth-welcome-footer">
              <span>Already have a wallet?</span>
              <button type="button" onClick={() => setScreen('wallets')}>Connect it</button>
            </div>
          </div>
        )}

        {(screen === 'create' || screen === 'signin') && (
          <div className="auth-form-screen">
            <div className="auth-form-heading">
              <h2 id="auth-screen-title">{screen === 'create' ? 'Create your account' : 'Welcome back'}</h2>
              <p>{screen === 'create'
                ? 'Sign up with email. Your Arc wallet is created securely, with no seed phrase to manage.'
                : 'Sign in with the email linked to your NairaTag account.'}</p>
            </div>

            {!authCodeSent ? (
              <form onSubmit={(event) => { event.preventDefault(); handleSendEmailCode(); }} className="auth-email-form">
                <label htmlFor="circle-auth-email">Email address</label>
                <div className="circle-auth-input-wrapper">
                  <AtSign size={16} className="circle-input-icon" />
                  <input
                    id="privy-auth-email"
                    type="email"
                    className="circle-auth-input"
                    placeholder="you@example.com"
                    value={authEmail}
                    onChange={(event) => setAuthEmail(event.target.value)}
                    disabled={isConnecting}
                    autoComplete="email"
                    required
                    autoFocus
                  />
                </div>
                <button type="submit" className="auth-main-cta" disabled={isConnecting || !authEmail.trim()}>
                  {isConnecting && authStatus
                    ? <><RefreshCw size={15} className="animate-spin" /><span>{authStatus}</span></>
                    : <><span>{screen === 'create' ? 'Create account with email' : 'Continue with email'}</span><ArrowRight size={17} /></>}
                </button>
              </form>
            ) : (
              <div className="auth-otp-step" aria-live="polite">
                <div className="auth-otp-heading">
                  <span className="auth-otp-icon"><Check size={16} /></span>
                  <div>
                    <strong>Check your email</strong>
                    <span>{authEmail}</span>
                  </div>
                </div>
                <label className="auth-otp-helper" htmlFor="privy-auth-code">Enter the code from your email</label>
                <input id="privy-auth-code" className="circle-auth-input" inputMode="numeric" autoComplete="one-time-code" value={authCode} onChange={(event) => setAuthCode(event.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} required />
                <button type="button" className="auth-main-cta" onClick={handleVerifyEmailCode} disabled={isConnecting || authCode.length < 6}>
                  {isConnecting
                    ? <><RefreshCw size={15} className="animate-spin" /><span>{authStatus || 'Signing in...'}</span></>
                    : <><span>Verify and continue</span><ArrowRight size={17} /></>}
                </button>
                <button type="button" className="auth-text-button" onClick={() => { setAuthCodeSent(false); setAuthCode(''); }} disabled={isConnecting}>
                  Use a different email
                </button>
              </div>
            )}

            {!authCodeSent && <div className="auth-form-switch">
              {screen === 'create'
                ? <>Already have an account? <button type="button" onClick={() => setScreen('signin')}>Sign in</button></>
                : <>New to NairaTag? <button type="button" onClick={() => setScreen('create')}>Create an account</button></>}
            </div>}
            {!authCodeSent && <button type="button" className="auth-wallet-text-link" onClick={() => setScreen('wallets')}>
              <Wallet size={16} /> Connect a browser wallet
            </button>}
          </div>
        )}

        {screen === 'wallets' && (
          <div className="auth-form-screen auth-wallet-screen">
            <div className="auth-form-heading">
              <p className="auth-eyebrow">USE YOUR OWN WALLET</p>
              <h2 id="auth-screen-title">Connect a wallet</h2>
              <p>Choose a wallet already on your device.</p>
            </div>
            <div className="auth-wallet-list">
              {[
                { name: 'MetaMask', type: 'MetaMask', badge: 'EVM BROWSER' },
                { name: 'Rabby Wallet', type: 'Rabby', badge: 'EVM BROWSER' },
                { name: 'Browser Wallet (Injected)', type: 'injected', badge: 'ARC MAINNET' },
              ].map((wallet) => (
                <button key={wallet.name} type="button" className="auth-wallet-option" disabled={isConnecting} onClick={() => handleConnect(wallet.type)}>
                  <span className="auth-wallet-option-icon"><Wallet size={17} /></span>
                  <span className="auth-wallet-option-name">{wallet.name}</span>
                  {wallet.badge && <span className="auth-wallet-network-pill">{wallet.badge}</span>}
                  <ChevronRight size={17} className="auth-wallet-chevron" />
                </button>
              ))}
            </div>
            <div className="auth-wallet-footnote">Your wallet stays under your control.</div>
          </div>
        )}
      </div>
    </div>
  );
}
