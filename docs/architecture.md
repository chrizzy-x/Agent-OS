# AgentOS Application Architecture

The root layout mounts a persistent client shell for product and Docs routes. Authentication, password recovery, and onboarding remain outside the shell.

The shell has four stable regions:

1. Fixed operating header
2. Persistent left workspace/navigation rail
3. Route content
4. Persistent right context rail

Route content changes through Next.js client navigation. The shell remains mounted, retains local UI state, and refreshes its factual workspace/session/project bootstrap independently.

Studio is a module within this shell. `StudioProvider` owns conversation, execution, workflow, code, terminal, and streaming state. Studio contributes mode-specific context through the shell’s right-panel slot.
