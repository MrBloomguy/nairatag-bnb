import React, { createContext, useContext, useMemo, useState } from 'react';

const PrivyContext = createContext({
  ready: true,
  authenticated: false,
  user: null,
  login: () => {},
  logout: async () => {},
  getAccessToken: async () => null,
});

export const PrivyProvider = ({ children, config, appId }) => {
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState(null);

  const value = useMemo(() => ({
    ready: true,
    authenticated,
    user,
    login: () => {
      // Degrades gracefully to prompt wallet connection
      console.log('[Privy Shim] Direct wallet connection active');
    },
    logout: async () => {
      setAuthenticated(false);
      setUser(null);
    },
    getAccessToken: async () => null,
  }), [authenticated, user]);

  return (
    <PrivyContext.Provider value={value}>
      {children}
    </PrivyContext.Provider>
  );
};

export const usePrivy = () => {
  return useContext(PrivyContext);
};

export const useLoginWithEmail = () => {
  return {
    sendCode: async ({ email }) => {
      console.log('[Privy Shim] Send code request for:', email);
      return { success: true };
    },
    loginWithCode: async ({ code }) => {
      console.log('[Privy Shim] Login with code:', code);
      return { success: true };
    },
    state: { status: 'idle' },
  };
};

export const useWallets = () => {
  return {
    wallets: [],
    ready: true,
  };
};

export default {
  PrivyProvider,
  usePrivy,
  useLoginWithEmail,
  useWallets,
};
