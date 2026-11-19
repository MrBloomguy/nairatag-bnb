# NairaTag on BNB Chain

NairaTag is open identity and AI agent infrastructure: **Your tag is your agent.**
This repository is the BNB Chain development track, kept independent from the
existing `nairatag-protocol` repository.

The first stage carries the chain-neutral tag registry and resolver to BNB Smart
Chain Testnet. A NairaTag identity identifies an account; by itself it grants no
agent execution rights, contract permissions, or payment authority. Agent
ownership, runtime, permissions, payment capabilities, reputation, and discovery
remain separate concerns.

## Included in this stage

- `NairaTagRegistry`: tag normalization, ownership, uniqueness, primary tag,
  and resolver pointer.
- `NairaTagResolver`: forward and reverse resolution, multi-coin addresses,
  text metadata, and payment endpoint metadata.
- Foundry deployment script guarded to BNB Testnet (chain ID 97).
- Unit tests for registry and resolver behavior and account restrictions.

No contract is deployed by this repository setup. Agent ID verification and
Mother Agent runtime are intentionally not implemented in this stage.

## Network

| Setting | Value |
| --- | --- |
| Network | BNB Smart Chain Testnet |
| Chain ID | `97` |
| Currency | `tBNB` |
| RPC | `https://bsc-testnet-dataseed.bnbchain.org` |
| Explorer | `https://testnet.bscscan.com` |

The supplied Agent ID address (`0x60b9262456de011f7d15a54cdd8c48baaa8b022f`)
has code on BNB mainnet (chain ID 56) and no code at that address on BNB
Testnet (chain ID 97), as checked during setup. The future integration must
use a verified network deployment or an explicitly configured address; this
repository does not assume the mainnet address exists on testnet.

## Requirements and setup

Install [Foundry](https://book.getfoundry.sh/getting-started/installation), then:

```sh
git clone https://github.com/MrBloomguy/nairatag-bnb.git
cd nairatag-bnb
forge test
```

Copy `.env.example` to `.env` and set a testnet-only deployer key. Keep `.env`
private; it is ignored by Git. The RPC endpoint is public and can be overridden
with `BSC_TESTNET_RPC_URL`.

Build and prepare a testnet deployment (not performed as part of this stage):

```sh
forge build
source .env
forge script script/DeployNairaTag.s.sol:DeployNairaTag \
  --rpc-url bsc_testnet --broadcast
```

The deployment script checks `block.chainid == 97` before broadcasting and
requires `PRIVATE_KEY` from the environment. Review and verify source on
BscScan after any later deployment.

## Architecture boundaries

- **NairaTag identity** maps a normalized tag to an owner.
- **Agent ID verification** is an external credential check and is not part of
  this initial release.
- **Ownership is not authority:** a tag or Agent ID does not grant unrestricted
  contract permissions.
- **Agent execution, permissions, wallets, and reputation** need explicit,
  separately designed interfaces and policies.

Only the registry, resolver, and their minimal interfaces were carried over.
Chain-specific payment, escrow, and Celo deployment code is excluded.
