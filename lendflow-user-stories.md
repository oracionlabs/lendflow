# LendFlow — User Stories & Journeys

**A private lending portfolio platform.**
This document defines what the product does from each user's perspective. No technical details — just behavior.

> **Companion doc:** See `P2P_Lending_Plan.md` for the full technical plan — architecture, database schema, API routes, tech stack, and implementation details. This document defines *what* the product does; the tech plan defines *how* it's built.

---

## Roles

| Role | Who They Are | What They Care About |
|------|-------------|---------------------|
| **Borrower** | Someone seeking a loan | Getting funded quickly, clear terms, easy repayment |
| **Lender** | Someone deploying capital into loans | Finding good opportunities, managing risk, tracking yield |
| **Admin** | Platform operator | Quality control, risk monitoring, platform health |

---

## Borrower Journeys

### Journey 1: First-Time Borrower Signup

**As a borrower, I want to create an account and set up my profile so I can apply for a loan.**

- I land on the homepage and see a clear value proposition for borrowers
- I click "Apply for a Loan" or "Get Started"
- I choose my role: Borrower
- I sign up with email/password or Google
- I'm taken to an onboarding flow that collects:
  - Personal info (name, phone, date of birth, address)
  - Employment details (status, employer, job title)
  - Financial info (annual income, monthly expenses, credit score range)
  - Identity documents (upload government ID, proof of income)
- I see a profile completion indicator so I know what's left
- Once complete, I can start a loan application
- If I leave mid-onboarding, I can resume where I left off next time I log in

**Acceptance criteria:**
- Cannot start a loan application until profile is at least 80% complete
- Documents upload successfully and show pending verification status
- Google signup pre-fills name and email
- All fields validate in real time (not just on submit)

---

### Journey 2: Applying for a Loan

**As a borrower, I want to apply for a loan with clear terms so I know exactly what I'm committing to.**

- From my dashboard, I click "Apply for a Loan"
- Step 1: I enter how much I want to borrow and why (purpose dropdown + description)
- Step 2: I choose a repayment term (6, 12, 18, 24, 36, 48, or 60 months)
  - As I select different terms, I see the estimated monthly payment update in real time
  - I see the estimated interest rate range (final rate depends on my credit assessment)
- Step 3: I confirm my income and employment details (pre-filled from profile, editable)
- Step 4: I review everything on a summary screen
  - Loan amount, purpose, term, estimated monthly payment, estimated total repayment
  - I can go back to any step to make changes
- I click "Submit Application"
- I see a confirmation screen telling me what happens next (admin review, typically 1–2 business days)
- My application appears on my dashboard with status "Submitted"

**Acceptance criteria:**
- Monthly payment preview updates live as I change amount or term
- I can save a draft and come back later
- I can cancel a draft application
- I cannot submit if required fields are missing
- I receive an email confirmation after submitting
- I cannot submit a new application while one is already under review

---

### Journey 3: Tracking My Application

**As a borrower, I want to see where my application stands so I'm not left wondering.**

- On my dashboard, I see my application with a visual status timeline:
  - Submitted → Under Review → Approved / Rejected
- If approved:
  - I see my final terms: approved amount, interest rate, monthly payment, total repayment, origination fee
  - I see that my loan is now open for funding by lenders
  - I see a funding progress bar (0% → 100%)
  - I receive notifications as funding progresses (25%, 50%, 75%, 100%)
- If rejected:
  - I see the rejection reason clearly
  - I can apply again after addressing the issue
- Once fully funded:
  - I'm notified that my loan will be disbursed
  - Funds appear in my wallet (simulated)
  - My repayment schedule becomes visible with the first payment date

**Acceptance criteria:**
- Status timeline updates without refreshing the page
- Notifications sent at each major status change (email + in-app)
- Rejected applications show a human-readable reason
- Borrower cannot see lender identities or individual funding amounts

---

### Journey 4: Making Repayments

**As a borrower, I want to make payments easily and see exactly where I stand on my loan.**

- On my active loan page, I see:
  - Remaining balance with a progress ring showing how much I've paid off
  - Next payment: amount and due date, with a countdown
  - Full amortization schedule showing every payment, split into principal and interest
- I click "Make Payment" and choose:
  - **Pay this installment:** Pays the exact amount due
  - **Pay custom amount:** I enter an amount — anything above the installment goes to principal
  - **Pay off entire loan:** Shows me how much I'd save in interest by paying off early
