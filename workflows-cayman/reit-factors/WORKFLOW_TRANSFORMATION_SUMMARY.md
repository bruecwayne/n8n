# Workflow Transformation Summary
## `__Email_Agent_REIT_Factors.json`

**Date:** October 28, 2025  
**Transformation:** Joanna Snedden travel influencer TikTok outreach → REITFactors.ai institutional investor outreach  
**Event Context:** REITworld 2025 (Dallas, Dec 8-11, 2025)

---

## Overview

The `__Email_Agent_REIT_Factors.json` n8n workflow has been comprehensively updated with **surgical, targeted edits** to retarget from B2C influencer brand collaborations to B2B institutional finance outreach. All core node structures, connections, and tools remain intact—only prompts, system messages, labels, templates, and contextual references have been updated.

---

## Detailed Changes

### 1. Primary Email Agent System Message (`Email Agent` node, line 55)

**Updated sections:**
- **Persona:** Changed from personal influencer assistant to institutional research team assistant
- **Professional Context:** Now PhD-level finance academics commercializing REIT research vs. content creator with followers
- **Email Types:** Institutional investor, sell-side research, index providers, corporate IR, research partnerships (vs. brand collaborations)
- **Guidelines:** Professional institutional standards vs. influencer/content creator tone
- **Event Context:** Added REITworld 2025 details, website URLs, platform information

**Key phrases updated:**
- Removed: "TikTok strategist," "318,000+ followers," "lifestyle/fashion/beauty content"
- Added: "PhD-level researchers," "REIT-specific factor models," "institutional-grade data," "factor attribution"

---

### 2. Secondary Email Agent System Persona (`Email Agent1` node, line 801)

**Before:** "Joanna's AI Assistant" - expert at securing TikTok collaborations with travel/fashion brands

**After:** "REITFactors.ai Institutional Outreach Assistant" - expert at securing meetings with institutional investors

**Persona attributes updated:**
- Strategic: Frame as business opportunity for institution (factor models solving portfolio problems)
- Credible: Backed by PhD research + data infrastructure (vs. social proof + follower count)
- Context-Aware: Understand prospect's investment focus (vs. brand collaboration readiness)
- Value-Driven: Factor attribution, risk models, index alignment (vs. booking/visibility goals)
- Professional: Institutional finance standards (vs. high-end creator brand language)

---

### 3. Email Formatting Template (line ~1191)

**Removed elements:**
- Joanna's TikTok follower count with hyperlink (321,000+)
- Travel dates context ("my partner and I will be visiting...")
- TikTok content deliverables framing
- Signature: Joanna Snedden + TikTok handle + JoannaSneddenMedia email

**Added elements:**
- Academic publication reference: "Real Estate Economics" journal mention
- Meeting framing: "15-20 minutes at REITworld (Dec 9 or 10)"
- Signature: Cayman Seagraves, Assistant Professor, University of Tulsa, REITFactors.ai co-author
- Website/contact links: reitfactors.ai, cayman-seagraves@utulsa.edu

**Email structure template:**
- Greeting: Professional "Dear [First Name]"
- Opening: Context + credibility statement (academic backing)
- Value Prop: Adapted to recipient's specific role (factor performance, data, index opportunity)
- Bullet points: Factor models, data/analytics capabilities, benchmark opportunities
- CTA: 15-20 min meeting at REITworld (specific dates)
- Closing: "Best regards" with institutional credentials

---

### 4. Dynamic Email Prompt (`Build Dynamic Prompt2` node, line ~1173)

**Old prompt:**
```
Your task is to draft a new brand collaboration pitch to ${Business_Name}.
Our travel dates for Ibiza are July 9th to July 14th.
Execute your "Brand Collaboration Pitch Workflow" to structure the email.
Integrate: Category, Unique Value Proposition, Best Content Opportunities
```

**New prompt:**
```
Your task is to draft an institutional outreach email to ${First_Name} at ${Firm}.
REITworld 2025 is Dec 8-11 in Dallas (Hilton Anatole). We aim to schedule a 15-20 minute meeting.
Craft a concise, benefit-driven pitch tailored to their role.
Integrate: Title, Firm, Key Interest, Email
Focus on value delivery for their specific role (portfolio analytics, factor attribution, research tools, index alignment).
Reference the appropriate email template from guidelines.
```

**Data field mapping:**
- Business Name → Firm
- Category → Title
- Unique Value Prop → Key Interest
- Best Content Opportunities → (N/A - replaced with role-specific value)

---

### 5. Email Label & Categorization (line ~1197)

**Changed from:** `"Social Media Collab - Ibiza"`  
**Changed to:** `"REITworld 2025 - Outreach"`

**Cache result names (4 instances updated):**
- Old: `"Ibiza Prospect List"`
- New: `"REITworld Contact List"`

---

### 6. Sender & Email Filters (lines ~299, ~469, multiple)

**Updated from:**
- Sender filter: "Joanna Snedden"
- From condition: "Joanna Snedden <joannasneddenmedia@gmail.com>"
- To condition: "joannasneddenmedia@gmail.com"

