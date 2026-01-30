# Claude Code Guidelines for OutboundOS

This document defines rules, context, and guardrails for AI-assisted development in this production monorepo.

## Project Overview

**OutboundOS** is a full-stack TypeScript monorepo for outbound sales automation and management.

### Architecture

- **Monorepo structure**: `client/`, `server/`, `shared/`
- **Frontend**: React 18, TypeScript, Vite, TailwindCSS v4, shadcn/ui, TanStack Query
- **Backend**: Node.js, Express, TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Passport.js with session storage in Postgres
- **Real-time**: WebSockets using `ws`
- **AI Integration**: OpenAI API
- **File Uploads**: Multer
- **Hosting**: Currently Replit (GitHub is source of truth)
- **Automation**: n8n workflows for external automation

## Code Change Principles

### Incremental Changes
- Prefer small, focused diffs over large rewrites
- Make one logical change at a time
- Explain changes before implementing large edits
- Ask clarifying questions when requirements are ambiguous

### Logic Placement
- **Frontend code**: `client/` only
- **Backend code**: `server/` only
- **Shared types and schemas**: `shared/` only
- Never mix concerns across boundaries

### TypeScript and Style
- Maintain strict TypeScript typing throughout
- Follow existing code style and formatting conventions
- Use ESLint and Prettier configurations as defined
- Prefer explicit types over implicit inference in public APIs
- Use existing patterns and abstractions before creating new ones

## Security and Safety

### Secrets and Environment
- **NEVER** modify `.env` files
- **NEVER** read, write, or suggest changes to secrets or credentials
- **NEVER** commit environment variables or API keys
- Use environment variable references only; never hardcode values

### Database and Migrations
- **NEVER** modify the database directly
- Use Drizzle ORM migrations exclusively
- Always create a new migration file; never edit existing migrations
- Test migrations locally before suggesting deployment
- Be explicit about schema changes and their impact
- Consider backwards compatibility and data migration paths

### Version Control
- **NEVER** commit generated artifacts (build outputs, `node_modules`, etc.)
- **NEVER** commit dependency lock file changes unless dependencies were intentionally modified
- **NEVER** force push or rewrite public history
- GitHub is the single source of truth for all code

## AI Tool Rotation

When working in this repo alongside other AI tools (Cursor, Antigravity, etc.):

- Always read files before modifying to understand current state
- Assume other tools may have made recent changes
- Never assume file contents based on previous sessions
- Check git status before making changes
- Coordinate major refactors with the user
- Document significant architectural decisions

## n8n Workflow Assistance

When assisting with n8n workflows, follow these principles:

### Workflow Design
- **Assume production-grade** unless explicitly stated as experimental
- Prefer clear, modular workflow structure
- Use descriptive, human-readable node names
- Follow consistent naming conventions across workflows
- Minimize unnecessary nodes and data transformations
- Optimize for performance and resource usage

### n8n Tool Integration

Claude may have access to specialized n8n tooling that significantly enhances workflow assistance:

**n8n-mcp MCP Server**
- Provides access to 1,084 node documentation (537 core + 547 community nodes)
- 2,709 workflow templates with complete metadata and patterns
- Tools for creating, updating, executing, and validating workflows
- Search capabilities across nodes and documentation
- Requires `N8N_API_URL` and `N8N_API_KEY` when connecting to actual n8n instance

**n8n-skills (Claude Code Skills)**
- 7 specialized skills for workflow construction patterns
- Installation: `/plugin install czlonkowski/n8n-skills`
- Covers: expression syntax, MCP tools usage, workflow patterns, validation, node configuration, JavaScript/Python code
- Draws from analysis of 2,600+ real-world workflow templates
- Prerequisite: n8n-mcp server must be configured

**When n8n Tools Are Available**
- ALWAYS use MCP tools to inspect existing workflows before suggesting changes
- Query node documentation before manual configuration
- Validate workflows using built-in validation tools
- Search template library for proven patterns before building from scratch
- Leverage the 5 core workflow patterns: webhook processing, HTTP API, database operations, AI workflows, scheduled tasks
- Document which tools were used in workflow development

