# Psychometric Fraud, Speeder Defense & Guest Points Migration

This document details the architectural defenses against survey fraud, speeders, straight-liners, and mathematical edge-cases in the psychometric calculation layer of `@intuitui-labs/form-builder-engine`.

---

## 1. Threat Model & Research Validity Risks

In empirical academic research and gamified feedback applications, response integrity is critical. Unsupervised participants incentivized by gamified Voice Points or financial rewards exhibit well-known adversarial behaviors:
1. **Speeding**: Clicking through questions without reading (sub-350ms per item).
2. **Straight-Lining**: Selecting the identical option (e.g. 5, 5, 5 or 3, 3, 3) across an entire construct or instrument.
3. **Zero-Variance Pathology**: Entire cohorts answering identically, triggering divide-by-zero errors in classical psychometric formulas.
4. **Timing Spoofing**: Simulating responses in batched automated scripts.
5. **Session Disconnection / Abandonment**: Participants completing surveys as guests and losing earned credentials upon registration.

---

## 2. Psychometric Auditor Port (`IPsychometricAuditorPort`)

To uphold the hexagonal decoupling invariant, fraud detection is abstracted as an engine port:

```typescript
export interface IPsychometricAuditorPort {
  readonly name: string;

  /**
   * Evaluates response validity for a single completed submission.
   */
  auditSubmission(
    submission: PsychometricAuditPayload,
    config?: PsychometricAuditConfig,
  ): Promise<PsychometricAuditResult>;

  /**
   * Computes cohort-level internal consistency (Cronbach's Alpha).
   * Safe against zero total variance.
   */
  calculateCohortReliability(
    cohortResponses: Record<string, number>[],
    itemKeys?: string[],
  ): Promise<ReliabilityResult>;
}
```

### Key Defenses Implemented in `DefaultPsychometricAuditor`:

#### A. Safe Cronbach's Alpha Calculation
Classical Cronbach's Alpha is defined as:
$$\alpha = \frac{K}{K - 1} \left( 1 - \frac{\sum_{i=1}^K \sigma^2_{Y_i}}{\sigma^2_X} \right)$$
When a test cohort answers identically, the total test score variance $\sigma^2_X = 0$. In standard implementations, this throws `ZeroDivisionError` or outputs `NaN`.
`DefaultPsychometricAuditor` guards this:
```typescript
if (totalVariance <= 0 || Number.isNaN(totalVariance)) {
  return {
    alpha: 0.0,
    interpretation: 'No variance in responses',
    isValid: false,
    itemCount: K,
    sampleSize: N,
  };
}
```

#### B. Straight-Lining Detection
Uses the **LongString Index** (longest consecutive identical responses) and percentage of dominant response choices.
If a participant selects the same rating for $\ge 80\%$ of Likert/rating items:
- Flagged as `STRAIGHT_LINING`.
- Confidence score penalized by 45%.
- Response points held in review.

#### C. Speeder Detection
Tracks the average dwell time per question and individual sub-second response clicks:
- **Speeder Flag**: Average dwell time $< 350\text{ms}$ per item.
- **Timing Spoofing Flag**: $\ge 70\%$ of items clicked in $< 200\text{ms}$ (biologically impossible for human reading comprehension).
- Fraudulent submissions are recorded with an audit flag and zero gamified points awarded.

---

## 3. Guest Points Migration Protocol

When respondents answer surveys prior to creating an account, their points accumulate in an ephemeral guest session (`guest-user`).

Upon registration or login in `CompositeAuthAdapter` and `feedora.tsx`:
1. The engine checks local SQLite for `guest-user` profile points.
2. If `guestProfile.totalPoints > 0`, it transfers points and completed count to the newly authenticated `authUser.id`.
3. The guest balance is zeroed atomically.
4. The user's research standing (Bronze $\rightarrow$ Silver $\rightarrow$ Gold) is recomputed and persisted.

---

## 4. Automated Test Verification

Verified by hostile test suite [`test/psychometrics/hostile-fraud-auditor.test.ts`](file:///c:/projects/packages/form-builder-engine/test/psychometrics/hostile-fraud-auditor.test.ts):
- `8/8` tests passing covering straight-lining, speeder dwell thresholds, zero-variance cohorts, and timing spoofing.
