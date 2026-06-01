import { Route } from '@angular/router';

import { isAdminGuard, isAuthenticatedGuard, isPrivilegedGuard, LoginPage, PasswordResetPage } from '@bk2/auth-feature';
import { MenuList } from '@bk2/cms-menu-feature';
import { QuizPage } from '@bk2/quiz-feature';

export const appRoutes: Route[] = [
  { path: '', pathMatch: 'full', redirectTo: 'public/welcome' },
  {
    path: 'public',
    children: [
      { path: 'welcome', loadComponent: () => import('@bk2/cms-page-feature').then(m => m.BkWelcomePage) },
      { path: 'notfound', loadComponent: () => import('@bk2/cms-page-feature').then(m => m.PageNotFound) },
      { 
        path: ':id/:contextMenuName', 
        loadComponent: () => import('@bk2/cms-page-feature').then(m => m.ContentPageComponent),
        data: { color: 'secondary' }
      },
    ],
  },
  {
    path: 'private',
    children: [{ 
      path: ':id/:contextMenuName',
      loadComponent: () => import('@bk2/cms-page-feature').then(m => m.ContentPageComponent),
      data: { color: 'secondary'
    }
}],
  },
  {
    path: 'quiz',
    component: QuizPage,
  },
  {
    path: 'auth',
    children: [
      { path: 'login', component: LoginPage },
      { path: 'pwdreset', component: PasswordResetPage },
    ],
  },
  {
    path: 'category',
    canActivate: [isAuthenticatedGuard],
    children: [{ path: ':listId/:contextMenuName', canActivate: [isPrivilegedGuard], loadComponent: () => import('@bk2/category-feature').then(m => m.CategoryList) }],
  },
  {
    path: 'page',
    canActivate: [isAuthenticatedGuard],
    children: [{ path: ':listId/:contextMenuName', canActivate: [isPrivilegedGuard], loadComponent: () => import('@bk2/cms-page-feature').then(m => m.PageAllList) }],
  },
  {
    path: 'section',
    canActivate: [isAuthenticatedGuard],
    children: [
      { path: 'all', canActivate: [isPrivilegedGuard], loadComponent: () => import('@bk2/cms-section-feature').then(m => m.SectionAllList) },
    ],
  },
  {
    path: 'menu',
    canActivate: [isAuthenticatedGuard],
    children: [{ path: 'all', canActivate: [isPrivilegedGuard], component: MenuList }],
  },
  {
    path: 'album',
    canActivate: [isAuthenticatedGuard],
    children: [{ path: ':id', canActivate: [isPrivilegedGuard], loadComponent: () => import('@bk2/cms-page-feature').then(m => m.AlbumPageComponent) }],
  },
  {
    path: 'person',
    canActivate: [isAuthenticatedGuard],
    children: [
      { path: ':listId/:contextMenuName', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/subject-person-feature').then(m => m.PersonListComponent) },
      { path: 'profile', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/profile-feature').then(m => m.ProfileEditPage), data: { preload: true } },
      { path: ':personKey', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/subject-person-feature').then(m => m.PersonEditPageComponent) },
    ],
  },
  {
    path: 'user',
    canActivate: [isAuthenticatedGuard],
    children: [
      { path: ':listId/:contextMenuName', canActivate: [isPrivilegedGuard], loadComponent: () => import('@bk2/user-feature').then(m => m.UserList) },
      { path: ':userKey', canActivate: [isAdminGuard], loadComponent: () => import('@bk2/user-feature').then(m => m.UserEditPage) },
    ],
  },
  {
    path: 'org',
    canActivate: [isAuthenticatedGuard],
    children: [
      { path: ':listId/:contextMenuName', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/subject-org-feature').then(m => m.OrgList) },
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
    path: 'membership',
    canActivate: [isAuthenticatedGuard],
    children: [{ 
      path: ':listId/:orgId/:contextMenuName', 
      canActivate: [isAuthenticatedGuard], 
      loadComponent: () => import('@bk2/relationship-membership-feature').then(m => m.MembershipList),
      data: { color: 'secondary', view: 'default' }
    }],
  },
  {
    path: 'ownership',
    canActivate: [isAuthenticatedGuard],
    children: [{ path: ':listId/:contextMenuName', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/relationship-ownership-feature').then(m => m.OwnershipList) }],
  },
  {
    path: 'reservation',
    canActivate: [isAuthenticatedGuard],
    children: [{ path: ':listId/:contextMenuName', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/relationship-reservation-feature').then(m => m.ReservationList) }],
  },
  {
    path: 'personalrel',
    canActivate: [isAuthenticatedGuard],
    children: [{ path: ':listId/:contextMenuName', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/relationship-personal-rel-feature').then(m => m.PersonalRelList) }],
  },
  {
    path: 'workingrel',
    canActivate: [isAuthenticatedGuard],
    children: [{ path: ':listId/:contextMenuName', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/relationship-workrel-feature').then(m => m.WorkrelList) }],
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
      { path: ':listId/:contextMenuName', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/resource-feature').then(m => m.ResourceList) },
      { path: ':resourceKey', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/resource-feature').then(m => m.ResourceEditPage) },
    ],
  },
  {
    path: 'boat',
    canActivate: [isAuthenticatedGuard],
    children: [{ path: ':listId/:contextMenuName', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/resource-feature').then(m => m.RowingBoatList) }],
  },
  {
    path: 'locker',
    canActivate: [isAuthenticatedGuard],
    children: [{ path: ':listId/:contextMenuName', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/resource-feature').then(m => m.LockerList) }],
  },
  {
    path: 'key',
    canActivate: [isAuthenticatedGuard],
    children: [{ path: ':listId/:contextMenuName', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/resource-feature').then(m => m.KeyList) }],
  },
  {
    path: 'location',
    canActivate: [isAuthenticatedGuard],
    children: [{ path: ':listId/:contextMenuName', canActivate: [isPrivilegedGuard], loadComponent: () => import('@bk2/location-feature').then(m => m.LocationList) }],
  },
  {
    path: 'yearlyevents',
    canActivate: [isAuthenticatedGuard],
    children: [{ path: ':listId/:contextMenuName', canActivate: [isPrivilegedGuard], loadComponent: () => import('@bk2/calevent-feature').then(m => m.YearlyEvents) }],
  },
  {
    path: 'calevent',
    canActivate: [isAuthenticatedGuard],
    children: [{ 
      path: ':listId/:contextMenuName', 
      canActivate: [isPrivilegedGuard], 
      loadComponent: () => import('@bk2/calevent-feature').then(m => m.CalEventList),
      data: { color: 'secondary', view: 'list' }
    }],
  },
  {
    path: 'document',
    canActivate: [isAuthenticatedGuard],
    children: [
      { path: ':listId/:contextMenuName', canActivate: [isPrivilegedGuard], loadComponent: () => import('@bk2/document-feature').then(m => m.DocumentList) },
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
      { path: 'roles', canActivate: [isAdminGuard], loadComponent: () => import('@bk2/aoc-feature').then(m => m.AocRoles) },
      { path: 'content', canActivate: [isAdminGuard], loadComponent: () => import('@bk2/aoc-feature').then(m => m.AocContent) },
      { path: 'data', canActivate: [isAdminGuard], loadComponent: () => import('@bk2/aoc-feature').then(m => m.AocData) },
      { path: 'statistics', canActivate: [isAdminGuard], loadComponent: () => import('@bk2/aoc-feature').then(m => m.AocStatistics) },
      { path: 'storage', canActivate: [isAdminGuard], loadComponent: () => import('@bk2/aoc-feature').then(m => m.AocStorage) },
      { path: 'sessions', canActivate: [isAdminGuard], loadComponent: () => import('@bk2/aoc-feature').then(m => m.AocSession) },
    ],
  },
  { path: '**', loadComponent: () => import('@bk2/cms-page-feature').then(m => m.PageNotFoundComponent) },
];
