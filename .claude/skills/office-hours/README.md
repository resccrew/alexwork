# gstack-office-hours

**YC Office Hours for AI Agents** — Garry Tan's product diagnostic and design thinking skill for Claude Code.

## What It Does

Transforms AI agents into YC-style office hours partners:

- **Startup Mode**: 6 forcing questions that expose demand reality, status quo, desperate specificity, narrowest wedge, observation, and future-fit
- **Builder Mode**: Enthusiastic design brainstorming for side projects, hackathons, learning, and open source
- **Output**: Production-ready design docs saved to `~/.gstack/projects/`

## Origin

Part of [gstack](https://github.com/garrytan/gstack) — Garry Tan's 23-skill AI engineering system. Garry ships **810× more code** than his 2013 pace using this system.

## Installation

### For OpenClaw

```bash
clawhub install gstack-openclaw-office-hours
```

### For Claude Code (gstack full install)

```bash
git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
cd ~/.claude/skills/gstack && ./setup
```

## Usage

### Triggers

The skill auto-invokes when you:
- Say "brainstorm this" or "office hours"
- Ask "is this worth building?"
- Describe a new product idea
- Want to think through design decisions before coding

### What You Get

1. **Context gathering** — Reads your codebase, git history, prior design docs
2. **Mode detection** — Startup (hard questions) vs Builder (enthusiastic collaborator)
3. **Forcing questions** — One at a time, pushed until answers are specific and evidence-based
4. **Premise challenge** — Tests assumptions before solutions
5. **Cross-model second opinion** — Optional Codex or subagent review
6. **Alternatives generation** — 2-3 distinct approaches with tradeoffs
7. **Design doc** — Saved to `~/.gstack/projects/{slug}/{user}-{branch}-design-{datetime}.md`
8. **Spec review loop** — Adversarial subagent reviewer, up to 3 iterations
9. **Relationship closing** — Tiered based on session history (first-timer to inner circle)

## Files

| File | Description |
|------|-------------|
| `SKILL.md` | Full skill definition (preamble + workflow) |
| `SKILL.md.tmpl` | Template for regeneration |

## Design Doc Template

Startup mode produces:
```markdown
# Design: {title}
- Problem Statement (from forcing questions)
- Demand Evidence (specific quotes, numbers, behaviors)
- Status Quo (current workaround)
- Target User & Narrowest Wedge
- Premises (challenged and agreed)
- Cross-Model Perspective (Codex/subagent cold read)
- Approaches Considered (2-3 with tradeoffs)
- Recommended Approach
- Distribution Plan (how users get it)
- The Assignment (one concrete next action)
- What I noticed about how you think
```

## Philosophy

**Boil the Lake**: AI makes completeness cheap. Recommend complete solutions (tests, edge cases, error paths); flag oceans (rewrites, multi-quarter migrations).

**Search Before Building**: Layer 1 (tried and true), Layer 2 (new and popular), Layer 3 (first principles). Log eureka moments when Layer 3 contradicts conventional wisdom.

**Specificity is Currency**: "Enterprises in healthcare" is not a customer. "Sarah, ops manager at 50-person logistics company" is.

## License

MIT-0 (Free to use, modify, redistribute. No attribution required.)

## Related

- Full gstack: https://github.com/garrytan/gstack
- Garry's List: https://garryslist.org
- Y Combinator Apply: https://ycombinator.com/apply?ref=gstack
