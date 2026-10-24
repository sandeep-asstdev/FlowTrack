import React from 'react';
import { UniversalDashboard } from '../reports/UniversalDashboard';

interface ProjectReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: any;
  nodes?: any[];
}

export const ProjectReportModal: React.FC<ProjectReportModalProps> = ({
  isOpen,
  onClose,
  project,
  nodes,
}) => {
  if (!isOpen || !project?.id) return null;

  return (
    <UniversalDashboard
      projectId={project.id}
      project={project}
      nodes={nodes}
      onClose={onClose}
      isModal={true}
    />
  );
};