- After paying, I see a confirmation and my schedule updates immediately
- If I miss a payment:
  - I see a warning banner on my dashboard
  - During the grace period (5 days), I see a countdown: "Pay by [date] to avoid a late fee"
  - After the grace period, the late fee is shown clearly
  - I receive escalating notifications: due date, grace period ending, late fee applied

**Acceptance criteria:**
- Payment updates balance and schedule in real time
- Early payoff quote shows exact savings
- Extra payments reduce future interest correctly
- Late fees are transparent — never a surprise
- Payment history shows every payment with date, amount, and status

---

### Journey 5: Loan Completion

**As a borrower, I want to know when I'm done and feel good about it.**

- After my final payment, I see a completion screen:
  - "Congratulations — your loan is fully repaid!"
  - Summary: total paid, interest paid, time to repay
  - If I paid early: "You saved $X in interest by paying ahead of schedule"
- The loan moves to my "Completed Loans" section
- I can view the full payment history at any time
- I receive a completion email

---

## Lender Journeys

### Journey 6: First-Time Lender Signup

**As a lender, I want to create an account and understand how the platform works before committing capital.**

- I land on the homepage and see a clear value proposition for lenders
- I click "Start Lending" or "Explore Opportunities"
- I choose my role: Lender
- I sign up with email/password or Google
- I complete my profile:
  - Lender type (individual or institutional)
  - Risk tolerance (conservative, moderate, aggressive)
  - Identity documents (upload government ID, proof of funds)
- I see an overview of how the platform works:
  - Browse opportunities → Fund loans → Earn yield
  - Risk is explained clearly — loans can default, capital is at risk
- I'm taken to my dashboard, which prompts me to deposit funds to get started

**Acceptance criteria:**
- Clear risk disclosure during onboarding — no one should be surprised that loans can default
- Cannot fund opportunities until profile is complete
- Platform clearly states this is private lending, not a guaranteed return

---

### Journey 7: Browsing Lending Opportunities

**As a lender, I want to browse available loans and evaluate them so I can make informed decisions.**

- I navigate to the "Opportunities" page
- I see a list of loans currently seeking funding, each showing:
  - Loan amount, purpose, term, interest rate, credit grade (A–E)
  - Funding progress bar (how much is already committed)
  - Time remaining before funding deadline
- I can filter by: credit grade, term length, interest rate range, purpose, funding progress
- I can sort by: newest, highest yield, most funded, ending soon
- I click on a loan to see the full detail page:
  - **Borrower summary** (anonymized): income range, employment type, debt-to-income ratio — never personal info
  - **Credit assessment**: AI-generated grade with confidence level and reasoning
    - e.g., "Grade B — Stable employment, moderate DTI ratio, loan purpose aligns with income"
    - Risk factors listed: e.g., "Short employment history", "High requested amount relative to income"
  - **Loan terms**: amount, rate, term, monthly payment, total repayment
  - **Funding status**: progress bar, number of lenders, amount remaining
  - **Yield calculator**: I enter how much I'd commit → see projected monthly income and total yield over the loan term

**Acceptance criteria:**
- Borrower identity is never revealed — lenders see financial profile only
- Credit assessment reasoning is clear and understandable to non-experts
- Yield calculator updates live as I change the commitment amount
- Funding progress reflects real-time state
- Fully funded loans are no longer shown on the board (or shown as "Funded")

---

### Journey 8: Funding a Loan

**As a lender, I want to commit capital to a loan and see it reflected in my portfolio immediately.**

- On the opportunity detail page, I click "Fund This Loan"
- I enter my commitment amount (minimum $25)
- I see a confirmation screen:
  - Amount I'm committing
  - My share of the loan (e.g., "You're funding 10% of this loan")
  - Projected yield: monthly income amount, total yield over term
  - Risk reminder: "This is a Grade [X] loan. Capital is at risk."
- I confirm the commitment
- My wallet updates:
  - Available balance decreases by commitment amount
  - Committed balance increases
  - Transaction appears in my history
- The loan's funding progress updates
- The commitment appears in my portfolio immediately
- If my commitment completes the funding (reaches 100%), I see a notification

**Acceptance criteria:**
- Cannot commit more than my available balance
- Cannot commit more than the remaining unfunded amount
- Minimum commitment enforced ($25)
- Wallet balance updates atomically — no inconsistent states
- If two lenders try to fund the last $100 at the same time, one succeeds and the other is told the opportunity is fully funded

---

### Journey 9: Tracking My Portfolio

**As a lender, I want to see how my lending portfolio is performing at a glance.**

