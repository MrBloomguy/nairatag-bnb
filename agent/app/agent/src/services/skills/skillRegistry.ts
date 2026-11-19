/**
 * Binance Skills Registry (Phase 3)
 * =================================
 * Provider-neutral catalog and discovery service for Binance Skills Hub
 * and Binance Agentic Wallet capabilities.
 */

import { SkillDefinition, SkillCategory, SkillAccessLevel } from "./types.js";
import { binanceTickerSkill, binanceDepthSkill } from "./binanceMarketSkills.js";
import { binanceTokenSecuritySkill } from "./binanceSecuritySkills.js";
import {
  binanceWalletBalanceSkill,
  binanceWalletTransferSkill,
} from "./binanceWalletSkills.js";

export interface SkillFilter {
  category?: SkillCategory;
  accessLevel?: SkillAccessLevel;
  requiresUserConsent?: boolean;
}

export class SkillRegistry {
  private static instance: SkillRegistry | null = null;
  private skills: Map<string, SkillDefinition<any, any>> = new Map();

  private constructor() {
    // Seed core Binance Skills Hub & Binance Agentic Wallet skills
    this.register(binanceTickerSkill);
    this.register(binanceDepthSkill);
    this.register(binanceTokenSecuritySkill);
    this.register(binanceWalletBalanceSkill);
    this.register(binanceWalletTransferSkill);
  }

  public static getInstance(): SkillRegistry {
    if (!SkillRegistry.instance) {
      SkillRegistry.instance = new SkillRegistry();
    }
    return SkillRegistry.instance;
  }

  public register(skill: SkillDefinition<any, any>): void {
    this.skills.set(skill.id.toLowerCase(), skill);
  }

  public getSkill(id: string): SkillDefinition<any, any> | undefined {
    return this.skills.get(id.toLowerCase());
  }

  public hasSkill(id: string): boolean {
    return this.skills.has(id.toLowerCase());
  }

  public listSkills(filter?: SkillFilter): SkillDefinition<any, any>[] {
    let list = Array.from(this.skills.values());
    if (!filter) return list;

    if (filter.category) {
      list = list.filter((s) => s.category === filter.category);
    }
    if (filter.accessLevel) {
      list = list.filter((s) => s.accessLevel === filter.accessLevel);
    }
    if (typeof filter.requiresUserConsent === "boolean") {
      list = list.filter((s) => s.requiresUserConsent === filter.requiresUserConsent);
    }
    return list;
  }

  public searchSkills(query: string): SkillDefinition<any, any>[] {
    const q = query.trim().toLowerCase();
    if (!q) return this.listSkills();

    return Array.from(this.skills.values()).filter((skill) => {
      return (
        skill.id.toLowerCase().includes(q) ||
        skill.name.toLowerCase().includes(q) ||
        skill.description.toLowerCase().includes(q) ||
        skill.category.toLowerCase().includes(q)
      );
    });
  }
}

export const globalSkillRegistry = SkillRegistry.getInstance();
