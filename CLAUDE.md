# CLAUDE.md

**Claude Code Guide for n8n Automation Mastery**

This repository provides **two powerful n8n automation tools** that work together for comprehensive workflow development, analysis, and deployment.

## Critical Rules

- **NEVER BUILD LOCALLY**: Use cloud-first workflow for all n8n development
- **Two-Tool Integration Required**: Always use FastAPI (discovery) → n8n MCP (configuration) → n8n MCP (validation)
- **Discovery → Configuration → Validation**: Sequential tool usage for maximum effectiveness
- **Category-Based Search**: Use FastAPI categories for business-function browsing vs technical integration search

## Tool Overview

### 1. FastAPI Workflow Browser (Static Analysis)
**Purpose**: Analyze and search 2,056 static workflow files
- **Database**: 29,522 nodes indexed with full-text search (SQLite FTS5)
- **Categories**: 16 business categories (365 integrations organized)
- **Performance**: Sub-100ms search responses
- **Server**: `python run.py` → `http://localhost:8000`

### 2. n8n MCP (Live Node Management)
**Purpose**: Real-time node discovery, configuration, and validation
- **Nodes**: 535 total (269 AI tools, 108 triggers, 88% documentation)
- **Capabilities**: Live node schema, validation, template generation
- **Integration**: Connected via Model Context Protocol

## Essential Commands

### FastAPI Server
```bash
# Start server (should be running)
python run.py

# Core API endpoints
curl "http://localhost:8000/api/stats"                           # Database statistics
curl "http://localhost:8000/api/workflows?query=OpenAI&limit=5" # Search workflows
curl "http://localhost:8000/api/categories"                     # List categories
curl "http://localhost:8000/api/workflows/{filename}"           # Get workflow details
```

### n8n MCP Functions
```typescript
// Essential discovery
mcp__n8n-mcp__search_nodes({query: "OpenAI", limit: 5})        // Find nodes
mcp__n8n-mcp__list_nodes({category: "AI", limit: 20})          // List by category
mcp__n8n-mcp__list_ai_tools()                                  // All AI tools

// Essential configuration
mcp__n8n-mcp__get_node_essentials("nodes-base.openAi")         // Key properties (fast)
mcp__n8n-mcp__validate_node_operation("nodes-base.openAi", config) // Validate config

// Essential templates
mcp__n8n-mcp__list_tasks()                                     // Browse templates
mcp__n8n-mcp__get_node_for_task("chat_with_ai")               // Pre-configured nodes
```

## 16 FastAPI Categories (Expert Reference)

### Business Function Categories
1. **AI Agent Development** (14 integrations) - OpenAI, LangChain, vector stores, AI services
2. **Communication & Messaging** (30 integrations) - Slack, Discord, Telegram, email, notifications
3. **Marketing & Advertising Automation** (25 integrations) - Email marketing, lead generation, analytics
4. **Data Processing & Analysis** (21 integrations) - Databases, spreadsheets, ETL, analytics
5. **Technical Infrastructure & DevOps** (18 integrations) - CI/CD, monitoring, cloud services
6. **Business Process Automation** (11 integrations) - Scheduling, workflow orchestration
7. **Project Management** (9 integrations) - Asana, Trello, Monday.com, task management
8. **CRM & Sales** (10 integrations) - HubSpot, Salesforce, Pipedrive, contact management
9. **Financial & Accounting** (9 integrations) - Payment processing, accounting, crypto
10. **Web Scraping & Data Extraction** (9 integrations) - APIs, data collection, parsing
11. **Creative Content & Video Automation** (10 integrations) - Content management, media processing
12. **Cloud Storage & File Management** (7 integrations) - Google Drive, Dropbox, S3
13. **Creative Design Automation** (4 integrations) - Image processing, design tools
14. **Social Media Management** (3 integrations) - LinkedIn, Twitter, Reddit
15. **E-commerce & Retail** (1 integration) - Shopify
16. **Uncategorized** - Workflows not fitting specific categories

## Expert Usage Patterns

### 1. Discovery Phase (FastAPI)
```bash
# Find AI chatbot patterns
curl "http://localhost:8000/api/workflows?query=chatbot+OpenAI&limit=5"

# Browse by business function
curl "http://localhost:8000/api/workflows/category/AI%20Agent%20Development"

# Analyze patterns and complexity
curl "http://localhost:8000/api/stats"
```

**Pro Tips:**
- Use category browsing for business function discovery
- Search with multiple keywords for better filtering
- Analyze trigger types and complexity before implementation

### 2. Configuration Phase (n8n MCP)
```typescript
// Understand specific nodes
mcp__n8n-mcp__get_node_essentials("nodes-base.openAi")

// Get task-specific config
mcp__n8n-mcp__get_node_for_task("chat_with_ai")

// Check property dependencies
mcp__n8n-mcp__get_property_dependencies("nodes-base.openAi")
```

**Pro Tips:**
- Always use `get_node_essentials` first (5KB vs 100KB+ for full schema)
- Check property dependencies to understand conditional fields
- Use task templates for common patterns

### 3. Validation Phase (n8n MCP)
```typescript
// Validate individual nodes
mcp__n8n-mcp__validate_node_operation("nodes-base.openAi", config)

// Validate complete workflow
mcp__n8n-mcp__validate_workflow(workflowJson)

// Check structure and connections
mcp__n8n-mcp__validate_workflow_connections(workflow)
```