- My portfolio dashboard shows:
  - **Overview cards**: total capital committed, active loans, total yield earned to date, projected future yield
  - **Yield over time chart**: line chart showing my cumulative interest income month by month
  - **Diversification chart**: pie chart showing how my capital is spread across credit grades
  - **Status breakdown**: donut chart showing active / completed / non-performing commitments
  - **Monthly yield chart**: bar chart showing interest income per month
- Below the charts, I see a list of all my commitments:
  - Loan details (purpose, grade, amount committed, rate)
  - Status: active, repaying, completed, non-performing
  - Yield earned so far vs projected total
- I can click any commitment to drill into detail:
  - Loan information
  - Payment schedule (which installments have been paid)
  - Yield distributions received (each time the borrower paid, what I received)

**Acceptance criteria:**
- Dashboard loads quickly even with many commitments
- Charts are accurate and reflect real data
- "Non-performing" status is clearly explained (what it means, what happens next)
- I can see both realized yield (received) and projected yield (expected if no default)

---

### Journey 10: Receiving Yield

**As a lender, I want to receive my share of borrower payments automatically.**

- When a borrower makes a payment, the platform automatically:
  - Calculates my share based on my commitment percentage
  - Splits my share into principal return and interest income
  - Credits my wallet
  - Creates a yield distribution record
- I see the distribution in:
  - My wallet transaction history (with link to the loan)
  - My commitment detail page
  - My yield chart updates
- I receive a notification: "You received $X.XX from [Loan Purpose] loan"
- If a borrower misses a payment:
  - I don't receive a distribution for that period
  - My commitment shows the loan is late
  - If the loan defaults, my commitment status changes to "Non-Performing"
  - I see the potential loss clearly displayed

**Acceptance criteria:**
- Distributions happen automatically — lender takes no action
- Each distribution clearly shows principal vs interest split
- Notifications are timely (same day as borrower payment)
- Default scenario is handled gracefully with clear communication

---

### Journey 11: Managing My Wallet

**As a lender, I want to manage my funds — deposit money in, withdraw money out.**

- My wallet page shows:
  - Available balance (can be committed or withdrawn)
  - Committed balance (locked in active loans)
  - Pending balance (deposits/withdrawals being processed)
  - Total yield earned (lifetime interest income)
- I can deposit funds:
  - Click "Deposit" → enter amount → confirm
  - Balance updates immediately (simulated — in production, would process via ACH/wire)
- I can withdraw funds:
  - Click "Withdraw" → enter amount (up to available balance) → confirm
  - Cannot withdraw committed funds
  - Balance updates immediately (simulated)
- Transaction history shows every movement:
  - Deposits, withdrawals, commitments, yield distributions
  - Filterable by type and date range
  - Each transaction links to the related loan if applicable

**Acceptance criteria:**
- Cannot withdraw more than available balance
- Committed funds are clearly separated and cannot be touched
- Transaction history is complete and accurate
- Running balance is always correct

---

### Journey 12: Lender Annual Summary

**As a lender, I want a summary of my interest income for tax purposes.**

- At any time, I can access my "Interest Income Summary"
- I select a year
- I see:
  - Total interest income received that year
  - Breakdown by loan (which loans generated how much income)
  - Any losses from non-performing loans
  - Net lending income
- I can export this as CSV
- At year end, I receive an email with a link to my annual summary

**Acceptance criteria:**
- Numbers match my transaction history exactly
- Export includes all fields needed for tax reporting
- Available for current and all previous years

---

## Admin Journeys

### Journey 13: Reviewing Loan Applications

**As an admin, I want to review applications efficiently and make informed approval decisions.**

- I see a queue of pending applications, newest first
- Each item shows: borrower summary (anonymized financial profile), loan amount, purpose, AI credit assessment grade
- I click an application to review:
  - Full borrower financial profile (income, employment, DTI, documents)
  - AI credit assessment with grade, confidence, reasoning, and risk factors
  - I can view uploaded documents (ID, proof of income)
  - Historical context: has this borrower applied before? Any previous loans?
- I decide:
  - **Approve**: I confirm or adjust the amount, set the interest rate (pre-filled based on credit grade), set the funding deadline
  - **Reject**: I select or write a rejection reason (borrower will see this)
  - **Override AI grade**: If I disagree with the AI assessment, I can change the grade with a written justification (audit logged)
- After approval, the loan moves to the opportunities board
- After rejection, the borrower is notified with the reason

**Acceptance criteria:**
- Admin never sees borrower PII beyond what's needed for the decision
- AI grade override requires written justification
- All review actions are audit logged (who, when, what)
- Queue shows count of pending applications in the nav

---

### Journey 14: Monitoring Platform Health

