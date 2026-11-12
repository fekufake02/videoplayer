'use client';

import React, { useState } from 'react';
import {
  DecoyConfig,
  DecoyPreset,
  DECOY_PRESET_DATA,
  verifyDecoyExitPin,
} from '../lib/decoyManager';
import {
  BookOpen,
  CheckSquare,
  FileSpreadsheet,
  Search,
  Lock,
  ArrowRight,
  ChevronRight,
  Calendar,
  Folder,
  FileText,
  Clock,
  Sparkles,
  HelpCircle,
  X,
  ExternalLink,
} from 'lucide-react';

interface DecoyInterfaceProps {
  config: DecoyConfig;
  onExit: (pinOrPassword: string) => boolean;
}

export const DecoyInterface: React.FC<DecoyInterfaceProps> = ({ config, onExit }) => {
  const [activeTab, setActiveTab] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showExitModal, setShowExitModal] = useState<boolean>(false);
  const [exitInput, setExitInput] = useState<string>('');
  const [exitError, setExitError] = useState<string>('');

  // Interactive state for Tasks preset
  const [tasks, setTasks] = useState(DECOY_PRESET_DATA.tasks.tasks);

  const toggleTask = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
    );
  };

  const handleExitSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!exitInput) return;
    const success = onExit(exitInput);
    if (!success) {
      setExitError('Invalid authorization key or PIN.');
    } else {
      setShowExitModal(false);
      setExitInput('');
      setExitError('');
    }
  };

  const currentPreset = config.preset || 'research';

  return (
    <div className="fixed inset-0 z-[10000] bg-[#0c111d] text-slate-200 flex flex-col font-sans select-none overflow-y-auto">
      {/* Top Harmless Academic / Work Navigation Bar */}
      <header className="sticky top-0 z-50 bg-[#161f30]/90 border-b border-slate-800/80 backdrop-blur-md px-4 sm:px-8 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          {/* Harmless Brand Logo - double click discreetly triggers vault return */}
          <button
            type="button"
            onDoubleClick={() => setShowExitModal(true)}
            title="Academic Research Portal (Double click to unlock vault)"
            className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center font-bold text-sm hover:bg-indigo-600/30 transition-all cursor-default"
          >
            {currentPreset === 'research' && <BookOpen className="w-4 h-4" />}
            {currentPreset === 'tasks' && <CheckSquare className="w-4 h-4" />}
            {currentPreset === 'spreadsheet' && <FileSpreadsheet className="w-4 h-4" />}
          </button>
          <div>
            <h1 className="text-sm sm:text-base font-semibold text-white tracking-tight flex items-center gap-2">
              <span>{config.title || 'Academic Research Portal'}</span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/60 hidden sm:inline">
                Verified
              </span>
            </h1>
          </div>
        </div>

        {/* Search input to look completely authentic */}
        <div className="flex-1 max-w-xs mx-4 hidden md:block">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search syllabus, notes, references..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-900/80 border border-slate-700/60 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-mono hidden sm:inline">
            Term: Fall 2026
          </span>
          {/* Discreet exit trigger button */}
          <button
            onClick={() => setShowExitModal(true)}
            className="p-1.5 rounded-lg bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-slate-200 text-xs transition-colors"
            title="Portal Access"
          >
            <Lock className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Preset Interface Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Sub-navigation tabs */}
        <div className="flex items-center gap-2 border-b border-slate-800/80 pb-3 overflow-x-auto">
          {currentPreset === 'research' &&
            DECOY_PRESET_DATA.research.tabs.map((tab, idx) => (
              <button
                key={idx}
                onClick={() => setActiveTab(idx)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  activeTab === idx
                    ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                {tab}
              </button>
            ))}

          {currentPreset === 'tasks' &&
            DECOY_PRESET_DATA.tasks.tabs.map((tab, idx) => (
              <button
                key={idx}
                onClick={() => setActiveTab(idx)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  activeTab === idx
                    ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                {tab}
              </button>
            ))}

          {currentPreset === 'spreadsheet' &&
            DECOY_PRESET_DATA.spreadsheet.tabs.map((tab, idx) => (
              <button
                key={idx}
                onClick={() => setActiveTab(idx)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  activeTab === idx
                    ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                {tab}
              </button>
            ))}
        </div>

        {/* View 1: Academic Research & Lecture Notes */}
        {currentPreset === 'research' && (
          <div className="space-y-6">
            <div className="bg-[#141b2a] border border-slate-800/90 rounded-2xl p-6 sm:p-8 space-y-4 shadow-sm">
              <div className="flex items-center gap-2 text-indigo-400 text-xs font-medium">
                <Folder className="w-3.5 h-3.5" />
                <span>PHYS-402 Quantum Systems & Computation</span>
                <span className="text-slate-600">•</span>
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-slate-400">Updated Yesterday, 14:22</span>
              </div>

              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                {DECOY_PRESET_DATA.research.tabs[activeTab] || 'Lecture Summary'}
              </h2>

              <div className="prose prose-invert max-w-none text-slate-300 text-sm leading-relaxed whitespace-pre-line border-t border-slate-800/80 pt-4 font-mono sm:font-sans">
                {DECOY_PRESET_DATA.research.documentContent}
              </div>

              <div className="border-t border-slate-800/80 pt-4 flex flex-wrap gap-2 text-xs">
                <span className="px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-md text-slate-400">
                  Topic: Quantum Circuits
                </span>
                <span className="px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-md text-slate-400">
                  Credits: 4.0
                </span>
                <span className="px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-md text-slate-400">
                  Instructor: Prof. Sterling
                </span>
              </div>
            </div>

            {/* Supplementary reference tiles */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {['Bell Inequality Proof.pdf', 'Shor Algorithm Circuit.png', 'Midterm Study Guide.tex'].map((doc, i) => (
                <div
                  key={i}
                  className="bg-[#141b2a] border border-slate-800/90 rounded-xl p-4 flex items-center justify-between hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span className="text-xs text-slate-200 truncate">{doc}</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* View 2: Project Tasks Board */}
        {currentPreset === 'tasks' && (
          <div className="space-y-4">
            <div className="bg-[#141b2a] border border-slate-800/90 rounded-2xl p-6 space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white">Sprint 14 Deliverables</h2>
                  <p className="text-xs text-slate-400">4 active milestones assigned to team.</p>
                </div>
                <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
                  {tasks.filter((t) => t.done).length} / {tasks.length} Completed
                </span>
              </div>

              <div className="space-y-2 pt-2">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => toggleTask(task.id)}
                    className="flex items-center justify-between p-3.5 bg-slate-900/80 hover:bg-slate-900 border border-slate-800/80 rounded-xl cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={task.done}
                        onChange={() => {}}
                        className="rounded border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
                      />
                      <span className={`text-xs sm:text-sm ${task.done ? 'line-through text-slate-500' : 'text-slate-200 font-medium'}`}>
                        {task.title}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/60">
                      {task.tag}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* View 3: Corporate Financial Spreadsheet */}
        {currentPreset === 'spreadsheet' && (
          <div className="bg-[#141b2a] border border-slate-800/90 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-800/90 flex items-center justify-between bg-slate-900/60">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span>Operating Budget & Infrastructure Run Rate</span>
              </h2>
              <span className="text-xs font-mono text-slate-400">Currency: USD</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                  <tr>
                    {DECOY_PRESET_DATA.spreadsheet.columns.map((col, i) => (
                      <th key={i} className="px-4 py-3 font-semibold">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {DECOY_PRESET_DATA.spreadsheet.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-slate-800/30 transition-colors">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className={`px-4 py-3 font-mono ${cIdx === 0 ? 'text-slate-200 font-sans' : 'text-slate-300'}`}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Discreet Exit Authentication Modal */}
      {showExitModal && (
        <div className="fixed inset-0 z-[10001] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-sm w-full bg-[#121927] border border-slate-700/80 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-400" />
                <span>Authorized Vault Access</span>
              </h3>
              <button
                onClick={() => {
                  setShowExitModal(false);
                  setExitError('');
                  setExitInput('');
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Enter master vault password or decoy exit PIN to exit decoy mode.
            </p>

            {exitError && (
              <div className="p-2.5 text-xs bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl">
                {exitError}
              </div>
            )}

            <form onSubmit={handleExitSubmit} className="space-y-3">
              <input
                type="password"
                placeholder="Enter password or PIN..."
                value={exitInput}
                onChange={(e) => setExitInput(e.target.value)}
                autoFocus
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
              />

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowExitModal(false)}
                  className="px-3 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-black font-semibold text-xs rounded-xl shadow-lg shadow-amber-400/10 transition-all flex items-center gap-1.5"
                >
                  <span>Return to Vault</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
