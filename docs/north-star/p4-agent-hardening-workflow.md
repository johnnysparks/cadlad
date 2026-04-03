# P4 — Agent Hardening Workflow

## Purpose

Make it easier for agents to encode recurring assumptions into local strict features, validators, and in-source tests instead of re-explaining patterns in chat.

## In scope

- Workflow to promote repeated edit patterns into project-local wrappers.
- Co-located validators and tests for hardened wrappers.
- Clear diagnostics that map local feature rule violations to primitive-level causes.

## Out of scope

- Replacing base primitives with one-off wrappers.
- Implicit hardening without explicit local contracts.

## Interfaces this enables

- Repeatable, safer agent behavior over long sessions.
- Portable design intent that survives prompt/context changes.
- Faster onboarding via explicit local feature contracts.

## First milestone

- Define a documented pattern/template for project-local strict feature wrappers.
- Require at least one validator + one inline test per new wrapper.
- Add a small "harden this pattern" checklist to modeling workflow docs.

## Done signal

A recurring modeling pattern can be promoted into a strict local feature in one PR, with tests proving the hardened behavior.
