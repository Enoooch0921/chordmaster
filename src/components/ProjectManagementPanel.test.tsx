import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, expect, it, vi } from 'vitest';
vi.mock('./useAnchoredPortalPanel',()=>({useAnchoredPortalPanel:()=>({panelStyle:{position:'fixed',top:0,left:0},placement:'bottom',isPositioned:true,transformOrigin:'top right'})}));
import ProjectManagementPanel from './ProjectManagementPanel';
import type { ComponentProps } from 'react';
const project = { id:'la', name:'洛杉磯烈火', createdAt:1, updatedAt:1 };
const member = {userId:'anna',name:'安娜',email:'anna@example.invalid',role:'viewer' as const,joinedAt:''};
const list = {id:'meeting',name:'聚會一',projectId:'la',displayMode:'chord-movable-key' as const,createdAt:1,updatedAt:1,songs:[]};
beforeAll(()=>{vi.stubGlobal('ResizeObserver',class{observe(){} unobserve(){} disconnect(){}});});
const props = (extra: Partial<ComponentProps<typeof ProjectManagementPanel>> = {}): ComponentProps<typeof ProjectManagementPanel> => ({
 language:'zh',projects:[project],joinedProjects:[],setlists:[list],project:null,showArchived:false,archivedCount:0,canCreate:true,canManage:()=>true,canShare:()=>true,canViewMembers:true,memberStatus:{activeToken:null,activeCreatedAt:null,participantCount:1,participants:[member]},membersLoading:false,membersError:false,sharing:false,
 onBack:vi.fn(),onInspect:vi.fn(),onCreate:vi.fn(),onToggleArchived:vi.fn(),onOpenProject:vi.fn(),onOpenJoinedProject:vi.fn(),onOpenSetlist:vi.fn(),onRename:vi.fn(),onArchive:vi.fn(),onDelete:vi.fn(),onShare:vi.fn(),onRefreshMembers:vi.fn(),onRoleChange:vi.fn().mockResolvedValue(undefined),onRemoveMember:vi.fn(),...extra
});
it('shows either the project index or one detail and returns focus to the opened project',()=>{
 const options=props();const view=render(<ProjectManagementPanel {...options}/>);
 const row=screen.getByRole('button',{name:/洛杉磯烈火/});fireEvent.click(row);expect(options.onInspect).toHaveBeenCalledWith('la');
 view.rerender(<ProjectManagementPanel {...options} project={project}/>);
 expect(screen.queryByRole('button',{name:/洛杉磯烈火/})).toBeNull();
 expect(screen.queryByRole('button',{name:'新增'})).toBeNull();
 expect(screen.getByText('安娜')).toBeVisible();expect(screen.getByRole('combobox',{name:'安娜的權限'})).toHaveValue('viewer');
 fireEvent.click(screen.getByRole('button',{name:'所有專案'}));expect(options.onInspect).toHaveBeenLastCalledWith(null);
 view.rerender(<ProjectManagementPanel {...options}/>);
 expect(screen.getByRole('button',{name:/洛杉磯烈火/})).toHaveFocus();
});
it('shows explicit role choices without duplicating the project setlist list',async()=>{
 const options=props({project});render(<ProjectManagementPanel {...options}/>);
 const headings=screen.getAllByRole('heading',{level:3}).map(node=>node.textContent);
 expect(headings).toEqual(['成員與權限1']);
 expect(screen.queryByRole('button',{name:/聚會一/})).toBeNull();
 fireEvent.change(screen.getByRole('combobox',{name:'安娜的權限'}),{target:{value:'manager'}});
 await waitFor(()=>expect(options.onRoleChange).toHaveBeenCalledWith(project,member,'manager'));
 expect(screen.getByText('管理員可改調性與歌曲順序；唯讀僅查看。')).toBeVisible();
});
it('keeps project destruction in a menu and honors management permissions',async()=>{
 const options=props({project});const view=render(<ProjectManagementPanel {...options}/>);
 expect(screen.queryByRole('menuitem',{name:'刪除專案'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'更多專案操作'}));
 fireEvent.click(await screen.findByRole('menuitem',{name:'歸檔專案'}));expect(options.onArchive).toHaveBeenCalledWith(project);
 view.rerender(<ProjectManagementPanel {...options} canManage={()=>false}/>);
 fireEvent.click(screen.getByRole('button',{name:'更多專案操作'}));
 await screen.findByRole('menuitem',{name:'開啟專案歌單'});
 expect(screen.queryByRole('menuitem',{name:'刪除專案'})).toBeNull();expect(screen.queryByRole('menuitem',{name:'重新命名'})).toBeNull();
});
it('keeps existing members mounted while refreshing and provides error recovery',()=>{
 const options=props({project,membersLoading:true});const view=render(<ProjectManagementPanel {...options}/>);
 expect(screen.getByText('安娜')).toBeVisible();expect(screen.getByRole('combobox',{name:'安娜的權限'})).toBeDisabled();
 view.rerender(<ProjectManagementPanel {...options} membersLoading={false} membersError/>);
 expect(screen.getByRole('alert')).toHaveTextContent('無法載入成員');
 fireEvent.click(screen.getByRole('button',{name:'重新整理成員'}));expect(options.onRefreshMembers).toHaveBeenCalledWith('la');
});
it('shows empty member and setlist guidance without inventing participants',()=>{
 render(<ProjectManagementPanel {...props({project,setlists:[],memberStatus:{activeToken:null,activeCreatedAt:null,participantCount:0,participants:[]}})}/>);
 expect(screen.getByText(/尚無共享成員/)).toBeVisible();
});
