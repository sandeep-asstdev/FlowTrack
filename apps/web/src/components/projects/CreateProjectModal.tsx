import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClient } from '../../services/api';
import { X, Building2, HeartHandshake, Laptop, Sparkles, Calendar, Layers } from 'lucide-react';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (project: any) => void;
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { t } = useTranslation();
  const [step, setStep] = useState<1 | 2>(1);
  const [template, setTemplate] = useState<'blank' | 'real_estate' | 'wedding' | 'agile'>('real_estate');
  const [name, setName] = useState('Green Valley Phase 2 Layout');
  const [description, setDescription] = useState('50-acre residential township development with legal clearances & registration');
  const [targetDate, setTargetDate] = useState('2027-12-31T00:00:00.000Z');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleTemplateSelect = (tmpl: 'blank' | 'real_estate' | 'wedding' | 'agile') => {
    setTemplate(tmpl);
    if (tmpl === 'real_estate') {
      setName('Green Valley Phase 2 Township');
      setDescription('Real Estate: Planning, Layout Confirmation, Legal, Payment, Handover');
    } else if (tmpl === 'wedding') {
      setName('Sharma-Verma Grand Wedding');
      setDescription('Event blueprint: Budget & Venue, Catering, Vendor Approvals, Guest List');
    } else if (tmpl === 'agile') {
      setName('Mobile App Release Sprint 14');
      setDescription('Product sprint: Discovery, UI Specs, Development, QA, Deployment');
    } else {
      setName('New Blank Project');
      setDescription('Clean infinite canvas');
    }
    setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const project = await ApiClient.createProject({
        name,
        description,
        targetDate: targetDate || undefined,
        settings: { templateType: template },
      });

      // If user selected a template, populate blueprint nodes and edges automatically!
      if (template !== 'blank') {
        await populateTemplateNodes(project.id, template);
      }

      onSuccess(project);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  const populateTemplateNodes = async (projectId: string, tmpl: string) => {
    try {
      const nodeTypes = await ApiClient.getNodeTypes();
      const taskType = nodeTypes.find((n: any) => n.key === 'task') || nodeTypes[0];
      const stageType = nodeTypes.find((n: any) => n.key === 'stage') || taskType;
      const approvalType = nodeTypes.find((n: any) => n.key === 'approval') || taskType;
      const docType = nodeTypes.find((n: any) => n.key === 'doc_request') || taskType;

      if (tmpl === 'real_estate') {
        // Create 5-stage real estate graph with connections
        const n1 = await ApiClient.createNode({
          projectId,
          nodeTypeId: stageType.id,
          title: '1. Layout Planning & Survey',
          description: 'Boundary demarcations, contour survey, and physical pillars',
          positionX: 100,
          positionY: 200,
          progressPct: 100,
        });

        const n2 = await ApiClient.createNode({
          projectId,
          nodeTypeId: stageType.id,
          title: '2. Layout Confirmation',
          description: 'Town planning sanction and master layout verification',
          positionX: 460,
          positionY: 200,
          progressPct: 75,
        });

        const n3 = await ApiClient.createNode({
          projectId,
          nodeTypeId: approvalType.id,
          title: '3. Legal Clearances & RERA',
          description: 'Pollution control board NOC, revenue report, RERA certification',
          positionX: 820,
          positionY: 200,
          progressPct: 40,
        });

        const n4 = await ApiClient.createNode({
          projectId,
          nodeTypeId: docType.id,
          title: '4. Customer Payment Milestones',
          description: 'Allotment letters, agreement execution, bank loan approvals',
          positionX: 1180,
          positionY: 200,
          progressPct: 10,
        });

        const n5 = await ApiClient.createNode({
          projectId,
          nodeTypeId: taskType.id,
          title: '5. Site Handover & Possession',
          description: 'Physical plot marking, khata transfer, and registered sale deed',
          positionX: 1540,
          positionY: 200,
          progressPct: 0,
        });

        // Connect them with sequence edges
        await ApiClient.createEdge({ projectId, sourceNodeId: n1.id, targetNodeId: n2.id, kind: 'sequence' });
        await ApiClient.createEdge({ projectId, sourceNodeId: n2.id, targetNodeId: n3.id, kind: 'sequence' });
        await ApiClient.createEdge({ projectId, sourceNodeId: n3.id, targetNodeId: n4.id, kind: 'sequence' });
        await ApiClient.createEdge({ projectId, sourceNodeId: n4.id, targetNodeId: n5.id, kind: 'sequence' });
      } else if (tmpl === 'wedding') {
        const w1 = await ApiClient.createNode({
          projectId,
          nodeTypeId: stageType.id,
          title: 'Venue & Dates Finalisation',
          positionX: 100,
          positionY: 200,
          progressPct: 100,
        });
        const w2 = await ApiClient.createNode({
          projectId,
          nodeTypeId: taskType.id,
          title: 'Catering Menu Tasting',
          positionX: 460,
          positionY: 200,
          progressPct: 60,
        });
        const w3 = await ApiClient.createNode({
          projectId,
          nodeTypeId: approvalType.id,
          title: 'Decor & Theme Sign-Off',
          positionX: 820,
          positionY: 200,
          progressPct: 20,
        });
        await ApiClient.createEdge({ projectId, sourceNodeId: w1.id, targetNodeId: w2.id, kind: 'sequence' });
        await ApiClient.createEdge({ projectId, sourceNodeId: w2.id, targetNodeId: w3.id, kind: 'sequence' });
      }
    } catch (e) {
      console.warn('Could not populate blueprint nodes:', e);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-500" />
              {step === 1 ? 'Choose Blueprint Template' : 'Configure Project Details'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Step {step} of 2
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === 1 && (
          <div className="p-6 space-y-3">
            {/* Real estate template */}
            <button
              id="tmpl-real-estate-btn"
              onClick={() => handleTemplateSelect('real_estate')}
              className="w-full text-left p-4 rounded-xl border-2 border-blue-500 bg-blue-50/40 dark:bg-blue-950/20 hover:border-blue-600 transition-all flex items-start gap-4 group"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-md">
                <Building2 className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-slate-900 dark:text-white">
                    Real Estate Layout Execution (Recommended)
                  </span>
                  <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 bg-blue-600 text-white rounded-full">
                    Pre-configured
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  Planning &rarr; Layout Confirmation &rarr; Legal Clearances &rarr; Payment &rarr; Handover with node cards and connected stages.
                </p>
              </div>
            </button>

            {/* Wedding template */}
            <button
              onClick={() => handleTemplateSelect('wedding')}
              className="w-full text-left p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-pink-500 hover:bg-pink-50/30 dark:hover:bg-pink-950/10 transition-all flex items-start gap-4"
            >
              <div className="w-10 h-10 rounded-xl bg-pink-500 text-white flex items-center justify-center shrink-0 shadow-md">
                <HeartHandshake className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="font-bold text-sm text-slate-900 dark:text-white">
                  Grand Wedding & Event Production
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Budget & Venue, Catering, Vendor Approvals, and Guest Invitation graph.
                </p>
              </div>
            </button>

            {/* Agile template */}
            <button
              onClick={() => handleTemplateSelect('agile')}
              className="w-full text-left p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-purple-500 hover:bg-purple-50/30 dark:hover:bg-purple-950/10 transition-all flex items-start gap-4"
            >
              <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-md">
                <Laptop className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="font-bold text-sm text-slate-900 dark:text-white">
                  Software Sprint & Release
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Discovery, Development, Code Review, QA, and Production Deployment.
                </p>
              </div>
            </button>

            {/* Blank */}
            <button
              onClick={() => handleTemplateSelect('blank')}
              className="w-full text-left p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-start gap-4"
            >
              <div className="w-10 h-10 rounded-xl bg-slate-600 text-white flex items-center justify-center shrink-0 shadow-md">
                <Layers className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="font-bold text-sm text-slate-900 dark:text-white">
                  Blank Infinite Canvas
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Start from scratch with a clean slate.
                </p>
              </div>
            </button>
          </div>
        )}

        {step === 2 && (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 text-rose-600 text-xs">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Project Name
              </label>
              <input
                id="project-name-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Target Handover Date
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="date"
                  value={targetDate.split('T')[0]}
                  onChange={(e) => setTargetDate(new Date(e.target.value).toISOString())}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300"
              >
                &larr; Back
              </button>
              <button
                id="launch-canvas-btn"
                type="submit"
                disabled={loading}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 disabled:opacity-50"
              >
                {loading ? 'Creating Canvas...' : '🚀 Launch Canvas'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
