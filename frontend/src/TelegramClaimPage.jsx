import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLoginWithEmail, usePrivy, useWallets } from '@privy-io/react-auth';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Copy, ExternalLink, LoaderCircle, Share2, ShieldCheck, Sparkles } from 'lucide-react';
import { normalizeArcTag, checkArcTagAvailability } from './services/arcNairaTag.js';
import { establishPrivyArcSession, getArcSessionToken } from './services/arcSession.js';
import { setActiveWalletProvider } from './services/arcPayment.js';
import { claimArcNairaTag } from './services/arcNairaTag.js';
import { submitArcRewardAction } from './services/arcRewards.js';
import './telegram-claim.css';

const CLAIM_API = import.meta.env.VITE_TELEGRAM_CLAIM_API || 'https://nairatag.ng/api/telegram';

async function telegramRequest(body, token = null) {
  const response = await fetch(CLAIM_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: 'no-store',
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) throw new Error(result.error || `NairaTag returned ${response.status}.`);
  return result;
}

function haptic(type = 'light') {
  try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(type); } catch {}
}

export default function TelegramClaimPage() {
  const { sendCode, loginWithCode } = useLoginWithEmail();
  const { getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const walletsRef = useRef(wallets);
  useEffect(() => { walletsRef.current = wallets; }, [wallets]);
  const [initData, setInitData] = useState('');
  const [linkToken, setLinkToken] = useState('');
  const [telegramUser, setTelegramUser] = useState(null);
  const [telegramReady, setTelegramReady] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [availability, setAvailability] = useState(null);
  const [step, setStep] = useState('tag');
  const [email, setEmail] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [claimedTag, setClaimedTag] = useState('');
  const [claimTx, setClaimTx] = useState('');
  const [linkWalletStatus, setLinkWalletStatus] = useState('idle');
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState('Verifying Telegram…');
  const [error, setError] = useState('');

  const cleanTag = useMemo(() => {
    try { return normalizeArcTag(tagInput); } catch { return ''; }
  }, [tagInput]);

  useEffect(() => {
    const requestedTag = new URLSearchParams(window.location.search).get('tag');
    if (requestedTag) setTagInput(requestedTag.replace(/^[₦$@#]/, '').slice(0, 32));
    const webApp = window.Telegram?.WebApp;
    const data = webApp?.initData || '';
    webApp?.ready?.();
    webApp?.expand?.();
    try { webApp?.setHeaderColor?.('#ffffff'); webApp?.setBackgroundColor?.('#ffffff'); } catch {}
    setInitData(data);
    if (!data) {
      setStatusText('Open this claim screen from @MyNairatagbot in Telegram.');
      setTelegramReady(false);
      return;
    }
    let active = true;
    telegramRequest({ action: 'validate', initData: data })
      .then((result) => {
        if (!active) return;
        setTelegramUser(result.user);
        setLinkToken(result.linkToken || '');
        setTelegramReady(true);
        setStatusText('Choose your NairaTag');
      })
      .catch((verificationError) => {
        if (!active) return;
        setStatusText('Telegram sign-in needs refreshing.');
        setError(verificationError.message);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setAvailability(null);
    setError('');
    if (!telegramReady || !cleanTag) return undefined;
    let active = true;
    const timer = window.setTimeout(async () => {
      setAvailability({ loading: true });
      try {
        const result = await telegramRequest({ action: 'availability', initData, tag: cleanTag });
        if (active) setAvailability(result);
      } catch (checkError) {
        if (active) setAvailability({ available: false, reason: checkError.message });
      }
    }, 350);
    return () => { active = false; window.clearTimeout(timer); };
  }, [cleanTag, initData, telegramReady]);

  const requestCode = async (event) => {
    event.preventDefault();
    if (!availability?.available || !cleanTag) return;
    setBusy(true);
    setError('');
    setStatusText('Sending your verification code…');
    try {
      await sendCode({ email: email.trim().toLowerCase() });
      setOtpSent(true);
      setStatusText('Check your email for a code');
      haptic('light');
    } catch (requestError) {
      setError(requestError.message || 'Could not start email verification.');
      setStatusText('We could not send the code.');
    } finally { setBusy(false); }
  };

  const executeClaim = async () => {
    setBusy(true);
    setError('');
    setStatusText('Confirming your account…');
    try {
      await loginWithCode({ code: otpCode.trim() });
      setStatusText('Preparing your Arc wallet…');
      const deadline = Date.now() + 12000;
      let embeddedWallet = null;
      while (Date.now() < deadline) {
        embeddedWallet = walletsRef.current.find((item) => item.walletClientType === 'privy' && item.type === 'ethereum');
        if (embeddedWallet) break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      if (!embeddedWallet) throw new Error('Your secure Arc wallet is still being created. Please try again shortly.');
      const provider = await embeddedWallet.getEthereumProvider();
      setActiveWalletProvider(provider);
      const walletAddress = embeddedWallet.address;
      const accessToken = await getAccessToken();
      await establishPrivyArcSession({ accessToken, walletAddress });

      const finalAvailability = await checkArcTagAvailability(cleanTag, walletAddress, email);
      if (!finalAvailability.available) throw new Error(finalAvailability.reason || 'This tag is no longer available.');
      setStatusText('Registering your NairaTag on Arc…');
      const claim = await claimArcNairaTag({ rawTag: cleanTag, walletAddress });

      let pointsSyncError = null;
      try {
        await submitArcRewardAction({ action: 'tag_claimed', walletAddress, tag: claim.cleanTag, txHash: claim.txHash });
      } catch (syncError) { pointsSyncError = syncError; }

      setStatusText('Linking your Telegram identity…');
      const token = getArcSessionToken(walletAddress);
      setWalletAddress(walletAddress);
      setClaimedTag(claim.cleanTag);
      setClaimTx(claim.txHash);
      setStep('success');
      setStatusText('Your tag is yours.');
      haptic('success');

      try {
        await telegramRequest({ action: 'link_wallet', initData, linkToken, tag: claim.cleanTag }, token);
        setLinkWalletStatus('linked');
      } catch (linkError) {
        setLinkWalletStatus('retry');
        setError(linkError.message || 'Your tag is on Arc, but Telegram account linking needs a retry.');
      }
      if (pointsSyncError) console.warn('[Telegram claim rewards sync]', pointsSyncError.message);
    } catch (claimError) {
      setError(claimError.message || 'The claim could not be completed.');
      setStatusText('Claim not completed');
      haptic('error');
    } finally { setBusy(false); }
  };

  const retryIdentityLink = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      await telegramRequest({ action: 'link_wallet', initData, linkToken, tag: claimedTag }, getArcSessionToken(walletAddress));
      setLinkWalletStatus('linked');
    } catch (linkError) {
      setError(linkError.message || 'Telegram account linking failed.');
    } finally { setBusy(false); }
  }, [claimedTag, initData, linkToken, walletAddress]);

  const copyTag = async () => {
    try { await navigator.clipboard.writeText(`₦${claimedTag.toUpperCase()}`); haptic(); setStatusText('Tag copied'); }
    catch { setError('Copy is not available in this Telegram client.'); }
  };

  const shareTag = () => {
    const url = `https://arc.nairatag.ng/tag/${encodeURIComponent(claimedTag)}`;
    const text = `My tag is ₦${claimedTag.toUpperCase()} — your tag is your agent.`;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
    try { window.Telegram?.WebApp?.openTelegramLink?.(shareUrl); }
    catch { window.location.href = shareUrl; }
  };

  return (
    <main className="tg-claim-shell">
      <header className="tg-claim-brand">
        <img src="/nairatag-logo.png" alt="" />
        <span>₦ NairaTag</span>
        <span className="tg-claim-badge">CLAIM</span>
      </header>

      {step !== 'success' ? (
        <>
          <section className="tg-claim-hero">
            <span className="tg-claim-eyebrow">{telegramUser?.firstName ? `WELCOME, ${telegramUser.firstName.toUpperCase()}` : 'NAIRATAG IDENTITY'}</span>
            <h1>Your tag is<br />your agent.</h1>
            <p>Claim your identity in the agent economy.</p>
          </section>

          {step === 'tag' && (
            <section className="tg-claim-card">
              <label className="tg-claim-label" htmlFor="tg-tag-input">Choose your NairaTag</label>
              <div className="tg-tag-input-wrap">
                <span>₦</span>
                <input id="tg-tag-input" autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck="false" maxLength={32} value={tagInput} onChange={(event) => setTagInput(event.target.value)} placeholder="yourname" aria-describedby="tg-tag-status" />
              </div>
              <div id="tg-tag-status" className={`tg-tag-status ${availability?.available ? 'is-available' : ''}`} aria-live="polite">
                {!telegramReady ? <><LoaderCircle className="tg-spin" size={15} /> {statusText}</>
                  : !cleanTag ? '3–32 letters or numbers; underscores can go inside.'
                    : availability?.loading ? <><LoaderCircle className="tg-spin" size={15} /> Checking Arc registry…</>
                      : availability?.available ? <><CheckCircle2 size={16} /> ₦{cleanTag.toUpperCase()} is available</>
                        : availability?.reason || 'Check your tag again.'}
              </div>
              <div className="tg-tag-preview">
                <span className="tg-preview-label">YOUR TAG WILL BE</span>
                <strong>Your identity + your agent</strong>
                <p>Claiming creates your NairaTag identity. Activate agent features any time afterwards.</p>
              </div>
              <button className="tg-primary-button" type="button" disabled={!telegramReady || !availability?.available || busy} onClick={() => { setStep('confirm'); setStatusText('Review your claim'); haptic(); }}>
                Claim ₦{cleanTag ? cleanTag.toUpperCase() : 'YOUR TAG'} <ArrowRight size={18} />
              </button>
              <p className="tg-claim-footnote"><ShieldCheck size={14} /> Telegram identity verified securely</p>
            </section>
          )}

          {step === 'confirm' && (
            <section className="tg-claim-card">
              <button className="tg-back-link" type="button" onClick={() => setStep('tag')}><ArrowLeft size={16} /> Change tag</button>
              <span className="tg-claim-label">CONFIRM YOUR CLAIM</span>
              <div className="tg-confirm-tag">₦{cleanTag.toUpperCase()}</div>
              <div className="tg-claim-details">
                <div><span>Claim fee</span><strong>No NairaTag fee</strong></div>
                <div><span>Network</span><strong>Arc Mainnet</strong></div>
                <div><span>Account</span><strong>Verified with Telegram + email</strong></div>
              </div>
              <p className="tg-note">NairaTag will check your account eligibility again before it sends the on-chain claim. Privy email sign-in securely creates your Arc wallet; you do not need to connect a browser wallet.</p>
              <button className="tg-primary-button" type="button" disabled={!telegramReady || busy} onClick={() => setStep('email')}>
                Continue to claim <ArrowRight size={18} />
              </button>
            </section>
          )}

          {step === 'email' && (
            <section className="tg-claim-card">
              <button className="tg-back-link" type="button" onClick={() => { setStep('confirm'); setError(''); }} disabled={busy}><ArrowLeft size={16} /> Back</button>
              <span className="tg-claim-label">SECURE ACCOUNT SETUP</span>
              <h2 className="tg-card-heading">{otpSent ? 'Check your email' : 'Continue with email'}</h2>
              <p className="tg-card-copy">{otpSent ? `Enter the verification code sent to ${email}.` : 'Email verification creates your Arc wallet securely. You can link a personal wallet after your tag is claimed.'}</p>
              {!otpSent ? (
                <form onSubmit={requestCode}>
                  <label className="tg-claim-label" htmlFor="tg-claim-email">Email address</label>
                  <input id="tg-claim-email" className="tg-email-input" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
                  <button className="tg-primary-button" type="submit" disabled={busy || !email.trim()}>
                    {busy ? <><LoaderCircle className="tg-spin" size={17} /> Sending code…</> : <>Send verification code <ArrowRight size={18} /></>}
                  </button>
                </form>
              ) : (
                <>
                <label className="tg-claim-label" htmlFor="tg-claim-code">Email verification code</label>
                <input id="tg-claim-code" className="tg-email-input" inputMode="numeric" autoComplete="one-time-code" required value={otpCode} onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" />
                <button className="tg-primary-button" type="button" disabled={busy || otpCode.length < 6} onClick={executeClaim}>
                  {busy ? <><LoaderCircle className="tg-spin" size={17} /> {statusText}</> : <>Verify and claim ₦{cleanTag.toUpperCase()} <ArrowRight size={18} /></>}
                </button>
                </>
              )}
              <p className="tg-claim-footnote"><ShieldCheck size={14} /> Your claim is shown only after Arc confirms it.</p>
            </section>
          )}
        </>
      ) : (
        <section className="tg-claim-success">
          <div className="tg-success-icon"><Check size={28} /></div>
          <span className="tg-claim-eyebrow">IDENTITY CLAIMED</span>
          <h1>Your tag<br />is yours.</h1>
          <div className="tg-success-tag">₦{claimedTag.toUpperCase()}</div>
          <p>Your tag is your agent. Agent capabilities can be activated any time.</p>
          {linkWalletStatus === 'linked' ? <div className="tg-linked-note"><CheckCircle2 size={16} /> Telegram identity linked to your NairaTag account</div>
            : linkWalletStatus === 'retry' ? <button className="tg-secondary-button" type="button" disabled={busy} onClick={retryIdentityLink}>Retry Telegram account link</button>
              : <div className="tg-linked-note"><LoaderCircle className="tg-spin" size={15} /> Saving your Telegram account link…</div>}
          {error && <p className="tg-claim-error" role="alert">{error}</p>}
          <div className="tg-success-actions">
            <button className="tg-primary-button" type="button" onClick={shareTag}><Share2 size={17} /> Share NairaTag</button>
            <button className="tg-secondary-button" type="button" onClick={copyTag}><Copy size={16} /> Copy tag</button>
            <a className="tg-secondary-button" href="https://arc.nairatag.ng/#profile" onClick={(event) => { event.preventDefault(); window.Telegram?.WebApp?.openLink?.('https://arc.nairatag.ng/#profile'); }}><ExternalLink size={16} /> Link another wallet later</a>
            <a className="tg-secondary-button" href={`https://arc.nairatag.ng/tag/${encodeURIComponent(claimedTag)}`} target="_blank" rel="noreferrer">View NairaTag profile <ExternalLink size={15} /></a>
          </div>
          {claimTx && <a className="tg-explorer-link" href={`https://explorer.arc.io/tx/${claimTx}`} target="_blank" rel="noreferrer">View confirmed Arc transaction <ExternalLink size={14} /></a>}
          <div className="tg-agent-reminder"><Sparkles size={16} /><span>Next: make your tag an agent when you’re ready.</span></div>
        </section>
      )}

      {error && step !== 'success' && <div className="tg-claim-error" role="alert">{error}</div>}
      {(busy || !telegramReady || (otpSent && step === 'email')) && step !== 'success' && <div className="tg-live-status" aria-live="polite">{busy && <LoaderCircle className="tg-spin" size={14} />}{statusText}</div>}
      <footer className="tg-claim-footer">NairaTag <span>•</span> Arc Mainnet</footer>
    </main>
  );
}