**As an admin, I want to see the overall health of the platform at a glance.**

- My dashboard shows:
  - **Origination**: total loans originated (count and volume), this month vs last month
  - **Active portfolio**: total outstanding principal, number of active loans
  - **NPL rate**: non-performing loan rate overall and by credit grade
  - **Funding health**: success rate (% of approved loans that get fully funded), average time to fund
  - **Revenue**: total origination fees collected, this month vs last month
  - **User growth**: total borrowers, total lenders, new signups this month
- Alert section highlights:
  - Loans approaching default threshold (2 of 3 missed payments)
  - Applications waiting more than 48 hours for review
  - Loans that have been in "funding" status for more than 14 days

**Acceptance criteria:**
- All metrics are real-time (or near real-time)
- Alerts are actionable — clicking them takes me to the relevant loan or application
- Month-over-month comparisons show direction (up/down arrows)

---

### Journey 15: Handling a Defaulting Loan

**As an admin, I want to be proactively alerted about troubled loans so I can take action.**

- When a borrower misses a payment, the loan appears on my risk monitoring page
- I see a timeline of the loan's payment history: which payments were on time, late, or missed
- The system shows:
  - Current status: "1 of 3 missed payments before default"
  - Days since last payment
  - Total outstanding balance
  - Affected lenders and their committed amounts
- I can:
  - Contact the borrower (send a message or flag for outreach)
  - Waive a late fee if there are extenuating circumstances
  - Manually adjust the default threshold for this specific loan
- If the threshold is reached:
  - The loan automatically moves to "Defaulted" / "Non-Performing"
  - Lenders are notified that yield distributions have stopped
  - The loan is flagged for collections/workout (manual process)
- I can see historical NPL data:
  - Default rate by credit grade (does Grade D default more than Grade B?)
  - Default rate trend over time (is it getting better or worse?)

**Acceptance criteria:**
- Admin is alerted before default happens, not after
- All admin actions on troubled loans are audit logged
- Lender notifications about non-performing loans are clear and honest
- NPL analysis helps calibrate future credit assessments

---

### Journey 16: Disbursing a Fully Funded Loan

**As an admin, I want to release funds to the borrower once a loan is fully funded.**

- When a loan reaches 100% funding, it appears in my "Ready for Disbursement" queue
- I review:
  - Final loan terms
  - All lender commitments
  - Borrower verification status (are documents verified?)
- I click "Disburse Loan"
- The system:
  - Creates the full amortization schedule
  - Moves funds from lender committed balances to the borrower's wallet
  - Deducts the origination fee (platform revenue)
  - Sets the first payment date
  - Notifies the borrower: "Your loan has been funded — funds are available"
  - Notifies all lenders: "The loan you funded is now active"
  - Loan status changes to "Active"

**Acceptance criteria:**
- Cannot disburse if borrower verification is incomplete
- Amortization schedule is generated correctly
- Origination fee is deducted and recorded as platform revenue
- All wallet movements are atomic — no partial states
- First payment date is clearly communicated to borrower

---

### Journey 17: Managing Platform Settings

**As an admin, I want to configure platform rules without touching code.**

- Settings page lets me adjust:
  - Origination fee percentage
  - Late fee structure (flat fee + daily percentage)
  - Grace period (days before late fee kicks in)
  - Default threshold (missed payments before automatic default)
  - Minimum and maximum loan amounts
  - Minimum commitment amount
  - Supported loan terms
  - Interest rates per credit grade (what rate does each grade get?)
- Changes take effect for new loans only (existing loans keep their original terms)
- All setting changes are logged (who changed what, when, old value → new value)

**Acceptance criteria:**
- Cannot set rates or fees to negative values
- Cannot set loan max below loan min
- Existing loans are never retroactively affected
- Change log is viewable by all admins

---

## Shared Journeys

### Journey 18: Notification Preferences

**As any user, I want to control what notifications I receive and how.**

- In settings, I see a notification preferences panel
- For each notification type, I can toggle:
  - In-app notifications (bell icon)
  - Email notifications
- Notification types:
  - Borrower: application status, payment due, payment overdue, late fee, loan funded, disbursement
  - Lender: opportunity funded, yield received, loan completed, loan non-performing
  - Admin: new application, approaching default, platform alerts
- Changes save automatically
- I can also set "quiet hours" — no email notifications between certain times

**Acceptance criteria:**
- In-app notifications cannot be fully disabled (safety net)
- Email preferences are respected immediately
- Unsubscribe link in every email goes to preferences page

---

### Journey 19: Viewing My Profile

**As any user, I want to manage my account and personal information.**

