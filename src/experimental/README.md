# Evolving Modules

These modules **ship in every CodeYang build** and are wired into the main
product. The directory name reflects that their internal APIs may still change
between minor versions — it does **not** mean they are dead code or off by
default.

## What's in here

| Module | Lines | Wired into | Activation |
|--------|------:|-----------|------------|
| `qt/` | ~5.0k | `index.ts`, `web-server.ts`, `agent/Agent.ts`, `agent/config.ts` | Auto-enabled when a Qt project is detected (`detectQtProject`) |
| `reflexion/` | ~3.2k | `agent/Agent.ts`, `agent/AgentToolExecutor.ts` | Always on (`CritiqueEngine` defaults to `enabled: true`) |
| `continual-learning/` | ~1.0k | `agent/Agent.ts` (`runConsolidation`, every 10 iterations) | Always on |

## Stability

- **Behavior**: exercised by the main test suite; covered by `src/experimental/**/*.test.ts`.
- **API**: internal — signatures may change in a minor release without a major bump.
- **Support**: bugs are fixed like any other module; nothing here is deprecated.

Treat these as *beta-quality shipped features*, not as prototypes parked in a
corner.

## Promoting to `src/`

A module graduates out of `experimental/` when its public surface has been
stable for 3+ releases. Until then it lives here so the API churn is visible in
one place.
