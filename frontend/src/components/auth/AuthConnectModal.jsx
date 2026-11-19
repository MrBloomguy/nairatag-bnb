import React, { useState } from 'react';
import {
  ChevronRight,
  ShieldCheck,
  Wallet,
  X,
  ExternalLink,
  Smartphone,
  KeyRound,
  ArrowRight,
} from 'lucide-react';

export default function AuthConnectModal({
  onClose,
  isConnecting,
  authStatus,
  handleConnect,
  handleConnectAddress,
}) {
  const [addressInput, setAddressInput] = useState('');
  const [showAddressInput, setShowAddressInput] = useState(false);
  const hasInjected = typeof window !== 'undefined' && Boolean(window.ethereum || window.BinanceChain);

  const wallets = [
    { name: 'Binance Web3 Wallet', type: 'Binance', badge: 'BNB CHAIN', icon: '🟡' },
    { name: 'MetaMask', type: 'MetaMask', badge: 'BNB CHAIN', icon: '🦊' },
    { name: 'Trust Wallet', type: 'Trust', badge: 'BNB CHAIN', icon: '🛡️' },
    { name: 'Rabby Wallet', type: 'Rabby', badge: 'EVM', icon: '🐰' },
    { name: 'Browser Wallet (Injected)', type: 'injected', badge: 'BNB MAINNET', icon: '⚡' },
  ];

  const handleAddressSubmit = (e) => {
    e.preventDefault();
    if (handleConnectAddress && addressInput.trim()) {
      handleConnectAddress(addressInput.trim());
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{
        zIndex: 9999999,
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(8px)',
        padding: '16px',
      }}
    >
      <div
        className="modal-dialog connect-modal-dialog auth-screen-wallets"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-screen-title"
        style={{
          zIndex: 10000000,
          position: 'relative',
          maxWidth: '440px',
          width: '100%',
          background: '#131417',
          border: '1px solid rgba(240, 185, 11, 0.25)',
          borderRadius: '24px',
          padding: '24px',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.8), 0 0 40px rgba(240, 185, 11, 0.1)',
        }}
      >
        <div className="auth-modal-topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.5px', color: '#F0B90B', textTransform: 'uppercase' }}>
            BNB Smart Chain (56)
          </span>
          <button
            type="button"
            className="auth-close-button"
            onClick={onClose}
            aria-label="Close sign in"
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              cursor: 'pointer',
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="auth-form-screen auth-wallet-screen">
          <div className="auth-form-heading" style={{ marginBottom: '18px' }}>
            <h2 id="auth-screen-title" style={{ fontSize: '24px', fontWeight: 800, color: '#FFFFFF', margin: '0 0 6px 0' }}>
              Sign in with Wallet
            </h2>
            <p style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.65)', margin: 0, lineHeight: 1.5 }}>
              Connect your Web3 wallet to claim your NairaTag, manage tasks, and settle in BNB.
            </p>
          </div>

          <div className="auth-wallet-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {wallets.map((wallet) => (
              <button
                key={wallet.name}
                type="button"
                className="auth-wallet-option"
                disabled={isConnecting}
                onClick={() => handleConnect(wallet.type)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 14px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '14px',
                  color: '#FFFFFF',
                  cursor: isConnecting ? 'wait' : 'pointer',
                  width: '100%',
                  textAlign: 'left',
                  transition: 'all 0.18s ease',
                }}
              >
                <span className="auth-wallet-option-icon" style={{ fontSize: '20px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {wallet.icon}
                </span>
                <span className="auth-wallet-option-name" style={{ fontSize: '14px', fontWeight: 650, flex: 1 }}>
                  {wallet.name}
                </span>
                {wallet.badge && (
                  <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '999px', background: 'rgba(240, 185, 11, 0.15)', color: '#F0B90B', border: '1px solid rgba(240, 185, 11, 0.3)' }}>
                    {wallet.badge}
                  </span>
                )}
                <ChevronRight size={16} color="rgba(255, 255, 255, 0.4)" />
              </button>
            ))}
          </div>

          {/* Fallback / Mobile Deep Links & Manual Entry */}
          {!hasInjected && (
            <div style={{
              background: 'rgba(240, 185, 11, 0.08)',
              border: '1px solid rgba(240, 185, 11, 0.25)',
              borderRadius: '12px',
              padding: '12px',
              marginTop: '14px',
              fontSize: '12px',
              color: 'rgba(255, 255, 255, 0.85)',
              lineHeight: 1.5,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: '#F0B90B', marginBottom: '6px' }}>
                <Smartphone size={14} /> Open in Mobile Wallet:
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <a
                  href="https://metamask.app.link/dapp/bnb.nairatag.ng"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#F0B90B', textDecoration: 'underline', fontSize: '11px', fontWeight: 600 }}
                >
                  MetaMask App ↗
                </a>
                <span style={{ color: 'rgba(255,255,255,0.3)' }}>•</span>
                <a
                  href="https://link.trustwallet.com/open_url?coin_id=20000714&url=https%3A%2F%2Fbnb.nairatag.ng"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#F0B90B', textDecoration: 'underline', fontSize: '11px', fontWeight: 600 }}
                >
                  Trust Wallet App ↗
                </a>
              </div>
            </div>
          )}

          {/* Address / Tag Entry Option */}
          <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
            {!showAddressInput ? (
              <button
                type="button"
                onClick={() => setShowAddressInput(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255, 255, 255, 0.65)',
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  padding: '4px 0',
                }}
              >
                <KeyRound size={13} color="#F0B90B" />
                <span>Or sign in with BNB address / ₦Tag</span>
              </button>
            ) : (
              <form onSubmit={handleAddressSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255, 255, 255, 0.6)' }}>
                  ENTER 0x ADDRESS OR ₦TAG
                </label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="text"
                    placeholder="0x... or ₦tag"
                    value={addressInput}
                    onChange={(e) => setAddressInput(e.target.value)}
                    style={{
                      flex: 1,
                      background: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '10px',
                      padding: '8px 12px',
                      color: '#FFFFFF',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  />
                  <button
                    type="submit"
                    style={{
                      background: '#F0B90B',
                      color: '#000000',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '8px 14px',
                      fontWeight: 700,
                      fontSize: '12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <span>Go</span>
                    <ArrowRight size={13} />
                  </button>
                </div>
              </form>
            )}
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

          <div className="auth-wallet-footnote" style={{ marginTop: '16px', fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)', textAlign: 'center' }}>
            <ShieldCheck size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '4px', color: '#10b981' }} />
            Non-custodial. Your keys remain strictly on your device.
          </div>
        </div>
      </div>
    </div>
  );
}
