export const RISK_RULES = {
  attentionOverdueCount: 2,
  highRiskOverdueCount: 5,
  highRiskDueRate: 0.7,
} as const;

export type RiskRules = typeof RISK_RULES;
export type RiskRuleKey = keyof RiskRules;
export type RiskRuleValue = RiskRules[RiskRuleKey];
