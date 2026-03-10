# @vitamin/orchestrator

Multi-agent orchestration engine with 14 specialized agents, task dispatch, category-based model resolution, Plan/Build pipeline, and DAG executor.

## Installation

```bash
pnpm add @vitamin/orchestrator
```

## Usage

```typescript
import { createAgentRegistry, createTaskDispatcher, createCentralSecretariatAgent } from '@vitamin/orchestrator'

const registry = createAgentRegistry()
registry.register(createCentralSecretariatAgent())

const dispatcher = createTaskDispatcher({ registry })
const handle = await dispatcher.dispatch({
  category: 'code',
  prompt: 'Refactor the auth module',
})
```

## Key Exports

| Export | Description |
|--------|-------------|
| `AgentRegistry`, `createAgentRegistry` | Agent registration and lookup |
| `CategoryResolver`, `createCategoryResolver` | Category-based model resolution |
| `TaskDispatcherImpl`, `createTaskDispatcher` | Task dispatch to agents |
| `BackgroundManager`, `createBackgroundManager` | Background task management |
| `executeSyncTask` | Synchronous task execution |

### Agent Factories (14)

`createCentralSecretariatAgent`, `createHephaestusAgent`, `createExploreAgent`, `createOracleAgent`, `createLibrarianAgent`, `createSisyphusJuniorAgent`, `createMetisAgent`, `createMomusAgent`, `createMultimodalLookerAgent`, `createPrometheusAgent`, `createAtlasAgent`

### Plan/Build Utilities

`planToMarkdown`, `markdownToPlan`, `buildDag`, `getReadyNodes`, `createInterviewState`, `extractInterviewQuestions`, `buildInterviewPrompt`

## Types

`AgentMode`, `AgentCategory`, `TaskRequest`, `TaskStatus`, `TaskHandle`, `AgentRegistration`, `PlanFamilyAgent`, `CategoryResolverOptions`

## License

See [root README](../../README.md) for details.