**Pro Tips:**
- Validate nodes before building complete workflows
- Use connection validation to catch flow issues early
- Always validate final workflow before deployment

## Advanced Search Strategies

### Category-Based Discovery
```bash
# AI workflows by business function
curl "http://localhost:8000/api/workflows/category/AI%20Agent%20Development"

# Communication patterns
curl "http://localhost:8000/api/workflows/category/Communication%20%26%20Messaging"

# E-commerce integrations
curl "http://localhost:8000/api/workflows/category/E-commerce%20%26%20Retail"
```

### Cross-Integration Analysis
- OpenAI appears in both "AI Agent Development" and "Communication & Messaging"
- Primary service in filename determines category assignment
- Multiple use cases for same service across categories

### Complexity Filtering
- **833 Complex** - Multi-step automations (20+ nodes typically)
- **520 Webhook** - Event-driven workflows
- **477 Manual** - User-triggered processes
- **226 Scheduled** - Time-based automation

## Common Usage Examples

### AI Chatbot Development
```bash
# 1. Discovery - Find patterns
curl "http://localhost:8000/api/workflows?query=chatbot+OpenAI&limit=5"

# 2. Configuration - Setup nodes
mcp__n8n-mcp__get_node_for_task("chat_with_ai")
mcp__n8n-mcp__get_node_essentials("nodes-base.openAi")

# 3. Validation - Verify setup
mcp__n8n-mcp__validate_node_operation("nodes-base.openAi", yourConfig)
```

### Webhook Integration
```bash
# 1. Discovery - Find webhook patterns
curl "http://localhost:8000/api/workflows?query=webhook&trigger=Webhook&limit=10"

# 2. Configuration - Setup webhook
mcp__n8n-mcp__get_node_for_task("receive_webhook")
mcp__n8n-mcp__get_property_dependencies("nodes-base.webhook")

# 3. Validation - Check structure
mcp__n8n-mcp__validate_workflow_connections(workflowJson)
```

### Database Operations
```bash
# 1. Discovery - Find database workflows
curl "http://localhost:8000/api/workflows/category/Data%20Processing%20%26%20Analysis"

# 2. Configuration - Setup database node
mcp__n8n-mcp__get_node_for_task("query_postgres")
mcp__n8n-mcp__list_nodes({category: "database"})

# 3. Validation - Check config
mcp__n8n-mcp__validate_node_minimal("nodes-base.postgres", config)
```

## Performance Tips & Expert Shortcuts

### FastAPI Optimization
- **Category browsing** > keyword search for business function discovery
- **Specific queries** with filters reduce response time
- **Complexity analysis** helps estimate development effort
- **Integration patterns** reveal best practices

### n8n MCP Optimization
- **`get_node_essentials`** > `get_node_info` for speed (5KB vs 100KB+)
- **Task templates** provide pre-validated configurations
- **Property dependencies** prevent configuration errors
- **Validation early** saves debugging time

### Integration Flow
1. **FastAPI category** → Find business function workflows
2. **FastAPI search** → Analyze specific integration patterns
3. **n8n MCP task** → Get pre-configured node templates
4. **n8n MCP validate** → Verify before deployment

## Repository Architecture

### Core Structure
- **`workflows/`** - 2,056 n8n workflow JSON files organized by service (187 directories)
- **`context/`** - Category definitions and workflow-to-category mappings
- **`database/`** - SQLite database with FTS5 search (auto-generated)
- **`static/`** - Web interface assets for FastAPI server

### Key Context Files
- **`context/def_categories.json`** - Integration → category mappings (725 integrations)
- **`context/search_categories.json`** - Workflow → category mappings (2,056 files)
- **`context/unique_categories.json`** - Complete category list (16 categories)

### Workflow Organization
- **File Pattern**: `[ID]_[Service1]_[Service2]_[Purpose]_[Trigger].json`
- **Directory Structure**: `/workflows/Slack/`, `/workflows/OpenAI/`, etc.
- **Naming Logic**: Primary service determines category assignment

## Do Not Rules

- **Never skip validation**: Always use n8n MCP validation before deploying workflows
- **Never use only one tool**: FastAPI and n8n MCP are complementary, not alternatives
- **Never ignore categories**: Category-based discovery is more efficient than keyword-only search
- **Never assume node compatibility**: Always check property dependencies and requirements

## Key Statistics

### FastAPI Database
- **2,056 workflows** analyzed with **29,522 nodes** indexed
- **365 unique integrations** across **16 categories**
- **187 service directories** with comprehensive organization
- **Sub-100ms search** with SQLite FTS5 optimization

### n8n MCP
- **535 nodes** available (**269 AI tools**, **108 triggers**)
- **88% documentation coverage** with comprehensive schemas
- **29 task templates** across 8 categories (HTTP/API, Webhooks, Database, AI/LangChain, etc.)
- **Real-time validation** with immediate feedback

## 📚 References

- **Workflow Categories**: `@context/def_categories.json` - Integration mappings
- **Category Assignments**: `@context/search_categories.json` - File classifications
- **FastAPI Documentation**: `@README.md` - Complete setup and usage guide
- **n8n MCP Tools**: `mcp__n8n-mcp__tools_documentation()` - Comprehensive tool reference

Use both tools together for comprehensive n8n workflow development, analysis, and deployment.