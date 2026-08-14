/**
 * Deduction maths, kept free of database access so it can be reasoned about and
 * tested on its own.
 *
 * Nothing here knows about Kenya specifically. PAYE, NSSF, SHIF and the Housing
 * Levy are all expressed as configured rules, so a Finance Act change is a new
 * rule version rather than a code change.
 */

export type Band = {
  sequence: number;
  lowerBound: number;
  upperBound: number | null;
  rate: number;
  maxAmount: number | null;
};

export type Rule = {
  id?: string;
  code: string;
  name: string;
  kind: 'GRADUATED' | 'PERCENTAGE' | 'TIERED' | 'FIXED';
  basis: 'GROSS' | 'TAXABLE' | 'BASIC';
  rate?: number | null;
  fixedAmount?: number | null;
  reliefAmount?: number | null;
  employerRate?: number | null;
  employerFixed?: number | null;
  reducesTaxable: boolean;
  liabilityAccountCode: string;
  employerExpenseAccountCode?: string | null;
  bands: Band[];
};

export type CalculatedLine = {
  ruleId?: string;
  code: string;
  name: string;
  basisAmount: number;
  amount: number;
  employerAmount: number;
  liabilityAccountCode: string;
};

export type PayInputs = {
  basicPay: number;
  allowances: number;
  overtime: number;
  bonus: number;
};

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Progressive bands: each slice of pay is charged at its own rate, and only the
 * portion falling inside a band is charged at that band's rate.
 */
export function graduatedAmount(amount: number, bands: Band[]) {
  const ordered = [...bands].sort((a, b) => a.sequence - b.sequence);
  let total = 0;

  for (const band of ordered) {
    if (amount <= band.lowerBound) break;
    const ceiling = band.upperBound ?? Infinity;
    const slice = Math.min(amount, ceiling) - band.lowerBound;
    if (slice <= 0) continue;
    let charge = slice * band.rate;
    if (band.maxAmount !== null && band.maxAmount !== undefined) {
      charge = Math.min(charge, band.maxAmount);
    }
    total += charge;
  }

  return round2(total);
}

/**
 * Tiered contributions: each tier is charged on the pay falling within it and
 * capped, which is how NSSF works. Differs from graduated only in that tiers
 * usually carry their own ceiling.
 */
export function tieredAmount(amount: number, bands: Band[]) {
  return graduatedAmount(amount, bands);
}

export function applyRule(rule: Rule, basisAmount: number): { amount: number; employerAmount: number } {
  let amount = 0;

  switch (rule.kind) {
    case 'GRADUATED':
      amount = graduatedAmount(basisAmount, rule.bands);
      // Relief is subtracted after the bands and cannot make the charge
      // negative -- someone below the threshold pays nothing, not a refund.
      if (rule.reliefAmount) amount = Math.max(0, amount - Number(rule.reliefAmount));
      break;
    case 'TIERED':
      amount = tieredAmount(basisAmount, rule.bands);
      break;
    case 'PERCENTAGE':
      amount = round2(basisAmount * Number(rule.rate || 0));
      break;
    case 'FIXED':
      amount = round2(Number(rule.fixedAmount || 0));
      break;
  }

  let employerAmount = 0;
  if (rule.employerRate) employerAmount = round2(basisAmount * Number(rule.employerRate));
  else if (rule.employerFixed) employerAmount = round2(Number(rule.employerFixed));
  // An employer match on a tiered scheme mirrors the employee contribution.
  else if (rule.kind === 'TIERED' && rule.employerRate === undefined) employerAmount = 0;

  return { amount: round2(Math.max(0, amount)), employerAmount: round2(Math.max(0, employerAmount)) };
}

/**
 * Runs every rule for one employee, in the order they must be applied.
 *
 * Rules that reduce taxable pay are calculated first, because a TAXABLE-basis
 * rule such as PAYE needs their totals before it can work out what is taxable.
 */
export function calculatePayslip(inputs: PayInputs, rules: Rule[]) {
  const grossPay = round2(inputs.basicPay + inputs.allowances + inputs.overtime + inputs.bonus);

  const reducing = rules.filter((rule) => rule.reducesTaxable);
  const remaining = rules.filter((rule) => !rule.reducesTaxable);

  const lines: CalculatedLine[] = [];
  let taxableReduction = 0;

  const basisFor = (rule: Rule, taxablePay: number) => {
    switch (rule.basis) {
      case 'BASIC':
        return inputs.basicPay;
      case 'TAXABLE':
        return taxablePay;
      default:
        return grossPay;
    }
  };

  for (const rule of reducing) {
    const basisAmount = basisFor(rule, grossPay);
    const { amount, employerAmount } = applyRule(rule, basisAmount);
    taxableReduction += amount;
    lines.push({
      ruleId: rule.id,
      code: rule.code,
      name: rule.name,
      basisAmount,
      amount,
      employerAmount,
      liabilityAccountCode: rule.liabilityAccountCode,
    });
  }

  const taxablePay = round2(Math.max(0, grossPay - taxableReduction));

  for (const rule of remaining) {
    const basisAmount = basisFor(rule, taxablePay);
    const { amount, employerAmount } = applyRule(rule, basisAmount);
    lines.push({
      ruleId: rule.id,
      code: rule.code,
      name: rule.name,
      basisAmount,
      amount,
      employerAmount,
      liabilityAccountCode: rule.liabilityAccountCode,
    });
  }

  const totalDeductions = round2(lines.reduce((sum, line) => sum + line.amount, 0));
  const employerCost = round2(lines.reduce((sum, line) => sum + line.employerAmount, 0));

  return {
    grossPay,
    taxablePay,
    totalDeductions,
    employerCost,
    netPay: round2(grossPay - totalDeductions),
    lines,
  };
}
