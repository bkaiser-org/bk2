
import { Route } from '@angular/router';
import { isAdminGuard, isAuthenticatedGuard, isPrivilegedGuard } from '@bk2/auth-feature';

export const appRoutes: Route[] = [
  { 
    path: '', 
    pathMatch: 'full',
    redirectTo: 'private/dashboard/c-contentpage'
  },
  {
    path: 'public',
    children: [
      {
        path: 'calendar',
        loadComponent: () => import('@bk2/calevent-feature').then(m => m.CalEventList),
        data: { listId: 'public', view: 'list', showMenu: false }
      },
      { 
        path: 'news', 
        loadComponent: () => import('@bk2/cms-page-feature').then(m => m.PageDispatcher),
        data: { id: 'news', showMenu: false }
      },
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
    loadComponent: () => import('@bk2/quiz-feature').then(m => m.QuizPage),
  },
  {
    path: 'auth',
    children: [
      { path: 'login', loadComponent: () => import('@bk2/auth-feature').then(m => m.LoginPage) },
      { path: 'pwdreset', loadComponent: () => import('@bk2/auth-feature').then(m => m.PasswordResetPage) },
      { path: 'confirm', loadComponent: () => import('@bk2/auth-feature').then(m => m.ConfirmPasswordResetPage) },
      { path: 'matrix-callback', loadComponent: () => import('@bk2/auth-feature').then(m => m.MatrixOidcCallback) },
    ],
  },
  {
    path: 'category',
    canActivate: [isAuthenticatedGuard],
    children: [
      { path: ':listId/:contextMenuName', canActivate: [isPrivilegedGuard], loadComponent: () => import('@bk2/category-feature').then(m => m.CategoryList) }
    ],
  },
  {
    path: 'page',
    canActivate: [isAuthenticatedGuard],
    children: [
      { path: ':listId/:contextMenuName', canActivate: [isPrivilegedGuard], loadComponent: () => import('@bk2/cms-page-feature').then(m => m.PageList) }
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
      { path: 'all', canActivate: [isPrivilegedGuard], loadComponent: () => import('@bk2/cms-menu-feature').then(m => m.MenuList) }
    ],
  },
  {
    path: 'person',
    canActivate: [isAuthenticatedGuard],
    children: [
      { path: ':listId/:contextMenuName', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/subject-person-feature').then(m => m.PersonList) },
      { path: 'profile', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/profile-feature').then(m => m.ProfileEditPage), data: { preload: true } },
      { path: ':personKey', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/subject-person-feature').then(m => m.PersonEditPage) },
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
    children: [{ path: ':groupKey', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/subject-group-feature').then(m => m.GroupViewPage) }],
  },
  {
    path: 'group',
    canActivate: [isAuthenticatedGuard],
    children: [
      { path: ':listId/:contextMenuName', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/subject-group-feature').then(m => m.GroupList) },
      { path: ':groupKey', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/subject-group-feature').then(m => m.GroupViewPage) },
    ],
  },
  {
    path: 'contact',
    canActivate: [isAuthenticatedGuard],
    children: [{ 
      path: ':listId/:orgId/:contextMenuName', 
      canActivate: [isAuthenticatedGuard], 
      loadComponent: () => import('@bk2/relationship-membership-feature').then(m => m.MembershipList),
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
      loadComponent: () => import('@bk2/relationship-membership-feature').then(m => m.MembershipList),
      data: { color: 'secondary', view: 'mcat' }
    }],
  },
  {
    path: 'invitation',
    canActivate: [isAuthenticatedGuard],
    children: [{ path: ':listId/:contextMenuName', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/relationship-invitation-feature').then(m => m.InvitationList) }],
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
    children: [{ path: ':listId/:contextMenuName', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/relationship-transfer-feature').then(m => m.TransferList) }],
  },  
  {
    path: 'responsibility',
    canActivate: [isAuthenticatedGuard],
    children: [{ path: ':listId/:contextMenuName', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/relationship-responsibility-feature').then(m => m.ResponsibilityList) }],
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
    path: 'rboat',
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
    path: 'trips',
    canActivate: [isAuthenticatedGuard],
    loadComponent: () => import('@bk2/trip-feature').then(m => m.TripList),
  },
  {
    path: 'flighttracker',
    canActivate: [isAuthenticatedGuard],
    loadComponent: () =>
      import('@bk2/flighttracker-feature').then(m => m.FlightTrackerSearch),
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
      data: { color: 'secondary', view: 'grid', showMenu: true }
    }],
  },
  {
    path: 'document',
    canActivate: [isAuthenticatedGuard],
    children: [
      { path: ':listId/:contextMenuName', 
        canActivate: [isPrivilegedGuard],
        loadComponent: () => import('@bk2/document-feature').then(m => m.DocumentList),
        data: { color: 'secondary', view: 'list', showMenu: true }
      },
      { path: ':documentKey', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/document-feature').then(m => m.DocumentEditPage) }
    ],
  },
  {
    path: 'task',
    canActivate: [isAuthenticatedGuard],
    children: [{ path: ':listId/:contextMenuName', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/task-feature').then(m => m.TaskList) }],
  },
  {
    path: 'applications',
    canActivate: [isPrivilegedGuard],
    loadComponent: () => import('@bk2/application-feature').then(m => m.ApplicationList),
  },
  {
    path: 'activity',
    canActivate: [isAdminGuard],
    loadComponent: () => import('@bk2/activity-feature').then(m => m.ActivityList),
  },
  {
    path: 'icon',
    canActivate: [isAuthenticatedGuard],
    children: [{ path: ':listId/:contextMenuName', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/icon-feature').then(m => m.IconList) }],
  },
  {
    path: 'invoice',
    canActivate: [isAuthenticatedGuard],
    children: [{ path: ':listId/:contextMenuName', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/finance-invoice-feature').then(m => m.InvoiceList) }],
  },
  {
    path: 'invoice-aging',
    canActivate: [isAuthenticatedGuard],
    loadComponent: () => import('@bk2/finance-invoice-feature').then(m => m.InvoiceAging),
  },
  {
    path: 'scsmemberfees',
    canActivate: [isAuthenticatedGuard],
    children: [{ path: ':contextMenuName', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/relationship-membership-feature').then(m => m.ScsMemberFees) }],
  },
  {
    path: 'bill',
    canActivate: [isAuthenticatedGuard],
    children: [{ path: ':listId', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/finance-bill-feature').then(m => m.BillList) }],
  },
  {
    path: 'account',
    canActivate: [isAuthenticatedGuard],
    children: [{ path: ':contextMenuName', canActivate: [isAuthenticatedGuard], loadComponent: () => import('@bk2/finance-account-feature').then(m => m.AccountList) }],
  },
  {
    path: 'journal',
    canActivate: [isAuthenticatedGuard],
    loadComponent: () => import('@bk2/finance-journal-feature').then(m => m.JournalList),
  },
  {
    path: 'accounting/:accountingTenantId',
    canActivate: [isPrivilegedGuard],
    loadComponent: () => import('@bk2/finance-accounting-feature').then(m => m.AccountingShell),
    children: [
      {
        path: 'journal',
        loadComponent: () => import('@bk2/finance-booking-feature').then(m => m.BookingList),
      },
      {
        path: 'periods',
        loadComponent: () => import('@bk2/finance-period-feature').then(m => m.PeriodList),
      },
      {
        path: 'vat-codes',
        loadComponent: () => import('@bk2/finance-vat-code-feature').then(m => m.VatCodeList),
      },
      {
        path: 'balance',
        loadComponent: () => import('@bk2/finance-reporting-feature').then(m => m.BalanceSheetPage),
      },
      {
        path: 'income-statement',
        loadComponent: () => import('@bk2/finance-reporting-feature').then(m => m.IncomeStatementPage),
      },
      {
        path: 'cash-flow',
        loadComponent: () => import('@bk2/finance-reporting-feature').then(m => m.CashFlowPage),
      },
      {
        path: 'assets',
        loadComponent: () => import('@bk2/finance-asset-feature').then(m => m.AssetList),
      },
      {
        path: 'depreciation-run',
        loadComponent: () => import('@bk2/finance-asset-feature').then(m => m.DepreciationRunPage),
      },
      {
        path: 'payments',
        loadComponent: () => import('@bk2/finance-payment-feature').then(m => m.PaymentOrderList),
      },
      {
        path: 'payments/:orderKey',
        loadComponent: () => import('@bk2/finance-payment-feature').then(m => m.PaymentOrderDetailPage),
      },
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'journal',
      },
    ],
  },
  {
    path: 'aoc',
    canActivate: [isAdminGuard],
    children: [
      { path: 'adminops', canActivate: [isAdminGuard], loadComponent: () => import('@bk2/aoc-feature').then(m => m.AocAdminOps) },
      { path: 'roles', canActivate: [isAdminGuard], loadComponent: () => import('@bk2/aoc-feature').then(m => m.AocRoles) },
      { path: 'content', canActivate: [isAdminGuard], loadComponent: () => import('@bk2/aoc-feature').then(m => m.AocContent) },
      { path: 'data', canActivate: [isAdminGuard], loadComponent: () => import('@bk2/aoc-feature').then(m => m.AocData) },
      { path: 'chat', canActivate: [isAdminGuard], loadComponent: () => import('@bk2/aoc-feature').then(m => m.AocChat) },
      { path: 'account', canActivate: [isAdminGuard], loadComponent: () => import('@bk2/aoc-feature').then(m => m.AocUserAccounts) },
      { path: 'statistics', canActivate: [isAdminGuard], loadComponent: () => import('@bk2/aoc-feature').then(m => m.AocStatistics) },
      { path: 'storage', canActivate: [isAdminGuard], loadComponent: () => import('@bk2/aoc-feature').then(m => m.AocStorage) },
      { path: 'doc', canActivate: [isAdminGuard], loadComponent: () => import('@bk2/aoc-feature').then(m => m.AocDoc) },
      { path: 'tag', canActivate: [isAdminGuard], loadComponent: () => import('@bk2/aoc-feature').then(m => m.AocTag) },
      { path: 'email', canActivate: [isAdminGuard], loadComponent: () => import('@bk2/aoc-feature').then(m => m.AocEmail) },
      { path: 'bexio', canActivate: [isAdminGuard], loadComponent: () => import('@bk2/aoc-feature').then(m => m.AocBexio) },
      { path: 'srv', canActivate: [isAdminGuard], loadComponent: () => import('@bk2/aoc-feature').then(m => m.AocSrv) },
      { path: 'sessions', canActivate: [isAdminGuard], loadComponent: () => import('@bk2/aoc-feature').then(m => m.AocSession) },
      { path: 'trip', canActivate: [isAdminGuard], loadComponent: () => import('@bk2/trip-feature').then(m => m.AocTrip) },
      { path: 'website', canActivate: [isPrivilegedGuard], loadComponent: () => import('@bk2/aoc-feature').then(m => m.AocWebsite) },
    ],
  },
  {
    path: 'templates',
    canActivate: [isAdminGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('@bk2/pdf-template-feature').then(m => m.TemplateList),
      },
      {
        path: ':templateKey',
        loadComponent: () => import('@bk2/pdf-template-feature').then(m => m.TemplateEditPage),
      },
    ],
  },
  {
    path: 'esign',
    canActivate: [isPrivilegedGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('@bk2/esign-feature').then(m => m.EsignList),
      },
    ],
  },
  {
    path: 'i18n',
    canActivate: [isAdminGuard],
    children: [
      {
        path: 'defaults',
        canActivate: [isAdminGuard],
        loadComponent: () => import('@bk2/i18n-feature').then(m => m.I18nDefaultList),
      },
      {
        path: 'overrides',
        canActivate: [isPrivilegedGuard],
        loadComponent: () => import('@bk2/i18n-feature').then(m => m.I18nOverrideList),
      },
    ],
  },
  { path: '**', loadComponent: () => import('@bk2/cms-page-feature').then(m => m.ErrorPage), data: { errorName: 'pageNotFound' } },
];
