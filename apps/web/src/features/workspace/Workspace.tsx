import type { CurrentUser } from '../../types';
import { WorkspaceShell } from './WorkspaceShell';
import { useWorkspaceController } from './useWorkspaceController';

export function Workspace({
  user,
  onLogout,
}: {
  user: CurrentUser;
  onLogout: () => Promise<void>;
}) {
  return <WorkspaceShell {...useWorkspaceController(user, onLogout)} />;
}
