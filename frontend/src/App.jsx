import React, { useState, useEffect, useCallback } from 'react';
import {
  Wallet,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  Search,
  Sparkles,
  Send,
  ShieldCheck,
  Award,
  TrendingUp,
  Cpu,
  Layers,
  ChevronRight,
  RefreshCw,
  QrCode,
  Check,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  formatEther,
  parseEther,
} from 'viem';
import { bsc } from 'viem/chains';
import {
  BNB_MAINNET_CONFIG,
  CONTRACT_ADDRESSES,
  REGISTRY_ABI,
  RESOLVER_ABI,
  ACTIVATION_ABI,
  AGENT_ID_ABI,
  VALIDITY_STATUS_MAP,
} from './config/contracts';

const MAINNET = CONTRACT_ADDRESSES.mainnet;

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState('claim'); // 'claim' | 'activation' | 'pay' | 'agent'

  // Web3 state
  const [account, setAccount] = useState(null);
  const [balance, setBalance] = useState('0');
  const [chainId, setChainId] = useState(null);
  const [hasAgentId, setHasAgentId] = useState(false);
  const [agentIdCount, setAgentIdCount] = useState('0');
  const [isConnecting, setIsConnecting] = useState(false);

  // Live Protocol Metrics
  const [uniqueHoldersCount, setUniqueHoldersCount] = useState('0');
  const [activeActivationsCount, setActiveActivationsCount] = useState('0');

  // Tag Claim & Resolve State
  const [searchTag, setSearchTag] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState(null);

  // Activation Tab State
  const [activationTagInput, setActivationTagInput] = useState('');
  const [activationStatus, setActivationStatus] = useState(null);
  const [isActivating, setIsActivating] = useState(false);
  const [activationSuccess, setActivationSuccess] = useState(null);

  // Pay Tab State
  const [payRecipientTag, setPayRecipientTag] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [resolvedPayAddress, setResolvedPayAddress] = useState(null);
  const [isResolvingPay, setIsResolvingPay] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [payTxHash, setPayTxHash] = useState(null);

  // Agent Skills State
  const [skillTab, setSkillTab] = useState('ticker'); // 'ticker' | 'security' | 'defillama'
  const [tickerSymbol, setTickerSymbol] = useState('BNBUSDT');
  const [tickerData, setTickerData] = useState(null);
  const [securityTokenAddress, setSecurityTokenAddress] = useState('');
  const [securityData, setSecurityData] = useState(null);
  const [defillamaData, setDefillamaData] = useState(null);
  const [isQueryingSkill, setIsQueryingSkill] = useState(false);

  // Public Client
  const publicClient = createPublicClient({
    chain: bsc,
    transport: http('https://bsc-dataseed.binance.org'),
  });

  // Load Protocol Stats on Mount
  const loadProtocolStats = useCallback(async () => {
    try {
      const [holders, active] = await Promise.all([
        publicClient.readContract({
          address: MAINNET.activation,
          abi: ACTIVATION_ABI,
          functionName: 'totalUniqueHolders',
        }),
        publicClient.readContract({
          address: MAINNET.activation,
          abi: ACTIVATION_ABI,
          functionName: 'totalActiveActivations',
        }),
      ]);
      setUniqueHoldersCount(holders.toString());
      setActiveActivationsCount(active.toString());
    } catch (err) {
      console.warn('Failed to load live protocol stats:', err);
    }
  }, []);

  useEffect(() => {
    loadProtocolStats();
  }, [loadProtocolStats]);

  // Check Account Data (Balance + SPACE ID Agent ID)
  const refreshAccountData = useCallback(async (userAddress) => {
    if (!userAddress) return;
    try {
      const [bal, agentIdBal] = await Promise.all([
        publicClient.getBalance({ address: userAddress }),
        publicClient.readContract({
          address: MAINNET.officialAgentId,
          abi: AGENT_ID_ABI,
          functionName: 'balanceOf',
          args: [userAddress],
        }),
      ]);
      setBalance(formatEther(bal));
      setAgentIdCount(agentIdBal.toString());
      setHasAgentId(agentIdBal > 0n);
    } catch (err) {
      console.error('Failed to load account data:', err);
    }
  }, []);

  // Connect Wallet
  const connectWallet = async () => {
    if (typeof window === 'undefined' || !window.ethereum) {
      alert('No EVM wallet detected. Please install Binance Web3 Wallet, MetaMask, or Rabby.');
      return;
    }
    setIsConnecting(true);
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (accounts && accounts[0]) {
        const userAddr = accounts[0];
        setAccount(userAddr);

        // Switch to BSC Mainnet if needed
        const currentChainHex = await window.ethereum.request({ method: 'eth_chainId' });
        const currentChain = parseInt(currentChainHex, 16);
        setChainId(currentChain);

        if (currentChain !== 56) {
          try {
            await window.ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: '0x38' }],
            });
            setChainId(56);
          } catch (switchError) {
            if (switchError.code === 4902) {
              await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [
                  {
                    chainId: '0x38',
                    chainName: 'BNB Smart Chain Mainnet',
                    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
                    rpcUrls: ['https://bsc-dataseed.binance.org'],
                    blockExplorerUrls: ['https://bscscan.com'],
                  },
                ],
              });
              setChainId(56);
            }
          }
        }
        await refreshAccountData(userAddr);
      }
    } catch (err) {
      console.error('Connect wallet failed:', err);
    } finally {
      setIsConnecting(false);
    }
  };

  // Search Tag in Registry
  const handleSearchTag = async (e) => {
    e?.preventDefault();
    if (!searchTag.trim()) return;
    setIsSearching(true);
    setSearchResult(null);
    try {
      const canonical = await publicClient.readContract({
        address: MAINNET.registry,
        abi: REGISTRY_ABI,
        functionName: 'normalize',
        args: [searchTag],
      });
      const node = await publicClient.readContract({
        address: MAINNET.registry,
        abi: REGISTRY_ABI,
        functionName: 'namehash',
        args: [searchTag],
      });
      const owner = await publicClient.readContract({
        address: MAINNET.registry,
        abi: REGISTRY_ABI,
        functionName: 'owner',
        args: [node],
      });
      const resolvedAddress = await publicClient.readContract({
        address: MAINNET.resolver,
        abi: RESOLVER_ABI,
        functionName: 'addr',
        args: [node],
      });

      const isClaimed = owner !== '0x0000000000000000000000000000000000000000';

      setSearchResult({
        raw: searchTag,
        canonical,
        node,
        owner,
        resolvedAddress,
        isClaimed,
      });
    } catch (err) {
      alert(`Tag validation failed: ${err.message}`);
    } finally {
      setIsSearching(false);
    }
  };

  // Claim Tag
  const handleClaimTag = async (tagToClaim) => {
    if (!account) {
      await connectWallet();
      return;
    }
    setIsClaiming(true);
    setClaimSuccess(null);
    try {
      const walletClient = createWalletClient({
        account,
        chain: bsc,
        transport: custom(window.ethereum),
      });

      const txHash = await walletClient.writeContract({
        address: MAINNET.registry,
        abi: REGISTRY_ABI,
        functionName: 'claim',
        args: [tagToClaim, MAINNET.resolver],
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status === 'success') {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        setClaimSuccess({
          tag: tagToClaim,
          txHash,
          blockNumber: Number(receipt.blockNumber),
        });
        await handleSearchTag();
        await refreshAccountData(account);
      } else {
        alert('Claim transaction reverted on-chain.');
      }
    } catch (err) {
      console.error(err);
      alert(`Claim failed: ${err.message}`);
    } finally {
      setIsClaiming(false);
    }
  };

  // Check Tag Activation Status
  const handleCheckActivation = async (tag) => {
    if (!tag) return;
    try {
      const node = await publicClient.readContract({
        address: MAINNET.registry,
        abi: REGISTRY_ABI,
        functionName: 'namehash',
        args: [tag],
      });
      const [validity, activationRecord, owner] = await Promise.all([
        publicClient.readContract({
          address: MAINNET.activation,
          abi: ACTIVATION_ABI,
          functionName: 'checkValidity',
          args: [node],
        }),
        publicClient.readContract({
          address: MAINNET.activation,
          abi: ACTIVATION_ABI,
          functionName: 'getActivation',
          args: [node],
        }),
        publicClient.readContract({
          address: MAINNET.registry,
          abi: REGISTRY_ABI,
          functionName: 'owner',
          args: [node],
        }),
      ]);

      setActivationStatus({
        tag,
        node,
        validity: Number(validity),
        statusInfo: VALIDITY_STATUS_MAP[validity] || { label: 'UNKNOWN', color: 'slate' },
        holder: activationRecord.holder,
        isActive: activationRecord.isActive,
        owner,
      });
    } catch (err) {
      console.error(err);
    }
  };

  // On-Chain Activate Tag
  const handleActivateTag = async () => {
    if (!account) {
      await connectWallet();
      return;
    }
    if (!hasAgentId) {
      alert('Wallet does not hold an official SPACE ID Agent ID token on BSC Mainnet.');
      return;
    }
    setIsActivating(true);
    setActivationSuccess(null);
    try {
      const walletClient = createWalletClient({
        account,
        chain: bsc,
        transport: custom(window.ethereum),
      });

      const txHash = await walletClient.writeContract({
        address: MAINNET.activation,
        abi: ACTIVATION_ABI,
        functionName: 'activateWithTag',
        args: [activationTagInput],
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status === 'success') {
        confetti({ particleCount: 120, spread: 80, origin: { y: 0.5 } });
        setActivationSuccess({
          tag: activationTagInput,
          txHash,
          blockNumber: Number(receipt.blockNumber),
        });
        await handleCheckActivation(activationTagInput);
        await loadProtocolStats();
      }
    } catch (err) {
      alert(`Activation failed: ${err.message}`);
    } finally {
      setIsActivating(false);
    }
  };

  // Resolve Recipient Tag for Payment
  const handleResolvePayRecipient = async () => {
    if (!payRecipientTag.trim()) return;
    setIsResolvingPay(true);
    setResolvedPayAddress(null);
    try {
      const addr = await publicClient.readContract({
        address: MAINNET.registry,
        abi: REGISTRY_ABI,
        functionName: 'resolve',
        args: [payRecipientTag],
      });
      if (addr && addr !== '0x0000000000000000000000000000000000000000') {
        setResolvedPayAddress(addr);
      } else {
        alert(`Tag "${payRecipientTag}" is not registered on BSC Mainnet.`);
      }
    } catch (err) {
      alert(`Failed to resolve tag: ${err.message}`);
    } finally {
      setIsResolvingPay(false);
    }
  };

  // Send Direct BNB Payment
  const handleSendPayment = async (e) => {
    e.preventDefault();
    if (!account) {
      await connectWallet();
      return;
    }
    if (!resolvedPayAddress) {
      alert('Please resolve recipient tag first.');
      return;
    }
    if (!payAmount || parseFloat(payAmount) <= 0) {
      alert('Enter a valid payment amount.');
      return;
    }

    setIsPaying(true);
    setPayTxHash(null);
    try {
      const walletClient = createWalletClient({
        account,
        chain: bsc,
        transport: custom(window.ethereum),
      });

      const hash = await walletClient.sendTransaction({
        to: resolvedPayAddress,
        value: parseEther(payAmount),
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === 'success') {
        confetti({ particleCount: 80, spread: 60 });
        setPayTxHash(hash);
        setPayAmount('');
        await refreshAccountData(account);
      }
    } catch (err) {
      alert(`Payment failed: ${err.message}`);
    } finally {
      setIsPaying(false);
    }
  };

  // Query Live Binance Skills
  const queryBinanceTicker = async (symbol) => {
    setIsQueryingSkill(true);
    try {
      const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
      const data = await res.json();
      setTickerData(data);
    } catch (err) {
      alert(`Ticker fetch failed: ${err.message}`);
    } finally {
      setIsQueryingSkill(false);
    }
  };

  const queryTokenSecurity = async (tokenAddr) => {
    if (!tokenAddr || !/^0x[0-9a-fA-F]{40}$/.test(tokenAddr)) {
      alert('Invalid BEP-20 token address.');
      return;
    }
    setIsQueryingSkill(true);
    try {
      const bytecode = await publicClient.getBytecode({ address: tokenAddr });
      setSecurityData({
        address: tokenAddr,
        isContract: bytecode && bytecode !== '0x',
        bytecodeSize: bytecode ? (bytecode.length - 2) / 2 : 0,
        network: 'bsc-mainnet',
        chainId: 56,
        checkedAt: new Date().toLocaleTimeString(),
      });
    } catch (err) {
      alert(`Security check failed: ${err.message}`);
    } finally {
      setIsQueryingSkill(false);
    }
  };

  const queryDeFiLlamaTvl = async () => {
    setIsQueryingSkill(true);
    try {
      const [bscTvl, pancake] = await Promise.all([
        fetch('https://api.llama.fi/v2/chains').then((r) => r.json()),
        fetch('https://api.llama.fi/protocol/pancakeswap').then((r) => r.json()),
      ]);
      const bscChain = bscTvl.find((c) => c.name.toLowerCase() === 'binance');
      setDefillamaData({
        bscTvl: bscChain ? `$${(bscChain.tvl / 1e9).toFixed(2)}B` : 'N/A',
        pancakeTvl: pancake.tvl ? `$${(pancake.tvl.slice(-1)[0].totalLiquidityUSD / 1e9).toFixed(2)}B` : 'N/A',
        timestamp: new Date().toLocaleTimeString(),
      });
    } catch (err) {
      alert(`DeFiLlama query failed: ${err.message}`);
    } finally {
      setIsQueryingSkill(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090a0f] text-slate-100 flex flex-col font-sans selection:bg-[#F0B90B] selection:text-black">
      {/* Top Header */}
      <header className="sticky top-0 z-50 glass-panel border-b border-white/10 px-4 lg:px-8 py-3.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#059669] to-[#F0B90B] flex items-center justify-center font-black text-xl text-black shadow-lg shadow-[#F0B90B]/20">
              ₦
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-tight text-white">NairaTag</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F0B90B]/10 text-[#F0B90B] border border-[#F0B90B]/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#F0B90B] animate-pulse"></span>
                  BNB CHAIN
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Sovereign Tags & AI Agent Identity</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {account && hasAgentId && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <Award size={14} />
                <span>Agent ID Verified ({agentIdCount})</span>
              </div>
            )}

            {account ? (
              <div className="flex items-center gap-2 bg-slate-900/80 border border-white/10 rounded-xl px-3 py-1.5 text-xs">
                <span className="text-[#F0B90B] font-bold">{parseFloat(balance).toFixed(4)} BNB</span>
                <span className="text-slate-500">|</span>
                <span className="font-mono text-slate-300">
                  {account.slice(0, 6)}...{account.slice(-4)}
                </span>
              </div>
            ) : (
              <button
                onClick={connectWallet}
                disabled={isConnecting}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-[#F0B90B] hover:bg-[#FCD535] text-black shadow-lg shadow-[#F0B90B]/20 transition-all cursor-pointer"
              >
                <Wallet size={15} />
                <span>{isConnecting ? 'Connecting...' : 'Connect Wallet'}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-white/5 border border-white/10 text-slate-300 mb-4">
            <Sparkles size={14} className="text-[#F0B90B]" />
            <span>Live on BNB Smart Chain Mainnet (Chain ID 56)</span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white mb-3">
            Replace 42-Char Hex with <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#059669] via-[#F0B90B] to-[#FCD535]">₦Tags</span>
          </h1>
          <p className="text-slate-400 text-sm sm:text-base max-w-2xl mx-auto">
            Pure on-chain identity for users and autonomous agents on BNB Chain. Bound directly to official SPACE ID Agent IDs and native BNB settlement.
          </p>

          {/* Live Milestone Counter */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs">
            <div className="glass-card px-4 py-2 rounded-xl flex items-center gap-2">
              <Award className="text-[#F0B90B]" size={16} />
              <span className="text-slate-400">Verified Agent ID Holders:</span>
              <span className="font-bold text-white text-sm">{uniqueHoldersCount} / 30 Target</span>
            </div>
            <div className="glass-card px-4 py-2 rounded-xl flex items-center gap-2">
              <Layers className="text-emerald-400" size={16} />
              <span className="text-slate-400">Active Tag Activations:</span>
              <span className="font-bold text-white text-sm">{activeActivationsCount}</span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center justify-center mb-8">
          <div className="glass-panel p-1.5 rounded-2xl flex items-center gap-1 border border-white/10 max-w-md w-full">
            <button
              onClick={() => setActiveTab('claim')}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                activeTab === 'claim' ? 'bg-[#F0B90B] text-black shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              Claim Tag
            </button>
            <button
              onClick={() => setActiveTab('activation')}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                activeTab === 'activation' ? 'bg-[#F0B90B] text-black shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              Agent ID Onboard
            </button>
            <button
              onClick={() => setActiveTab('pay')}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                activeTab === 'pay' ? 'bg-[#F0B90B] text-black shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              Send BNB
            </button>
            <button
              onClick={() => setActiveTab('agent')}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                activeTab === 'agent' ? 'bg-[#F0B90B] text-black shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              Skills Hub
            </button>
          </div>
        </div>

        {/* TAB 1: Claim Tag */}
        {activeTab === 'claim' && (
          <div className="max-w-xl mx-auto glass-panel p-6 sm:p-8 rounded-3xl border border-white/10 glow-bnb">
            <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <span>Find & Claim Your Sovereign Tag</span>
            </h2>
            <p className="text-xs text-slate-400 mb-6">
              NTS-100 normalization automatically strips leading '₦' or '@' and lowercase letters. 1 tag per wallet rule enforced.
            </p>

            <form onSubmit={handleSearchTag} className="flex items-center gap-2 mb-6">
              <div className="relative flex-1">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-[#F0B90B] text-base">
                  ₦
                </span>
                <input
                  type="text"
                  placeholder="e.g. bloom, micheal, nairatag"
                  value={searchTag}
                  onChange={(e) => setSearchTag(e.target.value)}
                  className="w-full bg-slate-900/90 border border-white/15 rounded-xl pl-9 pr-4 py-3 text-sm font-semibold focus:outline-none focus:border-[#F0B90B] transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={isSearching}
                className="px-5 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center gap-2 transition-all cursor-pointer"
              >
                <Search size={15} />
                <span>{isSearching ? 'Checking...' : 'Check'}</span>
              </button>
            </form>

            {/* Search Result Card */}
            {searchResult && (
              <div className="glass-card p-5 rounded-2xl border border-white/10 mb-4 animate-in fade-in duration-200">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-lg font-extrabold text-[#F0B90B]">₦{searchResult.canonical}</span>
                    <p className="text-[10px] font-mono text-slate-500">{searchResult.node.slice(0, 16)}...</p>
                  </div>
                  <div>
                    {searchResult.isClaimed ? (
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                        Claimed
                      </span>
                    ) : (
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Available
                      </span>
                    )}
                  </div>
                </div>

                {searchResult.isClaimed ? (
                  <div className="space-y-1 text-xs text-slate-400 border-t border-white/5 pt-3">
                    <p>Owner: <span className="font-mono text-slate-300">{searchResult.owner}</span></p>
                    <p>Resolved: <span className="font-mono text-slate-300">{searchResult.resolvedAddress}</span></p>
                  </div>
                ) : (
                  <div className="border-t border-white/5 pt-3">
                    <button
                      onClick={() => handleClaimTag(searchResult.raw)}
                      disabled={isClaiming}
                      className="w-full py-3 rounded-xl bg-[#059669] hover:bg-[#047857] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-[#059669]/20 transition-all cursor-pointer"
                    >
                      <Sparkles size={16} />
                      <span>{isClaiming ? 'Claiming on Mainnet...' : `Claim ₦${searchResult.canonical}`}</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {claimSuccess && (
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
                <p className="font-bold mb-1 flex items-center gap-1.5">
                  <CheckCircle2 size={16} />
                  <span>Tag Successfully Claimed!</span>
                </p>
                <p className="text-[11px] text-emerald-400/80 mb-2">
                  ₦{claimSuccess.tag} is now permanently claimed on BNB Smart Chain Mainnet.
                </p>
                <a
                  href={`https://bscscan.com/tx/${claimSuccess.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-semibold underline text-emerald-300 hover:text-white"
                >
                  <span>View on BscScan</span>
                  <ExternalLink size={12} />
                </a>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Agent ID Activation */}
        {activeTab === 'activation' && (
          <div className="max-w-xl mx-auto glass-panel p-6 sm:p-8 rounded-3xl border border-white/10 glow-bnb">
            <div className="flex items-center gap-2 mb-2">
              <Award className="text-[#F0B90B]" size={24} />
              <h2 className="text-xl font-bold text-white">Binance Agent ID Activation (HACK-01)</h2>
            </div>
            <p className="text-xs text-slate-400 mb-6">
              Connect your wallet holding an official SPACE ID Agent ID (<code className="text-slate-300">0x60b9...022f</code>) and bind your sovereign tag on-chain.
            </p>

            {/* Holder Status Banner */}
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400">Connected Wallet Agent ID Status:</span>
                {hasAgentId ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                    <CheckCircle2 size={12} />
                    Verified Holder ({agentIdCount})
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                    <AlertCircle size={12} />
                    No Agent ID Found
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                {hasAgentId
                  ? 'Your wallet owns the official BEP-721 credential and is eligible to activate sovereign tags.'
                  : 'Holding an official Agent ID is required to register an activated identity event.'}
              </p>
            </div>

            {/* Activation Form */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Tag to Activate</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-[#F0B90B] text-sm">
                    ₦
                  </span>
                  <input
                    type="text"
                    placeholder="Enter your claimed tag name"
                    value={activationTagInput}
                    onChange={(e) => {
                      setActivationTagInput(e.target.value);
                      handleCheckActivation(e.target.value);
                    }}
                    className="w-full bg-slate-900/90 border border-white/15 rounded-xl pl-9 pr-4 py-3 text-sm font-semibold focus:outline-none focus:border-[#F0B90B]"
                  />
                </div>
              </div>

              {activationStatus && (
                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-white/5 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">On-Chain Status:</span>
                    <span className="font-bold text-[#F0B90B]">{activationStatus.statusInfo.label}</span>
                  </div>
                  <p className="text-[11px] text-slate-500">{activationStatus.statusInfo.description}</p>
                </div>
              )}

              <button
                onClick={handleActivateTag}
                disabled={isActivating || !hasAgentId || !activationTagInput}
                className="w-full py-3.5 rounded-xl bg-[#F0B90B] hover:bg-[#FCD535] text-black font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-[#F0B90B]/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ShieldCheck size={16} />
                <span>{isActivating ? 'Broadcasting Activation...' : 'Activate Tag On-Chain'}</span>
              </button>
            </div>

            {activationSuccess && (
              <div className="mt-4 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
                <p className="font-bold mb-1 flex items-center gap-1.5">
                  <CheckCircle2 size={16} />
                  <span>Activation Confirmed On-Chain!</span>
                </p>
                <p className="text-[11px] text-emerald-400/80 mb-2">
                  ₦{activationSuccess.tag} is now active and counted towards the hackathon milestone.
                </p>
                <a
                  href={`https://bscscan.com/tx/${activationSuccess.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-semibold underline text-emerald-300 hover:text-white"
                >
                  <span>View on BscScan</span>
                  <ExternalLink size={12} />
                </a>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Send BNB */}
        {activeTab === 'pay' && (
          <div className="max-w-xl mx-auto glass-panel p-6 sm:p-8 rounded-3xl border border-white/10 glow-bnb">
            <h2 className="text-xl font-bold text-white mb-2">Send BNB to a Tag</h2>
            <p className="text-xs text-slate-400 mb-6">
              Instant sub-second settlement directly to human tags with automatic on-chain resolution.
            </p>

            <form onSubmit={handleSendPayment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Recipient Tag</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-[#F0B90B] text-sm">
                      ₦
                    </span>
                    <input
                      type="text"
                      placeholder="e.g. nairatag, bloom"
                      value={payRecipientTag}
                      onChange={(e) => {
                        setPayRecipientTag(e.target.value);
                        setResolvedPayAddress(null);
                      }}
                      className="w-full bg-slate-900/90 border border-white/15 rounded-xl pl-9 pr-4 py-3 text-sm font-semibold focus:outline-none focus:border-[#F0B90B]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleResolvePayRecipient}
                    disabled={isResolvingPay}
                    className="px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs cursor-pointer"
                  >
                    {isResolvingPay ? 'Resolving...' : 'Resolve'}
                  </button>
                </div>
                {resolvedPayAddress && (
                  <p className="text-[11px] text-emerald-400 mt-1.5 flex items-center gap-1 font-mono">
                    <CheckCircle2 size={12} />
                    <span>Resolves to: {resolvedPayAddress}</span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Amount (BNB)</label>
                <input
                  type="number"
                  step="0.0001"
                  placeholder="0.001"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full bg-slate-900/90 border border-white/15 rounded-xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-[#F0B90B]"
                />
              </div>

              <button
                type="submit"
                disabled={isPaying || !resolvedPayAddress || !payAmount}
                className="w-full py-3.5 rounded-xl bg-[#F0B90B] hover:bg-[#FCD535] text-black font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-[#F0B90B]/20 transition-all cursor-pointer disabled:opacity-50"
              >
                <Send size={15} />
                <span>{isPaying ? 'Broadcasting Payment...' : `Send ${payAmount || '0'} BNB`}</span>
              </button>
            </form>

            {payTxHash && (
              <div className="mt-4 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
                <p className="font-bold mb-1">Payment Sent!</p>
                <a
                  href={`https://bscscan.com/tx/${payTxHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-semibold underline text-emerald-300 hover:text-white"
                >
                  <span>View transaction on BscScan</span>
                  <ExternalLink size={12} />
                </a>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: Skills Hub */}
        {activeTab === 'agent' && (
          <div className="max-w-2xl mx-auto glass-panel p-6 sm:p-8 rounded-3xl border border-white/10 glow-bnb">
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="text-[#F0B90B]" size={24} />
              <h2 className="text-xl font-bold text-white">Binance Skills & Telemetry Hub</h2>
            </div>
            <p className="text-xs text-slate-400 mb-6">
              Live oracle data and cryptographic security tools powered by ₦NAIRATAG orchestrator skills.
            </p>

            {/* Sub-Tabs */}
            <div className="flex items-center gap-2 mb-6 border-b border-white/10 pb-3">
              <button
                onClick={() => {
                  setSkillTab('ticker');
                  queryBinanceTicker(tickerSymbol);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                  skillTab === 'ticker' ? 'bg-[#F0B90B]/20 text-[#F0B90B] border border-[#F0B90B]/40' : 'text-slate-400'
                }`}
              >
                Market Ticker
              </button>
              <button
                onClick={() => setSkillTab('security')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                  skillTab === 'security' ? 'bg-[#F0B90B]/20 text-[#F0B90B] border border-[#F0B90B]/40' : 'text-slate-400'
                }`}
              >
                Token Security Audit
              </button>
              <button
                onClick={() => {
                  setSkillTab('defillama');
                  queryDeFiLlamaTvl();
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                  skillTab === 'defillama' ? 'bg-[#F0B90B]/20 text-[#F0B90B] border border-[#F0B90B]/40' : 'text-slate-400'
                }`}
              >
                DeFi TVL Feed
              </button>
            </div>

            {/* Skill 1: Ticker */}
            {skillTab === 'ticker' && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <select
                    value={tickerSymbol}
                    onChange={(e) => {
                      setTickerSymbol(e.target.value);
                      queryBinanceTicker(e.target.value);
                    }}
                    className="bg-slate-900 border border-white/15 rounded-xl px-4 py-2 text-xs font-semibold focus:outline-none"
                  >
                    <option value="BNBUSDT">BNB / USDT</option>
                    <option value="BTCUSDT">BTC / USDT</option>
                    <option value="ETHUSDT">ETH / USDT</option>
                    <option value="SOLUSDT">SOL / USDT</option>
                  </select>
                  <button
                    onClick={() => queryBinanceTicker(tickerSymbol)}
                    disabled={isQueryingSkill}
                    className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw size={14} className={isQueryingSkill ? 'animate-spin' : ''} />
                    <span>Refresh</span>
                  </button>
                </div>

                {tickerData && (
                  <div className="glass-card p-5 rounded-2xl border border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                    <div>
                      <p className="text-slate-500 mb-0.5">Last Price</p>
                      <p className="text-base font-extrabold text-white">${parseFloat(tickerData.lastPrice).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 mb-0.5">24h Change</p>
                      <p className={`text-base font-extrabold ${parseFloat(tickerData.priceChangePercent) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {parseFloat(tickerData.priceChangePercent).toFixed(2)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500 mb-0.5">24h High</p>
                      <p className="text-base font-extrabold text-slate-300">${parseFloat(tickerData.highPrice).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 mb-0.5">24h Volume</p>
                      <p className="text-base font-extrabold text-slate-300">{(parseFloat(tickerData.volume) / 1000).toFixed(1)}k</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Skill 2: Token Security */}
            {skillTab === 'security' && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter BEP-20 Contract Address (0x...)"
                    value={securityTokenAddress}
                    onChange={(e) => setSecurityTokenAddress(e.target.value)}
                    className="flex-1 bg-slate-900 border border-white/15 rounded-xl px-4 py-2.5 text-xs font-mono focus:outline-none"
                  />
                  <button
                    onClick={() => queryTokenSecurity(securityTokenAddress)}
                    disabled={isQueryingSkill}
                    className="px-4 py-2.5 rounded-xl bg-[#F0B90B] text-black font-bold text-xs cursor-pointer"
                  >
                    Audit
                  </button>
                </div>

                {securityData && (
                  <div className="glass-card p-5 rounded-2xl border border-white/10 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Bytecode Existence:</span>
                      <span className={`font-bold ${securityData.isContract ? 'text-emerald-400' : 'text-red-400'}`}>
                        {securityData.isContract ? `Active (${securityData.bytecodeSize} bytes)` : 'No Bytecode (EOA)'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Target Network:</span>
                      <span className="font-bold text-slate-200">BNB Smart Chain (56)</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Audit Timestamp:</span>
                      <span className="font-mono text-slate-400">{securityData.checkedAt}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Skill 3: DeFiLlama */}
            {skillTab === 'defillama' && (
              <div className="space-y-4">
                {defillamaData ? (
                  <div className="glass-card p-5 rounded-2xl border border-white/10 grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <p className="text-slate-500 mb-0.5">BSC Total TVL</p>
                      <p className="text-xl font-black text-[#F0B90B]">{defillamaData.bscTvl}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 mb-0.5">PancakeSwap TVL</p>
                      <p className="text-xl font-black text-emerald-400">{defillamaData.pancakeTvl}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Querying live TVL metrics...</p>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="glass-panel border-t border-white/10 py-6 px-4 text-xs text-slate-500">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-400">NairaTag on BNB Chain</span>
            <span>•</span>
            <span className="font-mono text-[10px]">Registry: 0x6d39...39f9</span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-[11px]">
            <a
              href="https://bscscan.com/address/0x6d3950a390c7f60287d545cc5785c594e07439f9#code"
              target="_blank"
              rel="noreferrer"
              className="hover:text-white transition-colors"
            >
              Registry BscScan
            </a>
            <a
              href="https://bscscan.com/address/0x0fcdf115e1cff7b85835cd8ccdc0a66c8c9a95f7#code"
              target="_blank"
              rel="noreferrer"
              className="hover:text-white transition-colors"
            >
              Activation BscScan
            </a>
            <a
              href="https://arc.nairatag.ng"
              target="_blank"
              rel="noreferrer"
              className="text-[#F0B90B] hover:underline"
            >
              Arc Version
            </a>
            <a
              href="https://celotags.xyz"
              target="_blank"
              rel="noreferrer"
              className="text-emerald-400 hover:underline"
            >
              Celo Version
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
