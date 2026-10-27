import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Archive, ArchiveRestore, ChevronDown, ChevronLeft, ChevronRight, Edit3, ExternalLink, MoreHorizontal, Pin, PinOff, Plus, RefreshCw, Share2, Trash2 } from 'lucide-react';
import type { AppLanguage, JoinedProject, Project, ProjectMemberRole, ProjectShareStatus, Setlist, ShareParticipant } from '../types';
import { AnimatedPopover } from './ui/InteractionMotion';
import { useAnchoredPortalPanel } from './useAnchoredPortalPanel';
import './ProjectManagementPanel.css';

type Action = { label: string; icon: ReactNode; run: () => void; danger?: boolean; disabled?: boolean };
export function ManagementActions({ label, actions, disabled = false, triggerContent }: { label: string; actions: Action[]; disabled?: boolean; triggerContent?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = useCallback(() => setOpen(false), []);
  const { panelStyle, placement, isPositioned, transformOrigin } = useAnchoredPortalPanel({ isOpen: open, align: 'right', triggerRef: trigger, panelRef: panel, onRequestClose: close });
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!trigger.current?.contains(event.target as Node) && !panel.current?.contains(event.target as Node)) close(); };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open, close]);
  useEffect(() => { if (open && isPositioned) panel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true }); }, [open, isPositioned]);
  return <>
    <button ref={trigger} type='button' className={triggerContent ? 'pm-new-button' : 'pm-icon-button'} disabled={disabled} aria-label={label} aria-haspopup='menu' aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}>{triggerContent ?? <MoreHorizontal size={19} />}</button>
    {createPortal(<AnimatedPopover open={open} ready={isPositioned} origin={transformOrigin} panelRef={panel} id={id} role='menu' aria-label={label} data-placement={placement} style={panelStyle} className='pm-actions-menu'
      onKeyDown={event => {
        const buttons = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
          buttons[next]?.focus();
        }
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); trigger.current?.focus({ preventScroll: true }); }
        if (event.key === 'Tab') { close(); trigger.current?.focus({ preventScroll: true }); }
      }}>
      {actions.map(action => <button key={action.label} type='button' role='menuitem' disabled={action.disabled} className={'pm-menu-item' + (action.danger ? ' danger' : '')} onClick={() => { close(); trigger.current?.focus({ preventScroll: true }); action.run(); }}>{action.icon}<span>{action.label}</span></button>)}
    </AnimatedPopover>, document.body)}
  </>;
}

interface Props {
  language: AppLanguage;
  projects: Project[];
  joinedProjects: JoinedProject[];
  setlists: Setlist[];
  project: Project | null;
  showArchived: boolean;
  archivedOnly?: boolean;
  archivedCount: number;
  canCreate: boolean;
  canManage: (project: Project) => boolean;
  canShare: (project: Project) => boolean;
  canViewMembers: boolean;
  memberStatus: ProjectShareStatus | null;
  membersLoading: boolean;
  membersError: boolean;
  sharing: boolean;
  projectBackLabel?: string;
  onBack: () => void;
  onInspect: (id: string | null) => void;
  onCreate: () => void;
  onToggleArchived: () => void;
  onOpenProject: (id: string) => void;
  onOpenJoinedProject: (id: string) => void;
  onOpenSetlist: (id: string) => void;
  onRename: (project: Project) => void;
  onArchive: (project: Project) => void;
  onDelete: (project: Project) => void;
  onShare: (project: Project) => void;
  onRefreshMembers: (id: string) => void;
  onRoleChange: (project: Project, member: ShareParticipant, role: ProjectMemberRole) => Promise<void>;
  onRemoveMember: (project: Project, member: ShareParticipant) => void;
  pinnedProjectIds?: ReadonlySet<string>;
  onTogglePin?: (projectId: string) => void;
}

