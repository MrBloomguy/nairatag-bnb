/**
 * Binance Skills Hub: Token Contract Telemetry & Interface Inspection
 * ====================================================================
 * Inspects on-chain smart contract bytecode, standard ERC-20 interfaces,
 * and public ownership records on BNB Chain.
 *
 * READ-ONLY skill — requires NO user financial consent.
 *
 * GOVERNANCE & REPORTING HONESTY (Phase 3 Remediation):
 * - Does NOT claim to be a comprehensive security audit.
 * - Removed unsupported numerical scores (e.g. fake "99/100") and hardcoded safety claims.
 * - Clearly distinguishes verified on-chain findings, unavailable checks, and heuristic warnings.
 * - Never claims a token is safe simply because no anomaly was detected.
 */

import { z } from "zod";
import {
  createPublicClient,
  formatUnits,
  getAddress,
  http,
  isAddress,
  type PublicClient,
} from "viem";
import { bsc, bscTestnet } from "viem/chains";
import { SkillDefinition, SkillExecutionContext, SkillExecutionResult } from "./types.js";

export interface VerifiedOnChainFindings {
  address: string;
  chainId: number;
  isContract: boolean;
  bytecodeSizeBytes: number;
  implementsStandardERC20: boolean;
  tokenName: string | null;
  tokenSymbol: string | null;
  decimals: number | null;
  totalSupplyFormatted: string | null;
  contractOwner: string | null;
  hasIdentifiedOwner: boolean;
}

export interface TokenSecurityTelemetry {
  tokenAddress: string;
  chainId: number;
  verifiedOnChainFindings: VerifiedOnChainFindings;
  heuristicWarnings: string[];
  unavailableChecks: string[];
  assessment:
    | "STANDARD_TOKEN_INTERFACE_VERIFIED"
    | "INCOMPLETE_OR_NON_STANDARD_INTERFACE"
    | "NOT_A_CONTRACT";
  disclaimer: string;
}

export const BinanceTokenSecurityInputSchema = z.object({
  tokenAddress: z
    .string()
    .trim()
    .refine((val) => isAddress(val, { strict: false }), {
      message: "Invalid token address: must be a valid 42-character EVM address (0x...)",
    })
    .describe("BEP-20 token contract address on BSC to inspect"),
  chainId: z.number().int().default(56).optional().describe("Chain ID (56 for BSC Mainnet, 97 for BSC Testnet)"),
});

export type BinanceTokenSecurityInput = z.infer<typeof BinanceTokenSecurityInputSchema>;

const ERC20_METADATA_ABI = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

