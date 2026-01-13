import { Route } from '@angular/router';

import { isAdminGuard, isAuthenticatedGuard, isPrivilegedGuard, LoginPageComponent, PasswordResetPageComponent } from '@bk2/auth-feature';
import { MenuListComponent } from '@bk2/cms-menu-feature';
import { QuizPageComponent } from '@bk2/quiz-feature';

export const appRoutes: Route[] = [
  { path: '', pathMatch: 'full', redirectTo: 'public/welcome' },
  {
    path: 'public',
    children: [
      { path: 'welcome', loadComponent: () => import('@bk2/cms-page-feature').then(m => m.BkWelcomePageComponent) },
      { path: 'notfound', loadComponent: () => import('@bk2/cms-page-feature').then(m => m.PageNotFoundComponent) },
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
    component: QuizPageComponent,
  },
  {
    path: 'auth',
    children: [
      { path: 'login', component: LoginPageComponent },
      { path: 'pwdreset', component: PasswordResetPageComponent },
    ],
  },
  {
    path: 'category',
    canActivate: [isAuthenticatedGuard],
    children: [{ path: ':listId/:contextMenuName', canActivate: [isPrivilegedGuard], loadComponent: () => import('@bk2/category-feature').then(m => m.CategoryListComponent) }],
  },
  {
    path: 'page',
    canActivate: [isAuthenticatedGuard],
    children: [{ path: ':listId/:contextMenuName', canActivate: [isPrivilegedGuard], loadComponent: () => import('@bk2/cms-page-feature').then(m => m.PageAllListComponent) }],
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
    children: [{ path: 'all', canActivate: [isPrivilegedGuard], component: MenuListComponent }],
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
      { path: 'profile', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/profile-feature').then(m => m.ProfileEditPageComponent), data: { preload: true } },
      { path: ':personKey', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/subject-person-feature').then(m => m.PersonEditPageComponent) },
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
    path: 'membership',
    canActivate: [isAuthenticatedGuard],
    children: [{ 
      path: ':listId/:orgId/:contextMenuName', 
      canActivate: [isAuthenticatedGuard], 
      loadComponent: () => import('@bk2/relationship-membership-feature').then(m => m.MembershipListComponent),
      data: { color: 'secondary', view: 'default' }
    }],
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
    path: 'boat',
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
      data: { color: 'secondary', view: 'list' }
    }],
  },
  {
    path: 'document',
    canActivate: [isAuthenticatedGuard],
    children: [
      { path: ':listId/:contextMenuName', canActivate: [isPrivilegedGuard], loadComponent: () => import('@bk2/document-feature').then(m => m.DocumentListComponent) },
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
      { path: 'statistics', canActivate: [isAdminGuard], loadComponent: () => import('@bk2/aoc-feature').then(m => m.AocStatisticsComponent) },
      { path: 'storage', canActivate: [isAdminGuard], loadComponent: () => import('@bk2/aoc-feature').then(m => m.AocStorageComponent) },
    ],
  },
  { path: '**', loadComponent: () => import('@bk2/cms-page-feature').then(m => m.PageNotFoundComponent) },
];