export default function ProjectManagementPanel(props: Props) {
  const { language, projects, joinedProjects, setlists, project, memberStatus, membersLoading, membersError, canViewMembers } = props;
  const zh = language === 'zh';
  const scroll = useRef<HTMLDivElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const rows = useRef(new Map<string, HTMLButtonElement>());
  const previousProject = useRef<string | null>(null), indexScrollTop = useRef(0);
  const [pendingRole, setPendingRole] = useState<{ key: string; projectId: string; role: ProjectMemberRole } | null>(null);
  useLayoutEffect(() => {
    const previous = previousProject.current;
    if (project?.id === previous) return;
    if (project) { if (scroll.current) scroll.current.scrollTop = 0; heading.current?.focus({ preventScroll: true }); }
    else if (previous) { if (scroll.current) scroll.current.scrollTop = indexScrollTop.current; (rows.current.get(previous) ?? heading.current)?.focus({ preventScroll: true }); }
    previousProject.current = project?.id ?? null;
  }, [project?.id]);
  const inspect = (id: string) => { indexScrollTop.current = scroll.current?.scrollTop ?? 0; props.onInspect(id); };
  const countSetlists = (id: string) => setlists.filter(item => item.projectId === id && !item.archived).length;
  const projectSetlists = project ? setlists.filter(item => item.projectId === project.id && !item.archived) : [];
  const participants = memberStatus?.participants ?? [];
  const pendingHere = pendingRole?.projectId === project?.id;
  const changeRole = async (member: ShareParticipant, role: ProjectMemberRole) => {
    if (!project || role === (member.role ?? 'viewer')) return;
    const key = project.id + '|' + member.userId;
    setPendingRole({ key, projectId: project.id, role });
    try { await props.onRoleChange(project, member, role); }
    finally { setPendingRole(current => current?.key === key ? null : current); }
  };
  const projectActions: Action[] = project ? [
    { label: zh ? '開啟專案歌單' : 'Open project setlists', icon: <ExternalLink size={16} />, run: () => props.onOpenProject(project.id) },
    ...(props.onTogglePin && !project.archived ? [{ label: props.pinnedProjectIds?.has(project.id) ? (zh ? '取消置頂' : 'Unpin project') : (zh ? '置頂專案' : 'Pin project'), icon: props.pinnedProjectIds?.has(project.id) ? <PinOff size={16}/> : <Pin size={16}/>, run: () => props.onTogglePin?.(project.id) }] : []),
    ...(props.canManage(project) ? [
      { label: zh ? '重新命名' : 'Rename', icon: <Edit3 size={16} />, run: () => props.onRename(project) },
      { label: project.archived ? (zh ? '取消歸檔' : 'Unarchive') : (zh ? '歸檔專案' : 'Archive project'), icon: project.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />, run: () => props.onArchive(project) },
      { label: zh ? '刪除專案' : 'Delete project', icon: <Trash2 size={16} />, run: () => props.onDelete(project), danger: true }
    ] : [])
  ] : [];
  return <div lang={zh ? 'zh-Hant' : 'en'} className='project-manager' data-project-management>
    <header className='pm-header'>
      <button type='button' className='pm-back' onClick={() => project ? props.onInspect(null) : props.onBack()}><ChevronLeft size={17} />{project ? props.projectBackLabel ?? (zh ? '所有專案' : 'All projects') : (zh ? '歌單' : 'Setlists')}</button>
      <div className='pm-title-row'>
        <h2 ref={heading} tabIndex={-1}>{project ? project.name : (props.archivedOnly ? (zh ? '已歸檔專案' : 'Archived projects') : (zh ? '專案管理' : 'Project management'))}</h2>
        {project ? <ManagementActions key={project.id} label={zh ? '更多專案操作' : 'More project actions'} actions={projectActions} /> : props.canCreate && !props.archivedOnly && <button type='button' className='pm-new-button' onClick={props.onCreate}><Plus size={16} />{zh ? '新增' : 'New'}</button>}
      </div>
      <p className='pm-header-note'>{project ? String(projectSetlists.length) + (zh ? ' 份歌單' : ' setlists') + (project.archived ? (zh ? ' · 已歸檔' : ' · Archived') : '') : (props.archivedOnly ? (zh ? '選擇專案以取消歸檔。' : 'Choose a project to restore.') : (zh ? '選擇專案，管理成員與歌單。' : 'Choose a project to manage members and setlists.'))}</p>
    </header>
    <div ref={scroll} data-project-scroll className='pm-scroll'>
      {project ? <div key={project.id} data-project-management-detail={project.id}>
        <section className='pm-section' aria-labelledby='pm-members-heading' data-project-sharing-id={project.id} aria-busy={membersLoading || pendingHere}>
          <div className='pm-section-heading'><h3 id='pm-members-heading'>{zh ? '成員與權限' : 'Members and permissions'}{canViewMembers && <span>{membersLoading && !memberStatus ? '…' : participants.length}</span>}</h3>
            <div className='pm-section-actions'>{canViewMembers && <button type='button' className='pm-icon-button' aria-label={zh ? '重新整理成員' : 'Refresh members'} disabled={membersLoading || pendingHere} onClick={() => props.onRefreshMembers(project.id)}><RefreshCw size={16} /></button>}{props.canShare(project) && <button type='button' className='pm-text-button' disabled={props.sharing} onClick={() => props.onShare(project)}><Share2 size={15} />{props.sharing ? (zh ? '準備中…' : 'Preparing…') : (zh ? '邀請' : 'Invite')}</button>}</div>
          </div>
          {!canViewMembers ? <p className='pm-message'>{zh ? '目前無法查看此專案的共享成員。' : 'Shared members are unavailable for this project.'}</p>
            : membersError ? <p role='alert' className='pm-message pm-error'>{zh ? '無法載入成員。請重新整理再試。' : 'Members could not be loaded. Refresh to retry.'}</p>
            : membersLoading && !memberStatus ? <div role='status' className='pm-loading'>{zh ? '正在載入成員…' : 'Loading members…'}</div>
            : <>
              {participants.length > 0 ? <ul className='pm-members'>{participants.map(member => {
                const name = member.name || member.email;
                const key = project.id + '|' + member.userId;
                return <li key={member.userId} className='pm-member'>
                  {member.picture ? <img className='pm-avatar' src={member.picture} alt='' /> : <span className='pm-avatar' aria-hidden='true'>{name.slice(0,1)}</span>}
                  <div className='pm-member-info'><div className='pm-member-top'><strong>{name}</strong>
                    <span className='pm-role-control'><select aria-label={zh ? name + '的權限' : 'Role for ' + name} value={pendingRole?.key === key ? pendingRole.role : member.role ?? 'viewer'} disabled={membersLoading || pendingHere} onChange={event => void changeRole(member, event.target.value as ProjectMemberRole)}><option value='viewer'>{zh ? '唯讀' : 'Viewer'}</option><option value='manager'>{zh ? '管理員' : 'Manager'}</option></select><ChevronDown size={12} aria-hidden='true'/></span></div><span className='pm-member-email' title={member.email}>{member.email}</span>
                  </div>
                  <ManagementActions label={zh ? name + '的成員操作' : 'Actions for ' + name} disabled={membersLoading || pendingHere} actions={[{label:zh ? '移除成員' : 'Remove member',icon:<Trash2 size={16}/>,danger:true,run:()=>props.onRemoveMember(project,member)}]} />
                </li>;
              })}</ul> : <p className='pm-message'>{zh ? '尚無共享成員。邀請團員加入，一起使用專案歌單。' : 'No shared members yet. Invite your team to use this project’s setlists.'}</p>}
              {participants.length > 0 && <p className='pm-permission-note'>{zh ? '管理員可改調性與歌曲順序；唯讀僅查看。' : 'Managers can change keys and song order. Viewers can read.'}</p>}
            </>}
        </section>

      </div> : <>
        <section className='pm-section' aria-label={zh ? '我的專案' : 'My projects'}>
          <div className='pm-section-heading'><h3>{props.archivedOnly ? (zh ? '已歸檔' : 'Archived') : (zh ? '我的專案' : 'My projects')}<span>{projects.length}</span></h3></div>
          <ul className='pm-list'>{projects.map(item => <li key={item.id} data-project-id={item.id}><button type='button' ref={node => { if(node) rows.current.set(item.id,node); else rows.current.delete(item.id); }} className='pm-list-row' onClick={() => inspect(item.id)}><span className='pm-row-copy'><strong>{item.name}</strong><small>{countSetlists(item.id)}{zh ? ' 份歌單' : ' setlists'}{item.archived ? (zh ? ' · 已歸檔' : ' · Archived') : ''}</small></span><ChevronRight size={17}/></button></li>)}</ul>
          {!projects.length && <p className='pm-message'>{zh ? '尚無專案。新增專案，將不同聚會的歌單與成員集中管理。' : 'No projects yet. Create one to organize service setlists and members.'}</p>}
          {props.archivedCount > 0 && !props.archivedOnly && <button type='button' className='pm-archive-toggle' aria-pressed={props.showArchived} onClick={props.onToggleArchived}><Archive size={15}/>{props.showArchived ? (zh ? '隱藏已歸檔專案' : 'Hide archived projects') : (zh ? '顯示已歸檔專案' : 'Show archived projects')}{' (' + props.archivedCount + ')'}</button>}
        </section>
        {joinedProjects.length > 0 && !props.archivedOnly && <section className='pm-section'><div className='pm-section-heading'><h3>{zh ? '與我共享' : 'Shared with me'}<span>{joinedProjects.length}</span></h3></div><ul className='pm-list'>{joinedProjects.map(item=><li key={item.id}><button type='button' className='pm-list-row' onClick={()=>props.onOpenJoinedProject(item.id)}><span className='pm-row-copy'><strong>{item.name}</strong><small>{item.setlists.filter(list=>!list.archived).length}{zh ? ' 份歌單 · 已加入' : ' setlists · Joined'}</small></span><ChevronRight size={17}/></button></li>)}</ul></section>}
      </>}
    </div>
  </div>;
}