export const binanceTokenSecuritySkill: SkillDefinition<BinanceTokenSecurityInput, TokenSecurityTelemetry> = {
  id: "binance.token.security",
  name: "Binance Token Contract Telemetry & Interface Inspection",
  description:
    "Performs live on-chain inspection of BEP-20 smart contract bytecode, standard metadata interfaces (name, symbol, decimals, totalSupply), and ownership controls on BNB Chain.",
  category: "security",
  accessLevel: "read_only",
  requiresUserConsent: false,
  inputSchema: BinanceTokenSecurityInputSchema,

  handler: async (
    params: BinanceTokenSecurityInput,
    context: SkillExecutionContext
  ): Promise<SkillExecutionResult<TokenSecurityTelemetry>> => {
    const startTime = Date.now();
    const tokenAddr = getAddress(params.tokenAddress);
    const chainId = params.chainId ?? 56;

    // Check test seam
    if (context.testSeam?.securityResponse) {
      return {
        success: true,
        skillId: "binance.token.security",
        data: context.testSeam.securityResponse,
        classification: "SIMULATED",
        metadata: {
          source: "Binance Security Test Seam",
          timestamp: new Date().toISOString(),
          latencyMs: Date.now() - startTime,
        },
      };
    }

    try {
      const targetChain = chainId === 97 ? bscTestnet : bsc;
      const targetRpc =
        chainId === 97
          ? "https://data-seed-prebsc-1-s1.binance.org:8545"
          : "https://bsc-dataseed.binance.org";

      const client = (context.testSeam?.client as PublicClient) ?? createPublicClient({
        chain: targetChain,
        transport: http(targetRpc),
      });

      // 1. Verifiable Bytecode Existence Check
      const bytecode = await client.getBytecode({ address: tokenAddr });
      const bytecodeLength = bytecode && bytecode !== "0x" ? (bytecode.length - 2) / 2 : 0;

      const heuristicWarnings: string[] = [];
      const unavailableChecks = [
        "honeypot_dynamic_sell_simulation",
        "dex_liquidity_depth_and_pair_creation",
        "custom_fee_router_tax_logic",
        "proxy_implementation_storage_slots",
        "bytecode_decompilation_vulnerability_scan",
      ];

      if (bytecodeLength === 0) {
        heuristicWarnings.push("Address has no runtime bytecode on-chain. It is an EOA, not a smart contract.");
        const telemetry: TokenSecurityTelemetry = {
          tokenAddress: tokenAddr,
          chainId,
          verifiedOnChainFindings: {
            address: tokenAddr,
            chainId,
            isContract: false,
            bytecodeSizeBytes: 0,
            implementsStandardERC20: false,
            tokenName: null,
            tokenSymbol: null,
            decimals: null,
            totalSupplyFormatted: null,
            contractOwner: null,
            hasIdentifiedOwner: false,
          },
          heuristicWarnings,
          unavailableChecks,
          assessment: "NOT_A_CONTRACT",
          disclaimer:
            "Live on-chain telemetry. The target address is not a contract. This does not constitute an audit.",
        };

        return {
          success: true,
          skillId: "binance.token.security",
          data: telemetry,
          classification: "LIVE",
          metadata: {
            source: "Binance On-Chain RPC Telemetry",
            timestamp: new Date().toISOString(),
            latencyMs: Date.now() - startTime,
          },
        };
      }

      // 2. Standard ERC-20 Interface Probing
      let tokenName: string | null = null;
      let tokenSymbol: string | null = null;
      let decimals: number | null = null;
      let totalSupply: bigint | null = null;
      let contractOwner: string | null = null;

      try {
        tokenName = (await client.readContract({
          address: tokenAddr,
          abi: ERC20_METADATA_ABI,
          functionName: "name",
        })) as string;
      } catch {
        heuristicWarnings.push("Contract does not implement standard name() view function");
      }

      try {
        tokenSymbol = (await client.readContract({
          address: tokenAddr,
          abi: ERC20_METADATA_ABI,
          functionName: "symbol",
        })) as string;
      } catch {
        heuristicWarnings.push("Contract does not implement standard symbol() view function");
      }

      try {
        decimals = (await client.readContract({
          address: tokenAddr,
          abi: ERC20_METADATA_ABI,
          functionName: "decimals",
        })) as number;
      } catch {
        heuristicWarnings.push("Contract does not implement standard decimals() view function");
      }

      try {
        totalSupply = (await client.readContract({
          address: tokenAddr,
          abi: ERC20_METADATA_ABI,
          functionName: "totalSupply",
        })) as bigint;
      } catch {
        heuristicWarnings.push("Contract does not implement standard totalSupply() view function");
      }

      try {
        contractOwner = (await client.readContract({
          address: tokenAddr,
          abi: ERC20_METADATA_ABI,
          functionName: "owner",
        })) as string;
      } catch {
        // Contract does not expose owner() or is not Ownable
      }

      const implementsStandardERC20 = Boolean(tokenSymbol && decimals !== null && totalSupply !== null);

      let totalSupplyFormatted: string | null = null;
      if (totalSupply !== null && decimals !== null) {
        try {
          totalSupplyFormatted = formatUnits(totalSupply, decimals);
        } catch {
          totalSupplyFormatted = totalSupply.toString();
        }
      }

      const telemetry: TokenSecurityTelemetry = {
        tokenAddress: tokenAddr,
        chainId,
        verifiedOnChainFindings: {
          address: tokenAddr,
          chainId,
          isContract: true,
          bytecodeSizeBytes: bytecodeLength,
          implementsStandardERC20,
          tokenName,
          tokenSymbol,
          decimals,
          totalSupplyFormatted,
          contractOwner: contractOwner ? getAddress(contractOwner) : null,
          hasIdentifiedOwner: Boolean(contractOwner),
        },
        heuristicWarnings,
        unavailableChecks,
        assessment: implementsStandardERC20
          ? "STANDARD_TOKEN_INTERFACE_VERIFIED"
          : "INCOMPLETE_OR_NON_STANDARD_INTERFACE",
        disclaimer:
          "Live on-chain contract telemetry. This inspection verifies bytecode existence, standard ERC-20 read interfaces, and public ownership records. It does NOT constitute a formal smart contract security audit, economic safety guarantee, or vulnerability audit.",
      };

      return {
        success: true,
        skillId: "binance.token.security",
        data: telemetry,
        classification: "LIVE",
        metadata: {
          source: "Binance On-Chain RPC Telemetry",
          timestamp: new Date().toISOString(),
          latencyMs: Date.now() - startTime,
        },
      };
    } catch (err: any) {
      return {
        success: false,
        skillId: "binance.token.security",
        classification: "LIVE",
        metadata: {
          source: "Binance On-Chain RPC Telemetry",
          timestamp: new Date().toISOString(),
          latencyMs: Date.now() - startTime,
        },
        error: {
          code: "INSPECTION_FAILED",
          message: `On-chain token inspection failed: ${err.message || String(err)}`,
        },
      };
    }
  },
};
