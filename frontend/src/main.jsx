import React from 'react';
import { createRoot } from 'react-dom/client';
import { PrivyProvider } from '@privy-io/react-auth';
import { arcMainnet } from './config/arc.js';
import App from './App.jsx';
import './index.css';

const appId = import.meta.env.VITE_PRIVY_APP_ID || 'cm4winhli04jg1tvq07cb8942';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ['email', 'wallet'],
        appearance: { theme: 'dark', accentColor: '#F0B90B', walletChainType: 'ethereum-only' },
        defaultChain: arcMainnet,
        supportedChains: [arcMainnet],
        embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' } },
      }}
    >
      <App />
    </PrivyProvider>
  </React.StrictMode>,
);