**Critical Pattern**
- Webhook data resides at `$json.body` NOT at the root level
- This is a common source of errors - always reference webhook payloads correctly

### Reliability and Safety
- Be explicit about triggers, branching logic, and error handling
- Use retries with exponential backoff where appropriate
- Implement guards and validation for external inputs
- Design for idempotency when possible
- Add proper error outputs and failure paths
- Consider rate limits and API quotas

### Workflow Development
- Explain workflow logic before building complex flows
- When given MCP or Skills access, actively use tools to:
  - Inspect existing workflows before modifications
  - Query node documentation for accurate configuration
  - Validate workflow structure using validation tools
  - Search the 2,709 workflow template library for proven patterns
  - Construct and test new workflows with validation
  - Reference the 5 core workflow patterns (webhook processing, HTTP API, database ops, AI workflows, scheduled tasks)
- Use validation tools early to catch configuration errors before deployment
- Understand validation profiles and auto-sanitization behavior
- Document workflow purpose and key decision points
- Optimize for reliability, observability, and maintainability
- Use workflow notes to explain complex logic

### n8n Best Practices
- Use sticky notes for documentation within workflows
- Leverage workflow variables for configuration
- Use sub-workflows for reusable logic
- Implement proper webhook authentication
- Test webhooks and triggers thoroughly
- Monitor execution history for failures

**Expression Syntax**
- Use correct n8n expression variables: `$json`, `$node`, `$now`, `$env`
- **Critical**: Webhook data is at `$json.body`, not at root level
- Code node return values must be arrays
- Prefer JavaScript over Python for workflows requiring external libraries (Python Code nodes cannot use requests, pandas, etc.)
- Use production-tested patterns from the template library

### n8n Production Safety

When working with n8n workflows, especially with MCP tool access:

- **Never** directly edit production workflows through the API without explicit user confirmation
- Always create and test workflow copies before modifying production workflows
- Use validation tools to verify workflow integrity before deployment
- Test all changes in a development environment first
- Export backups of workflows before making significant changes
- Respect the distinction between development and production n8n instances
- Document any workflow changes made through MCP tools, including what was changed and why
- When validation failures occur, address them rather than bypassing validation
- Coordinate with user before deploying workflows that affect live business operations

## Destructive Actions - DO NOT

### Code
- ❌ Delete or rename files without explicit user confirmation
- ❌ Modify authentication or authorization logic without review
- ❌ Change database connection strings or credentials
- ❌ Alter build or deployment configurations without discussion
- ❌ Remove error handling or validation logic
- ❌ Modify git configuration or hooks
- ❌ Change package.json scripts without understanding their purpose

### Database
- ❌ Drop tables or columns without migration plan
- ❌ Delete or modify existing migration files
- ❌ Run raw SQL that modifies data
- ❌ Change primary keys or foreign key relationships without careful review

### Workflows
- ❌ Delete or disable production workflows without confirmation
- ❌ Edit production workflows via API without explicit confirmation and backup
- ❌ Modify webhook URLs or credentials
- ❌ Change workflow triggers without understanding impact
- ❌ Remove error handling or retry logic
- ❌ Alter production environment variables in workflows
- ❌ Ignore MCP validation tool failures when tools are available
- ❌ Deploy workflows without testing in development environment first

### Deployment
- ❌ Deploy to production without user approval
- ❌ Modify CI/CD pipelines without review
- ❌ Change environment-specific configurations
- ❌ Alter secrets management systems

## When in Doubt

1. **Ask the user** before making significant changes
2. **Read the code** before modifying it
3. **Explain your reasoning** when suggesting solutions
4. **Propose alternatives** when multiple approaches exist
5. **Admit uncertainty** rather than guessing

## Context Awareness

- This is a **production system** serving real users
- Changes have real impact on business operations
- Reliability and data integrity are paramount
- Security and privacy must be maintained
- Always prioritize stability over new features when in conflict

---

*This document is written for AI agents. Humans should refer to project documentation in `/docs` if available.*