- Profile page shows:
  - Personal info (name, email, phone, avatar)
  - Role-specific info (borrower: financial details; lender: type, risk tolerance)
  - Uploaded documents with verification status
  - Account status
- I can:
  - Update my personal info
  - Change my avatar (upload photo)
  - Upload additional documents
  - Change my password
  - View my login history
- Borrower-specific: I can update my financial info (income, employment) — this affects future applications, not active loans

**Acceptance criteria:**
- Email changes require verification
- Password changes require current password
- Financial info updates don't retroactively change active loan terms

---

### Journey 20: First-Time Login Experience

**As any user, I want to immediately understand what I can do when I first log in.**

- After completing onboarding, my dashboard shows a contextual welcome state:
  - **Borrower**: "Ready to get started? Apply for your first loan." with a prominent CTA
  - **Lender**: "Explore lending opportunities" with a link to the board, plus a prompt to deposit funds
  - **Admin**: Quick stats (if any exist) or "No applications yet — share the platform with potential borrowers"
- Empty states throughout the app are helpful, not blank:
  - No active loans? "You don't have any active loans yet. Apply for one to get started."
  - No commitments? "You haven't funded any opportunities yet. Browse the board to find one."
  - No transactions? "Your transaction history will appear here once you start using the platform."
- Tooltips or subtle hints on first visit explain key concepts:
  - What a credit grade means
  - How yield is calculated
  - What "non-performing" means

**Acceptance criteria:**
- No page should ever feel empty or broken on first use
- CTAs guide the user to the logical next action
- Tooltips appear once and don't reappear after dismissal

---

## Edge Cases & Error Scenarios

### E1: Lender Tries to Fund a Loan That Just Got Fully Funded

- Lender clicks "Fund" on an opportunity
- Between page load and clicking confirm, another lender fills the remaining amount
- On confirm, the system tells the lender: "This opportunity has been fully funded. Browse other opportunities."
- Lender's wallet is not charged
- Lender is redirected to the opportunities board

### E2: Borrower Tries to Pay More Than Remaining Balance

- Borrower enters a custom payment amount that exceeds the remaining balance
- The system caps it: "Your remaining balance is $X. We'll process a payment for that amount."
- Borrower confirms, loan is marked as completed

### E3: Borrower Applies While Previous Application is Pending

- Borrower clicks "Apply for a Loan" while they have an application under review
- System shows: "You already have an application under review. You can apply for a new loan once your current application is resolved."
- Link to view current application status

### E4: Admin Approves a Loan But No Lenders Fund It

- Loan sits in "Funding" status past its deadline
- System auto-transitions to "Cancelled — Funding Expired"
- Borrower is notified: "Your loan did not receive enough funding. You can reapply or contact us for help."
- Any partial commitments are returned to lender wallets

### E5: Lender Account Suspended While They Have Active Commitments

- Suspended lender cannot make new commitments or deposits
- Existing commitments continue — they still receive yield distributions
- Withdrawals still work (they can take their money out)
- Account page shows suspension reason and how to resolve

### E6: Borrower Makes a Payment But Late Fee Already Applied

- Payment screen clearly shows: "Your payment of $X includes a $Y late fee"
- Breakdown: principal portion, interest portion, late fee portion
- If borrower pays only the original installment amount (ignoring late fee), the late fee carries forward

### E7: Multiple Lenders Fund the Same Loan Simultaneously

- The system processes commitments sequentially (database-level locking)
- If the remaining amount is $500 and two lenders each try to commit $400:
  - First to process succeeds ($400 committed)
  - Second is told: "Only $100 remains. Would you like to commit $100 instead?"
- No overcommitment is possible

---

## Non-Functional Requirements

### Performance
- Opportunities board loads in under 2 seconds with 100+ listings
- Portfolio dashboard loads in under 3 seconds with 50+ commitments
- Yield distribution happens within 1 minute of borrower payment

### Security
- Borrower PII visible only to the borrower and admin (never to lenders)
- All financial operations are atomic (no partial states)
- Session timeout after 30 minutes of inactivity
- Rate limiting on auth endpoints

### Reliability
- Wallet balances are always consistent (available + committed + pending = total)
- Amortization calculations are deterministic (same inputs always produce same schedule)
- Failed yield distributions retry automatically (don't lose money)

### Accessibility
- All forms are keyboard navigable
- Screen reader compatible (ARIA labels on all interactive elements)
- Color is not the only indicator of status (always paired with text or icons)
- Minimum contrast ratios met (WCAG AA)

---

*Define the experience. Then build it.*
