import type { StudioCommandDefinition } from './types.js';

export const STUDIO_COMMAND_DEFINITIONS: StudioCommandDefinition[] = [
  {
    title: 'Help',
    command: 'help',
    description: 'List the supported Studio commands and starter templates.',
    mutating: false,
  },
  {
    title: 'Agent Status',
    command: 'agent status',
    description: 'Show the current agent ID, quotas, installed skill count, and available tool count.',
    mutating: false,
  },
  {
    title: 'Tools List',
    command: 'tools list',
    description: 'List all available Agent OS primitive, skill, and external MCP tools.',
    mutating: false,
  },
  {
    title: 'Tool Run',
    command: 'tool run agentos.mem_get --json {"key":"hello"}',
    description: 'Execute a tool through the universal MCP registry. Mutating tools require confirmation.',
    mutating: false,
  },
  {
    title: 'MCP List',
    command: 'mcp list',
    description: 'List active external MCP servers and their exposed tools.',
    mutating: false,
  },
  {
    title: 'MCP Call',
    command: 'mcp call gmail send_email --json {"to":"team@example.com","subject":"Status","body":"All systems go."}',
    description: 'Preview and execute a call to an external MCP server.',
    mutating: true,
  },
  {
    title: 'Skills Search',
    command: 'skills search parser',
    description: 'Search the marketplace by name, description, category, or tag.',
    mutating: false,
  },
  {
    title: 'Skills Install',
    command: 'skills install pdf-processor',
    description: 'Preview and install a published skill by slug or UUID.',
    mutating: true,
  },
  {
    title: 'Skills Use',
    command: 'skills use pdf-processor read_pdf --json {"file_path":"/docs/report.pdf"}',
    description: 'Preview and run an installed skill capability.',
    mutating: true,
  },
  {
    title: 'Scaffold Agent',
    command: 'scaffold agent starter',
    description: 'Preview and write a starter spec, README, config, and example file into agent storage.',
    mutating: true,
  },
  {
    title: 'Deploy Snippet',
    command: 'deploy snippet',
    description: 'Generate the fetch helper and boilerplate needed to use Agent OS from code.',
    mutating: false,
  },
  {
    title: 'Advanced Sandbox Run',
    command: 'advanced run python --code print("hello from Agent OS")',
    description: 'Run code in the sandboxed process primitive after enabling advanced mode for the current browser session.',
    mutating: true,
    requiresAdvancedMode: true,
  },
];

export const STUDIO_TEMPLATE_COMMANDS = STUDIO_COMMAND_DEFINITIONS.map(item => item.command);