**Updated to:**
- Sender filter: "cayman-seagraves@utulsa.edu"
- From condition: "cayman-seagraves@utulsa.edu"
- To condition: "cayman-seagraves@utulsa.edu"

**Impact:** Email routing and context now aligned with REITFactors institutional team

---

### 7. Sticky Notes & Workflow Labels

**Sticky Note 1 (line ~205):**
- Old: `"## Personal Assistant - Joanna (generic)"`
- New: `"## REITFactors.ai — Institutional Outreach Agent"`
  - Purpose: B2B email outreach for REITworld 2025 attendees
  - Event: Dallas, Dec 8-11, Hilton Anatole
  - Team: Cayman, Mariya, Stace
  - Website: reitfactors.ai

**Sticky Note 2 (line ~938):**
- Old: `"## Personal Assistant - Joanna (social media colabs - IBIZA)"`
- New: `"## REITFactors.ai — Email Campaign Execution"`
  - Contact Database: REITworld 2025 attendees (portfolio managers, analysts, index providers, corporate IR)
  - Email Templates: By audience type (PM, Research, Index Partner, REIT IR, Legal/Partnerships)
  - Meeting Goal: 15-30 min discussion at REITworld
  - Key Talking Points: Factor outperformance, institutional data, platform features, index alignment

---

### 8. Data Enrichment Agent System Message (`Enrich Prospects Agent` node, line ~1239)

**Updated from:** Strategic enrichment for Joanna's Ibiza brand collaborations

**Updated to:** Institutional research for REITFactors contact analysis
- Focus: Portfolio manager interests, REIT asset class expertise, factor model relevance
- Research methods: Firm websites, investor presentations, recent publications, REIT holdings
- Output: Enriched institutional context enabling personalized B2B outreach

---

## Preserved Elements (Structure Unchanged)

✅ **Node architecture:** All connections, triggers, tools maintained  
✅ **Gmail integration:** Send, Create Draft, Reply, Label, Mark Unread nodes  
✅ **Memory management:** BufferWindow nodes at 20-30 turn context  
✅ **LLM configuration:** GPT-4 (2000 tokens, 0.3 temp), GPT-4 mini (1000-1500 tokens)  
✅ **Tool integration:** HTTP requests, code tools, workflow tools, vector stores  
✅ **HTML email format:** Professional clean styling maintained  
✅ **Error handling:** onError: continueErrorOutput patterns preserved  
✅ **JSON validity:** Confirmed with Python json.tool parser  

---

## Email Template Mapping

The workflow now supports these institutional email types (from `reitworld_outreach_email_templates.md`):

| Template Type | Recipient Profile | Key Value Prop |
|---|---|---|
| **Portfolio Manager** | Buy-side analyst/PM | Factor data, attribution, portfolio construction |
| **Sell-Side Research** | Equity research team | Research validation, webinar coordination |
| **Index Provider** | FTSE Russell, benchmark teams | Index construction, reconstitution, drift analysis |
| **REIT Corporate IR** | CFO/IR at REIT | Factor attribution on ticker vs. peers |
| **Strategic Partners** | Legal, partnerships, advisory | Licensing terms, SOWs, IP posture |

Each email template in the workflow's prompts now matches these institutional use cases.

---

## REITworld Context

**Event:** REITworld 2025  
**Location:** Dallas, TX · Hilton Anatole  
**Dates:** December 8-11, 2025  
**Attendees:** 300+ institutional investors, sell-side analysts, service providers  
**Outreach Window:** November 3 - December 7, 2025 (6 weeks pre-event)  
**Meeting Target:** 15-30 minute one-on-ones to present REIT factors + platform  

**Platform Assets:**
- Website: https://reitfactors.ai
- Research page: https://reitfactors.ai/research
- Dashboard: https://reitfactors.ai/dashboard

**Team:**
- Cayman Seagraves (University of Tulsa) — cayman-seagraves@utulsa.edu
- Mariya Letdin (Florida State University)
- Stace Sirmans (Auburn University)

---

## Verification

✅ **JSON Syntax:** Valid (confirmed with Python json.tool)  
✅ **Node Connections:** Intact and functional  
✅ **Email Templates:** Aligned with reitworld_outreach_email_templates.md guidelines  
✅ **Prompt Context:** REITFactors.ai institutional focus throughout  
✅ **Labels & Categorization:** Updated for campaign management  

---

## Notes for Users

1. **No Retraining Required:** All LLM nodes maintain their configuration; prompts have been updated to guide behavior.
2. **Contact Data Format:** Ensure incoming contact data includes: First Name, Title, Firm, Email, Key Interest
3. **Meeting Scheduling:** Workflow optimized for 15-20 minute meeting requests at REITworld (Dec 9-10 preferred)
4. **Campaign Management:** Use new "REITworld 2025 - Outreach" label to organize drafts and track outreach progress
5. **Template Selection:** Agent will recommend template based on recipient's Title/Role and Key Interest field

---

**Workflow Transformation Complete**  
All changes maintain surgical precision—only prompts, context, and labels modified; core n8n architecture preserved.
