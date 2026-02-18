# OutboundOS

> AI-powered research and personalization platform for high-velocity outbound

**Built with:** React, TypeScript, Express, PostgreSQL, n8n, Claude API

---

## What It Does

OutboundOS is a GTM automation platform I built to solve the core bottleneck in outbound sales: prospect research takes too long, and generic messaging gets ignored.

**The problem:** Researching a single prospect traditionally takes 20+ minutes. At scale, this makes personalized outreach impossible.

**The solution:** OutboundOS reduces research time from 20 minutes to 30 seconds using AI-powered workflows that automatically gather context, analyze company positioning, and generate personalized messaging angles.

---

## Key Metrics

- **30 seconds** - Average research time per prospect (down from 20+ minutes)
- **44.6%** - Meeting booking rate across 83 prospects
- **10x faster** - Than manual research workflows

---

## Product Screenshots

### User Onboarding
<img width="1066" height="878" alt="image" src="https://github.com/user-attachments/assets/8793117b-64b6-4071-acca-15497a938823" />

### Data Syncing
<img width="1795" height="967" alt="image" src="https://github.com/user-attachments/assets/a590cdfd-8f36-420c-9145-db54b77e8f7b" />

### Prospect Research
<img width="1603" height="816" alt="image" src="https://github.com/user-attachments/assets/5c0509bc-10dd-4271-a73e-662f8fe76291" />

### Decisions Board
<img width="1818" height="1005" alt="image" src="https://github.com/user-attachments/assets/7af4dd50-a8a7-4285-9290-ec4dcdd12015" />

---

## How It Works

### Core Workflows

**User Research** - Analyzes your background, skills, and positioning to create personalized outreach angles that match your experience

**Prospect Research** - Pulls data from LinkedIn, company websites, news sources, and social media to build a complete prospect profile with relevant talking points

**Variant Drafter** - Generates multiple message variations based on prospect context, testing different angles, tones, and value propositions

### Tech Stack

- **Frontend:** React + TypeScript for the UI
- **Backend:** Express + PostgreSQL for data management
- **Automation:** n8n workflows for research orchestration
- **AI:** Claude API for message generation and context analysis
- **Integrations:** LinkedIn, Serper (Google Search), custom scrapers

---

## n8n Workflows

### User Research Workflow

<img width="1626" height="543" alt="image" src="https://github.com/user-attachments/assets/bfdd8b19-9923-49b4-87c2-a2f565de9f68" />

Gathers and structures information about the sender (you) to create authentic, personalized outreach that doesn't sound generic.

**Flow:**
- Webhook trigger with user profile data
- Background & career context extraction
- Skills & projects analysis
- Message model generation
- Response back to frontend

---

### Prospect Research Workflow

<img width="1610" height="555" alt="image" src="https://github.com/user-attachments/assets/a347fc52-4762-4fb1-a5fb-9214814f0b82" />


Deep research on target prospects to find relevant connection points and conversation starters.

**Flow:**
- Webhook trigger with prospect LinkedIn/company URL
- Person background extraction (LinkedIn scraping)
- Company news aggregation (recent funding, product launches, etc.)
- Recent activity monitoring (posts, articles, mentions)
- Merger & acquisition context
- Filter and structure results
- AI message generation based on gathered context
- Return research package to frontend

---

### Variant Drafter Workflow

<img width="1642" height="467" alt="image" src="https://github.com/user-attachments/assets/9d4ea109-fd2a-4fcb-be85-5db2f7755d50" />


Generates multiple outreach message options tailored to different angles and communication styles.

**Flow:**
- Input: Prospect research data + user context
- Webhook validation
- Import cached research results
- Check for previous messaging attempts
- Fetch person record from database
- Prepare OpenAI prompt with context
- Generate 3-5 message variants
- Parse and structure responses
- Create message records in database
- Format final response for UI

---

## What I Learned

- **Speed matters more than perfection** - 80% accuracy in 30 seconds beats 95% accuracy in 20 minutes
- **Context is everything** - Generic AI messages are worse than no AI; the quality of research directly determines message relevance
- **Workflows > apps** - n8n workflows let me iterate 10x faster than building a monolithic app
- **Build for yourself first** - I used OutboundOS for my own job search, which forced me to fix real pain points

---

## Product / Demo

[Live Demo]((https://your-demo-link](https://drive.google.com/file/d/1sTIIPDmxJZxiHjXrVUVmV9ZcnLJSPjzM/view))

[Live Site]((https://your-demo-link](https://drive.google.com/file/d/1sTIIPDmxJZxiHjXrVUVmV9ZcnLJSPjzM/view](https://networker-master.replit.app))

---

## Status

Currently in active use for my own outbound campaigns. Open to collaboration or questions about the architecture.

---

**Want to learn more?** Reach out on [LinkedIn]((https://www.linkedin.com/in/brianmathewjoseph/)) or email me at josephbrian671.com
