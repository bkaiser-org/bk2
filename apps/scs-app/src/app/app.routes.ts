
import { Route } from '@angular/router';
import { isAdminGuard, isAuthenticatedGuard, isPrivilegedGuard } from '@bk2/auth-feature';

export const appRoutes: Route[] = [
  { 
    path: '', 
    pathMatch: 'full',
    redirectTo: 'private/welcome/c-contentpage'
  },
  {
    path: 'public',
    children: [
      { 
        path: ':id/:contextMenuName', 
        loadComponent: () => import('@bk2/cms-page-feature').then(m => m.PageDispatcher),
        data: { color: 'secondary' }
      },
      { 
        path: ':id', 
        loadComponent: () => import('@bk2/cms-page-feature').then(m => m.PageDispatcher),
        data: { color: 'secondary' }
      }
    ],
  },
  {
    path: 'private',
    canActivate: [isAuthenticatedGuard],
    children: [
      { 
        path: ':id/:contextMenuName',
        loadComponent: () => import('@bk2/cms-page-feature').then(m => m.PageDispatcher),
        data: { color: 'secondary' }
      },
      { 
        path: ':id',
        loadComponent: () => import('@bk2/cms-page-feature').then(m => m.PageDispatcher),
        data: { color: 'secondary' }
      },
    ],
  },
  {
    path: 'quiz',
    loadComponent: () => import('@bk2/quiz-feature').then(m => m.QuizPageComponent),
  },
  {
    path: 'auth',
    children: [
      { path: 'login', loadComponent: () => import('@bk2/auth-feature').then(m => m.LoginPageComponent) },
      { path: 'pwdreset', loadComponent: () => import('@bk2/auth-feature').then(m => m.PasswordResetPageComponent) },
      { path: 'matrix-callback', loadComponent: () => import('@bk2/auth-feature').then(m => m.MatrixOidcCallbackComponent) },
    ],
  },
  {
    path: 'category',
    canActivate: [isAuthenticatedGuard],
    children: [
      { path: ':listId/:contextMenuName', canActivate: [isPrivilegedGuard], loadComponent: () => import('@bk2/category-feature').then(m => m.CategoryListComponent) }
    ],
  },
  {
    path: 'page',
    canActivate: [isAuthenticatedGuard],
    children: [
      { path: ':listId/:contextMenuName', canActivate: [isPrivilegedGuard], loadComponent: () => import('@bk2/cms-page-feature').then(m => m.PageAllListComponent) }
    ],
  },
  {
    path: 'section',
    canActivate: [isAuthenticatedGuard],
    children: [
      { path: 'all', canActivate: [isPrivilegedGuard], loadComponent: () => import('@bk2/cms-section-feature').then(m => m.SectionAllListComponent) },
    ],
  },
  {
    path: 'menu',
    canActivate: [isAuthenticatedGuard],
    children: [
      { path: 'all', canActivate: [isPrivilegedGuard], loadComponent: () => import('@bk2/cms-menu-feature').then(m => m.MenuListComponent) }
    ],
  },
  {
    path: 'person',
    canActivate: [isAuthenticatedGuard],
    children: [
      { path: ':listId/:contextMenuName', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/subject-person-feature').then(m => m.PersonList) },
      { path: 'profile', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/profile-feature').then(m => m.ProfileEditPageComponent), data: { preload: true } },
      { path: ':personKey', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/subject-person-feature').then(m => m.PersonEditPage) },
    ],
  },
  {
    path: 'user',
    canActivate: [isAuthenticatedGuard],
    children: [
      { path: ':listId/:contextMenuName', canActivate: [isPrivilegedGuard], loadComponent: () => import('@bk2/user-feature').then(m => m.UserListComponent) },
      { path: ':userKey', canActivate: [isAdminGuard], loadComponent: () => import('@bk2/user-feature').then(m => m.UserPageComponent) },
    ],
  },
  {
    path: 'org',
    canActivate: [isAuthenticatedGuard],
    children: [
      { path: ':listId/:contextMenuName', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/subject-org-feature').then(m => m.OrgListComponent) },
    ],
  },
  {
    path: 'group-view',
    canActivate: [isAuthenticatedGuard],
    children: [{ path: ':groupKey', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/subject-group-feature').then(m => m.GroupViewPageComponent) }],
  },
  {
    path: 'group',
    canActivate: [isAuthenticatedGuard],
    children: [
      { path: ':listId/:contextMenuName', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/subject-group-feature').then(m => m.GroupListComponent) },
      { path: ':groupKey', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/subject-group-feature').then(m => m.GroupViewPageComponent) },
    ],
  },
  {
    path: 'contact',
    canActivate: [isAuthenticatedGuard],
    children: [{ 
      path: ':listId/:orgId/:contextMenuName', 
      canActivate: [isAuthenticatedGuard], 
      loadComponent: () => import('@bk2/relationship-membership-feature').then(m => m.MembershipListComponent),
      data: { color: 'secondary', view: 'contact' }
    }],
  },
  {
    path: 'address',
    canActivate: [isAuthenticatedGuard],
    children: [{ 
      path: ':contextMenuName', 
      canActivate: [isAdminGuard], 
      loadComponent: () => import('@bk2/subject-address-feature').then(m => m.AddressesList)}],
  },
  {
    path: 'membership',
    canActivate: [isAuthenticatedGuard],
    children: [{ 
      path: ':listId/:orgId/:contextMenuName', 
      canActivate: [isAuthenticatedGuard], 
      loadComponent: () => import('@bk2/relationship-membership-feature').then(m => m.MembershipListComponent),
      data: { color: 'secondary', view: 'mcat' }
    }],
  },
  {
    path: 'invitation',
    canActivate: [isAuthenticatedGuard],
    children: [{ path: ':listId/:contextMenuName', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/relationship-invitation-feature').then(m => m.InvitationListComponent) }],
  },
  {
    path: 'ownership',
    canActivate: [isAuthenticatedGuard],
    children: [{ path: ':listId/:contextMenuName', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/relationship-ownership-feature').then(m => m.OwnershipListComponent) }],
  },
  {
    path: 'reservation',
    canActivate: [isAuthenticatedGuard],
    children: [{ path: ':listId/:contextMenuName', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/relationship-reservation-feature').then(m => m.ReservationListComponent) }],
  },
  {
    path: 'personalrel',
    canActivate: [isAuthenticatedGuard],
    children: [{ path: ':listId/:contextMenuName', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/relationship-personal-rel-feature').then(m => m.PersonalRelListComponent) }],
  },
  {
    path: 'workingrel',
    canActivate: [isAuthenticatedGuard],
    children: [{ path: ':listId/:contextMenuName', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/relationship-workrel-feature').then(m => m.WorkrelListComponent) }],
  },
  {
    path: 'transfer',
    canActivate: [isAuthenticatedGuard],
    children: [{ path: ':listId/:contextMenuName', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/relationship-transfer-feature').then(m => m.TransferListComponent) }],
  },
  {
    path: 'resource',
    canActivate: [isAuthenticatedGuard],
    children: [
      { path: ':listId/:contextMenuName', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/resource-feature').then(m => m.ResourceListComponent) },
      { path: ':resourceKey', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/resource-feature').then(m => m.ResourceEditPageComponent) },
    ],
  },
  {
    path: 'rboat',
    canActivate: [isAuthenticatedGuard],
    children: [{ path: ':listId/:contextMenuName', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/resource-feature').then(m => m.RowingBoatListComponent) }],
  },
  {
    path: 'locker',
    canActivate: [isAuthenticatedGuard],
    children: [{ path: ':listId/:contextMenuName', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/resource-feature').then(m => m.LockerListComponent) }],
  },
  {
    path: 'key',
    canActivate: [isAuthenticatedGuard],
    children: [{ path: ':listId/:contextMenuName', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/resource-feature').then(m => m.KeyListComponent) }],
  },
  {
    path: 'location',
    canActivate: [isAuthenticatedGuard],
    children: [{ path: ':listId/:contextMenuName', canActivate: [isPrivilegedGuard], loadComponent: () => import('@bk2/location-feature').then(m => m.LocationListComponent) }],
  },
  {
    path: 'yearlyevents',
    canActivate: [isAuthenticatedGuard],
    children: [{ path: ':listId/:contextMenuName', canActivate: [isPrivilegedGuard], loadComponent: () => import('@bk2/calevent-feature').then(m => m.YearlyEventsComponent) }],
  },
  {
    path: 'calevent',
    canActivate: [isAuthenticatedGuard],
    children: [{ 
      path: ':listId/:contextMenuName', 
      canActivate: [isPrivilegedGuard], 
      loadComponent: () => import('@bk2/calevent-feature').then(m => m.CalEventListComponent),
      data: { color: 'secondary', view: 'list', showMainMenu: true }
    }],
  },
  {
    path: 'document',
    canActivate: [isAuthenticatedGuard],
    children: [
      { path: ':listId/:contextMenuName', 
        canActivate: [isPrivilegedGuard],
        loadComponent: () => import('@bk2/document-feature').then(m => m.DocumentListComponent),
        data: { color: 'secondary', view: 'list', showMainMenu: true }
      },
      { path: ':documentKey', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/document-feature').then(m => m.DocumentEditPageComponent) }
    ],
  },
  {
    path: 'task',
    canActivate: [isAuthenticatedGuard],
    children: [{ path: ':listId/:contextMenuName', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/task-feature').then(m => m.TaskListComponent) }],
  },
  {
    path: 'aoc',
    canActivate: [isAdminGuard],
    children: [
      { path: 'adminops', canActivate: [isAdminGuard], loadComponent: () => import('@bk2/aoc-feature').then(m => m.AocAdminOpsComponent) },
      { path: 'roles', canActivate: [isAdminGuard], loadComponent: () => import('@bk2/aoc-feature').then(m => m.AocRolesComponent) },
      { path: 'content', canActivate: [isAdminGuard], loadComponent: () => import('@bk2/aoc-feature').then(m => m.AocContentComponent) },
      { path: 'data', canActivate: [isAdminGuard], loadComponent: () => import('@bk2/aoc-feature').then(m => m.AocDataComponent) },
      { path: 'chat', canActivate: [isAdminGuard], loadComponent: () => import('@bk2/aoc-feature').then(m => m.AocChat) },
      { path: 'account', canActivate: [isAdminGuard], loadComponent: () => import('@bk2/aoc-feature').then(m => m.AocUserAccounts) },
      { path: 'statistics', canActivate: [isAdminGuard], loadComponent: () => import('@bk2/aoc-feature').then(m => m.AocStatisticsComponent) },
      { path: 'storage', canActivate: [isAdminGuard], loadComponent: () => import('@bk2/aoc-feature').then(m => m.AocStorageComponent) },
      { path: 'doc', canActivate: [isAdminGuard], loadComponent: () => import('@bk2/aoc-feature').then(m => m.AocDocComponent) },
      { path: 'tag', canActivate: [isAdminGuard], loadComponent: () => import('@bk2/aoc-feature').then(m => m.AocTagComponent) },
    ],
  },
  { path: '**', loadComponent: () => import('@bk2/cms-page-feature').then(m => m.PageDispatcher) },
];
