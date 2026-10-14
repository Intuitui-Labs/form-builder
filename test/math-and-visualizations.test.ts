import { describe, it, expect } from 'vitest';
import { MathExpressionEvaluator } from '../src/core/MathExpressionEvaluator.js';
import { VisualizationEngine } from '../src/analytics/VisualizationEngine.js';
import type { InteractiveVisualizationDescriptor } from '../src/schema/FormSchema.js';

describe('MathExpressionEvaluator & Interactive Visualizations', () => {
  describe('MathExpressionEvaluator', () => {
    it('evaluates standard arithmetic expressions with correct operator precedence', () => {
      expect(MathExpressionEvaluator.evaluate('10 + 5 * 2')).toBe(20);
      expect(MathExpressionEvaluator.evaluate('(10 + 5) * 2')).toBe(30);
      expect(MathExpressionEvaluator.evaluate('100 - 40 / 2')).toBe(80);
      expect(MathExpressionEvaluator.evaluate('2 ^ 3')).toBe(8);
      expect(MathExpressionEvaluator.evaluate('10 % 3')).toBe(1);
    });

    it('resolves variables from live form state values dictionary', () => {
      const values = {
        monthlyIncome: 5000,
        rent: 1500,
        utilities: 300,
      };

      const result = MathExpressionEvaluator.evaluate(
        'monthlyIncome - (rent + utilities)',
        values,
      );
      expect(result).toBe(3200);
    });

    it('supports standard math functions (min, max, round, abs, clamp, sqrt, floor, ceil)', () => {
      expect(MathExpressionEvaluator.evaluate('min(10, 20)')).toBe(10);
      expect(MathExpressionEvaluator.evaluate('max(5, 50)')).toBe(50);
      expect(MathExpressionEvaluator.evaluate('round(4.6)')).toBe(5);
      expect(MathExpressionEvaluator.evaluate('abs(-42)')).toBe(42);
      expect(MathExpressionEvaluator.evaluate('clamp(150, 0, 100)')).toBe(100);
      expect(MathExpressionEvaluator.evaluate('clamp(-20, 0, 100)')).toBe(0);
      expect(MathExpressionEvaluator.evaluate('sqrt(144)')).toBe(12);
      expect(MathExpressionEvaluator.evaluate('floor(7.9)')).toBe(7);
      expect(MathExpressionEvaluator.evaluate('ceil(7.1)')).toBe(8);
    });

    it('evaluates conditional ternary operators with relational comparisons', () => {
      const goodCredit = { creditScore: 750 };
      const badCredit = { creditScore: 580 };

      const formula = 'creditScore >= 700 ? 5.5 : 9.5';
      expect(MathExpressionEvaluator.evaluate(formula, goodCredit)).toBe(5.5);
      expect(MathExpressionEvaluator.evaluate(formula, badCredit)).toBe(9.5);
    });

    it('hostile defense: division and modulo by zero return safe fallbacks instead of Infinity or NaN', () => {
      expect(MathExpressionEvaluator.evaluate('100 / 0')).toBe(0);
      expect(MathExpressionEvaluator.evaluate('100 % 0')).toBe(0);
      expect(MathExpressionEvaluator.evaluate('0 / 0')).toBe(0);
    });

    it('hostile defense: neutralizes prototype pollution and malicious JS injections safely', () => {
      // Attacks trying to break out into JavaScript global or prototype
      expect(MathExpressionEvaluator.evaluate('constructor.prototype', {})).toBe(0);
      expect(MathExpressionEvaluator.evaluate('__proto__', {})).toBe(0);
      expect(MathExpressionEvaluator.evaluate('process.exit()', {})).toBe(0);
      expect(MathExpressionEvaluator.evaluate('window.alert(1)', {})).toBe(0);
      expect(MathExpressionEvaluator.evaluate('Function("return 42")()', {})).toBe(0);
    });

    it('hostile defense: handles malformed syntax and unclosed parens without crashing', () => {
      expect(MathExpressionEvaluator.evaluate('((10 + 20')).toBe(0);
      expect(MathExpressionEvaluator.evaluate('**//++')).toBe(0);
      expect(MathExpressionEvaluator.evaluate('')).toBe(0);
      expect(MathExpressionEvaluator.evaluate('   ')).toBe(0);
    });
  });

  describe('VisualizationEngine', () => {
    it('computes a semi-circle gauge layout with angleDeg and statusColor', () => {
      const descriptor: InteractiveVisualizationDescriptor = {
        id: 'debt-gauge',
        title: 'Debt Service Ratio',
        visualizationType: 'gauge',
        formula: 'min(100, (debt / income) * 100)',
      };

      const highRisk = VisualizationEngine.compute(descriptor, { debt: 4500, income: 5000 });
      expect(highRisk.type).toBe('gauge');
      if (highRisk.type === 'gauge') {
        expect(highRisk.value).toBe(90);
        expect(highRisk.percentage).toBe(90);
        expect(highRisk.statusColor).toBe('success'); // >= 80
        expect(highRisk.angleDeg).toBeGreaterThan(0);
      }

      const lowRisk = VisualizationEngine.compute(descriptor, { debt: 1000, income: 5000 });
      if (lowRisk.type === 'gauge') {
        expect(lowRisk.value).toBe(20);
        expect(lowRisk.statusColor).toBe('danger'); // < 50
      }
    });

    it('computes normalized bar chart items with proportional percentages', () => {
      const descriptor: InteractiveVisualizationDescriptor = {
        id: 'budget-breakdown',
        title: 'Budget Allocation',
        visualizationType: 'bar',
        metrics: [
          { label: 'Housing', value: 'housing' },
          { label: 'Food', value: 'food' },
          { label: 'Savings', value: 'savings' },
        ],
      };

      const values = {
        housing: 2000,
        food: 1000,
        savings: 500,
      };

      const result = VisualizationEngine.compute(descriptor, values);
      expect(result.type).toBe('bar');
      if (result.type === 'bar') {
        expect(result.items).toHaveLength(3);
        const housing = result.items.find((i) => i.label === 'Housing');
        expect(housing?.percentage).toBe(100); // 2000 is max

        const food = result.items.find((i) => i.label === 'Food');
        expect(food?.percentage).toBe(50); // 1000 / 2000 = 50%

        const savings = result.items.find((i) => i.label === 'Savings');
        expect(savings?.percentage).toBe(25); // 500 / 2000 = 25%
      }
    });

    it('computes cohort benchmark comparison with percentile and delta percentage', () => {
      const descriptor: InteractiveVisualizationDescriptor = {
        id: 'savings-compare',
        title: 'Retirement Readiness',
        visualizationType: 'comparison',
        formula: 'savingsRate',
      };

      const result = VisualizationEngine.compute(descriptor, { savingsRate: 75 });
      expect(result.type).toBe('comparison');
      if (result.type === 'comparison') {
        expect(result.userValue).toBe(75);
        expect(result.benchmarkValue).toBe(50);
        expect(result.deltaPercent).toBe(50); // (75 - 50) / 50 = +50%
        expect(result.headline).toContain('50% higher than cohort average');
      }
    });

    it('computes compounding projection and generates valid SVG path data', () => {
      const descriptor: InteractiveVisualizationDescriptor = {
        id: 'networth-projection',
        title: '10-Year Wealth Projection',
        visualizationType: 'projection',
        formula: 'initialCapital * 1.08',
      };

      const result = VisualizationEngine.compute(descriptor, { initialCapital: 10000 });
      expect(result.type).toBe('projection');
      if (result.type === 'projection') {
        expect(result.points.length).toBeGreaterThan(0);
        expect(result.svgPathData).toMatch(/^M\s*[0-9.]+/);
        expect(result.svgPathData).toContain('L');
        expect(result.minVal).toBeDefined();
        expect(result.maxVal).toBeGreaterThanOrEqual(result.minVal);
      }
    });
  });
});
