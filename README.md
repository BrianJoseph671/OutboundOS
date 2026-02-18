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

## How It Works

### Core Workflows

**WF0: Intake** - Captures prospect details and initializes research queue

**WF1: Enrich** - Pulls data from LinkedIn, company websites, news sources, and social media to build a complete prospect profile

**WF2: Draft-Polish Engine** - Generates personalized outreach messages using Claude API based on enriched prospect data

**WF3: Tech Updates RCC Triage** - Monitors for trigger events (funding, product launches, hiring signals) that create outreach opportunities

### Tech Stack

- **Frontend:** React + TypeScript for the UI
- **Backend:** Express + PostgreSQL for data management
- **Automation:** n8n workflows for research orchestration
- **AI:** Claude API for message generation and context analysis
- **Integrations:** LinkedIn, Serper (Google Search), custom scrapers

---

## What I Learned

- **Speed matters more than perfection** - 80% accuracy in 30 seconds beats 95% accuracy in 20 minutes
- **Context is everything** - Generic AI messages are worse than no AI; the quality of research directly determines message relevance
- **Workflows > apps** - n8n workflows let me iterate 10x faster than building a monolithic app
- **Build for yourself first** - I used OutboundOS for my own job search, which forced me to fix real pain points

---

## Demo

[Live Demo]([https://your-demo-link](https://drive.google.com/file/d/1sTIIPDmxJZxiHjXrVUVmV9ZcnLJSPjzM/view)) 

<img width="1681" height="464" alt="image" src="https://github.com/user-attachments/assets/8801bf83-394d-4436-b2cc-8b890b21ee1b" />
<img width="1622" height="518" alt="image" src="https://github.com/user-attachments/assets/35d28466-7d6f-453a-b916-85621cedfee9" />
<img width="1654" height="422" alt="image" src="https://github.com/user-attachments/assets/a8a1c329-690b-4507-9d49-16dc8f761b6a" />


---

## Status

Currently in active use for my own outbound campaigns. Open to collaboration or questions about the architecture.

---

**Want to learn more?** Reach out on [LinkedIn](https://linkedin.com/in/yourprofile) or email me at your@email.com
