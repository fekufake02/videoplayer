/**
 * Decoy mode manager and configuration definitions
 */

export type DecoyPreset = 'research' | 'tasks' | 'spreadsheet';

export interface DecoyConfig {
  enabled: boolean;
  preset: DecoyPreset;
  title: string;
  shortcut: string; // e.g. "Alt+D"
  exitPin: string;
}

export const DEFAULT_DECOY_CONFIG: DecoyConfig = {
  enabled: true,
  preset: 'research',
  title: 'Quantum Computing Lecture Notes & Syllabus',
  shortcut: 'Alt+D',
  exitPin: '1234',
};

/**
 * Checks if a keyboard event matches the configured decoy shortcut
 */
export function isDecoyShortcutPressed(
  e: { key: string; altKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; metaKey?: boolean },
  shortcut: string = 'Alt+D'
): boolean {
  const parts = shortcut.split('+').map((p) => p.trim().toLowerCase());
  const keyPart = parts[parts.length - 1];
  const requiresAlt = parts.includes('alt');
  const requiresCtrl = parts.includes('ctrl') || parts.includes('control');
  const requiresShift = parts.includes('shift');
  const requiresMeta = parts.includes('meta') || parts.includes('cmd') || parts.includes('command');

  if (requiresAlt && !e.altKey) return false;
  if (!requiresAlt && e.altKey) return false;

  if (requiresCtrl && !e.ctrlKey) return false;
  if (!requiresCtrl && e.ctrlKey) return false;

  if (requiresShift && !e.shiftKey) return false;
  if (!requiresShift && e.shiftKey) return false;

  if (requiresMeta && !e.metaKey) return false;
  if (!requiresMeta && e.metaKey) return false;

  return e.key.toLowerCase() === keyPart.toLowerCase();
}

/**
 * Validates a Decoy exit PIN or master credential
 */
export function verifyDecoyExitPin(inputPin: string, expectedPin: string): boolean {
  if (!inputPin || !expectedPin) return false;
  return inputPin.trim() === expectedPin.trim();
}

/**
 * Default mock data for decoy interfaces
 */
export const DECOY_PRESET_DATA = {
  research: {
    category: 'Computer Science & Physics',
    tabs: ['Lecture 01: Qubits & Superposition', 'Lecture 02: Entanglement & Bell States', 'Reading List 2026'],
    documentContent: `### Module 4: Superposition and Quantum Measurement\n\nIn quantum information science, the state of a two-level quantum system (qubit) is expressed as a normalized vector in a two-dimensional complex Hilbert space:\n\n|ψ⟩ = α|0⟩ + β|1⟩\n\nWhere |α|² + |β|² = 1. Upon measurement in the computational basis {|0⟩, |1⟩}, the probability of observing outcome 0 is P(0) = |α|², and outcome 1 is P(1) = |β|².\n\nKey References:\n1. Nielsen & Chuang, Quantum Computation and Quantum Information.\n2. Preskill lecture notes on Quantum Algorithms.`,
  },
  tasks: {
    category: 'Project Management & Sprint 14',
    tabs: ['Sprint Backlog', 'Architecture Review', 'Infrastructure Milestones'],
    tasks: [
      { id: '1', title: 'Complete distributed ledger database sync benchmark', done: true, tag: 'Database' },
      { id: '2', title: 'Prepare slide deck for quarterly stakeholder review', done: false, tag: 'Docs' },
      { id: '3', title: 'Audit SSL certificates and DNS failover health-checks', done: true, tag: 'Infra' },
      { id: '4', title: 'Review pull request #284 on query optimization', done: false, tag: 'Backend' },
    ],
  },
  spreadsheet: {
    category: 'Corporate Finance & Budgeting',
    tabs: ['Q4 Forecast', 'Operating Expenses', 'Asset Depreciation'],
    columns: ['Category', 'Budget (USD)', 'Actual (USD)', 'Variance', 'Status'],
    rows: [
      ['Cloud Compute & Hosting', '$14,200', '$13,850', '+$350', 'On Track'],
      ['Storage Tier Backblaze & S3', '$6,500', '$6,120', '+$380', 'Optimal'],
      ['Network Bandwidth / CDN', '$3,800', '$4,100', '-$300', 'Review'],
      ['Security Compliance & Audit', '$8,000', '$8,000', '$0', 'Completed'],
    ],
  },
};
