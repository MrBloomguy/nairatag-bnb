# NairaTag BNB project instructions

- BNB Agent Studio is mandatory for all agent runtime and seller-agent implementation in this hackathon. Read and follow https://docs.bnbchain.org/developer-kit/bnbchain-studio/quickstart/ before building that layer; use its Studio CLI and guided skill workflow. Keep Solidity registry/resolver work in Foundry.
- Preserve the boundary: identity is not authority. Agent ID ownership or a NairaTag must never grant unrestricted permissions or transfers.
- Keep Agent ID contract addresses configurable and verify bytecode on the target network before enabling an integration. The supplied mainnet address is not deployed at the same address on BNB Testnet as of initial setup.
- Use environment variables for credentials. Never commit private keys or runtime secrets.
- Do not deploy contracts or agent runtimes as part of repo setup. Deployment is a later, explicit stage.