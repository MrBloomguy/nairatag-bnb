import React, { useState } from 'react';
import {
  ChevronRight,
  ShieldCheck,
  X,
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
    { name: 'Binance Web3 Wallet', type: 'Binance', badge: 'BNB', icon: '🟡' },
    { name: 'MetaMask', type: 'MetaMask', badge: 'POPULAR', icon: '🦊' },
    { name: 'Trust Wallet', type: 'Trust', badge: 'BNB', icon: '🛡️' },
    { name: 'Rabby / Browser Wallet', type: 'injected', badge: 'EVM', icon: '⚡' },
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
        background: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(6px)',
        padding: '14px',
      }}
    >
      <div
        className="modal-dialog connect-modal-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-screen-title"
        style={{
          zIndex: 10000000,
          position: 'relative',
          maxWidth: '360px',
          width: '100%',
          background: '#121316',
          border: '1px solid rgba(240, 185, 11, 0.28)',
          borderRadius: '20px',
          padding: '18px 20px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.85), 0 0 30px rgba(240, 185, 11, 0.08)',
          overflow: 'hidden',
        }}
      >
        {/* Top Gold Accent Line */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '2px',
            background: 'linear-gradient(90deg, #F0B90B 0%, #F8D33A 100%)',
          }}
        />

        {/* Top bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            background: 'rgba(240, 185, 11, 0.1)',
            border: '1px solid rgba(240, 185, 11, 0.25)',
            padding: '2px 8px',
            borderRadius: '999px',
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#F0B90B', display: 'inline-block' }} />
            <span style={{ fontSize: '10.5px', fontWeight: 800, letterSpacing: '0.4px', color: '#F0B90B', textTransform: 'uppercase' }}>
              BNB Chain (56)
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: 'none',
              borderRadius: '50%',
              width: '26px',
              height: '26px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgba(255, 255, 255, 0.7)',
              cursor: 'pointer',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.14)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'; }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Heading */}
        <div style={{ marginBottom: '14px' }}>
          <h2 id="auth-screen-title" style={{ fontSize: '17px', fontWeight: 800, color: '#FFFFFF', margin: '0 0 3px 0' }}>
            Sign in with Wallet
          </h2>
          <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', margin: 0, lineHeight: 1.4 }}>
            Connect to claim ₦Tag, interact with Agent ID, and settle tasks in BNB.
          </p>
        </div>

        {/* Wallets List - Sleek & Compact */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {wallets.map((wallet) => (
            <button
              key={wallet.name}
              type="button"
              disabled={isConnecting}
              onClick={() => handleConnect(wallet.type)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '9px 12px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                color: '#FFFFFF',
                cursor: isConnecting ? 'wait' : 'pointer',
                width: '100%',
                textAlign: 'left',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(240, 185, 11, 0.08)';
                e.currentTarget.style.borderColor = 'rgba(240, 185, 11, 0.35)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
              }}
            >
              <span style={{ fontSize: '17px', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {wallet.icon}
              </span>
              <span style={{ fontSize: '13px', fontWeight: 650, flex: 1, letterSpacing: '-0.2px' }}>
                {wallet.name}
              </span>
              {wallet.badge && (
                <span style={{
                  fontSize: '9.5px',
                  fontWeight: 750,
                  padding: '2px 6px',
                  borderRadius: '999px',
                  background: 'rgba(240, 185, 11, 0.12)',
                  color: '#F0B90B',
                  border: '1px solid rgba(240, 185, 11, 0.25)',
                }}>
                  {wallet.badge}
                </span>
              )}
              <ChevronRight size={14} color="rgba(255, 255, 255, 0.35)" />
            </button>
          ))}
        </div>

        {/* Mobile Deep Link hint if no injected extension */}
        {!hasInjected && (
          <div style={{
            background: 'rgba(240, 185, 11, 0.06)',
            border: '1px solid rgba(240, 185, 11, 0.18)',
            borderRadius: '10px',
            padding: '8px 10px',
            marginTop: '10px',
            fontSize: '11px',
            color: 'rgba(255, 255, 255, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#F0B90B', fontWeight: 700 }}>
              <Smartphone size={12} /> Mobile:
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <a
                href="https://metamask.app.link/dapp/bnb.nairatag.ng"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#F0B90B', textDecoration: 'underline', fontSize: '10.5px', fontWeight: 600 }}
              >
                MetaMask ↗
              </a>
              <span style={{ color: 'rgba(255,255,255,0.25)' }}>•</span>
              <a
                href="https://link.trustwallet.com/open_url?coin_id=20000714&url=https%3A%2F%2Fbnb.nairatag.ng"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#F0B90B', textDecoration: 'underline', fontSize: '10.5px', fontWeight: 600 }}
              >
                Trust ↗
              </a>
            </div>
          </div>
        )}

        {/* Optional Manual Address / Tag Entry */}
        <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
          {!showAddressInput ? (
            <button
              type="button"
              onClick={() => setShowAddressInput(true)}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.55)',
                fontSize: '11.5px',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                cursor: 'pointer',
                padding: '2px 0',
                width: '100%',
                justifyContent: 'center',
              }}
            >
              <KeyRound size={12} color="#F0B90B" />
              <span>Or sign in with 0x address / ₦Tag</span>
            </button>
          ) : (
            <form onSubmit={handleAddressSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  placeholder="0x... or ₦tag"
                  value={addressInput}
                  onChange={(e) => setAddressInput(e.target.value)}
                  autoFocus
                  style={{
                    flex: 1,
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    color: '#FFFFFF',
                    fontSize: '12px',
                    outline: 'none',
                  }}
                />
                <button
                  type="submit"
                  style={{
                    background: '#F0B90B',
                    color: '#000000',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    fontWeight: 700,
                    fontSize: '11.5px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                  }}
                >
                  <span>Go</span>
                  <ArrowRight size={12} />
                </button>
              </div>
            </form>
          )}
        </div>

        {authStatus && (
          <div style={{
            marginTop: '8px',
            textAlign: 'center',
            fontSize: '11px',
            color: '#F0B90B',
            fontWeight: 600,
          }}>
            {authStatus}
          </div>
        )}

        <div style={{ marginTop: '10px', fontSize: '10.5px', color: 'rgba(255, 255, 255, 0.45)', textAlign: 'center' }}>
          <ShieldCheck size={11} style={{ display: 'inline', verticalAlign: '-1px', marginRight: '3px', color: '#10b981' }} />
          Non-custodial. Your keys stay on your device.
        </div>
      </div>
    </div>
  );
}
