import React, { useState } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  ShieldCheck,
  Wallet,
  X,
  ExternalLink,
} from 'lucide-react';

export default function AuthConnectModal({
  onClose,
  isConnecting,
  authStatus,
  handleConnect,
}) {
  const [screen, setScreen] = useState('wallets');
  const hasInjected = typeof window !== 'undefined' && Boolean(window.ethereum || window.BinanceChain);

  const wallets = [
    { name: 'Binance Web3 Wallet', type: 'Binance', badge: 'BNB CHAIN', icon: '🟡' },
    { name: 'MetaMask', type: 'MetaMask', badge: 'BNB CHAIN', icon: '🦊' },
    { name: 'Trust Wallet', type: 'Trust', badge: 'BNB CHAIN', icon: '🛡️' },
    { name: 'Rabby Wallet', type: 'Rabby', badge: 'EVM', icon: '🐰' },
    { name: 'Browser Wallet (Injected)', type: 'injected', badge: 'BNB MAINNET', icon: '⚡' },
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-dialog connect-modal-dialog auth-screen-wallets"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-screen-title"
      >
        <div className="auth-modal-topbar">
          <span />
          <button type="button" className="auth-close-button" onClick={onClose} aria-label="Close sign in">
            <X size={18} />
          </button>
        </div>

        <div className="auth-form-screen auth-wallet-screen">
          <div className="auth-form-heading">
            <p className="auth-eyebrow" style={{ color: '#F0B90B' }}>BNB SMART CHAIN (56)</p>
            <h2 id="auth-screen-title">Sign in with Wallet</h2>
            <p>Connect your Web3 wallet to claim your NairaTag and settle directly in BNB.</p>
          </div>

          {!hasInjected && (
            <div style={{
              background: 'rgba(240, 185, 11, 0.1)',
              border: '1px solid rgba(240, 185, 11, 0.3)',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '16px',
              fontSize: '12px',
              color: 'rgba(255, 255, 255, 0.85)',
              lineHeight: 1.5,
            }}>
              <strong>No EVM wallet detected:</strong> If you are on mobile, open <code>bnb.nairatag.ng</code> inside the built-in browser of MetaMask, Trust Wallet, or Binance App.
            </div>
          )}

          <div className="auth-wallet-list">
            {wallets.map((wallet) => (
              <button
                key={wallet.name}
                type="button"
                className="auth-wallet-option"
                disabled={isConnecting}
                onClick={() => handleConnect(wallet.type)}
                style={{ cursor: isConnecting ? 'wait' : 'pointer' }}
              >
                <span className="auth-wallet-option-icon" style={{ fontSize: '18px' }}>
                  {wallet.icon}
                </span>
                <span className="auth-wallet-option-name">{wallet.name}</span>
                {wallet.badge && <span className="auth-wallet-network-pill">{wallet.badge}</span>}
                <ChevronRight size={17} className="auth-wallet-chevron" />
              </button>
            ))}
          </div>

          {authStatus && (
            <div style={{
              marginTop: '12px',
              textAlign: 'center',
              fontSize: '12px',
              color: '#F0B90B',
              fontWeight: 600,
            }}>
              {authStatus}
            </div>
          )}

          <div className="auth-wallet-footnote" style={{ marginTop: '16px' }}>
            <ShieldCheck size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '4px', color: '#10b981' }} />
            Your keys remain secure. Settles natively on BNB Smart Chain.
          </div>
        </div>
      </div>
    </div>
  );
}
