import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';
import { RequireRole } from '@/auth/RequireRole';
import { FullPageSpinner } from '@/components/common/FullPageSpinner';
import AdminLayout from '@/layouts/AdminLayout';
import ReaderLayout from '@/layouts/ReaderLayout';
import StudioLayout from '@/layouts/StudioLayout';
import NotFoundPage from '@/pages/errors/NotFoundPage';

/* Pages are code-split per route. Board ids (R1, S4, AD2, ...) refer to the screen design canvas. */
const HomePage = lazy(() => import('@/pages/reader/HomePage'));
const SearchPage = lazy(() => import('@/pages/reader/SearchPage'));
const StoryDetailPage = lazy(() => import('@/pages/reader/StoryDetailPage'));
const AuthorPage = lazy(() => import('@/pages/reader/AuthorPage'));
const ReaderPage = lazy(() => import('@/pages/reader/ReaderPage'));
const LibraryPage = lazy(() => import('@/pages/reader/LibraryPage'));
const ReadingListPage = lazy(() => import('@/pages/reader/ReadingListPage'));
const LoginPage = lazy(() => import('@/pages/account/LoginPage'));
const RegisterPage = lazy(() => import('@/pages/account/RegisterPage'));
const ProfilePage = lazy(() => import('@/pages/account/ProfilePage'));
const PublicProfilePage = lazy(() => import('@/pages/account/PublicProfilePage'));
const BecomeAuthorPage = lazy(() => import('@/pages/account/BecomeAuthorPage'));
const MyStoriesPage = lazy(() => import('@/pages/studio/MyStoriesPage'));
const StoryCreatePage = lazy(() => import('@/pages/studio/StoryCreatePage'));
const StoryEditorPage = lazy(() => import('@/pages/studio/StoryEditorPage'));
const ChapterEditorPage = lazy(() => import('@/pages/studio/ChapterEditorPage'));
const AuthorDashboardPage = lazy(() => import('@/pages/studio/AuthorDashboardPage'));
const AuthorProfilePage = lazy(() => import('@/pages/studio/AuthorProfilePage'));
const AdminDashboardPage = lazy(() => import('@/pages/admin/AdminDashboardPage'));
const UsersPage = lazy(() => import('@/pages/admin/UsersPage'));
const AuthorRequestsPage = lazy(() => import('@/pages/admin/AuthorRequestsPage'));
const AuthorRequestDetailPage = lazy(() => import('@/pages/admin/AuthorRequestDetailPage'));
const StoriesModerationPage = lazy(() => import('@/pages/admin/StoriesModerationPage'));
const CatalogPage = lazy(() => import('@/pages/admin/CatalogPage'));
const page = (node: ReactNode) => <Suspense fallback={<FullPageSpinner />}>{node}</Suspense>;

// Dev-only token/component preview; the import is dropped from production builds.
const DesignSystemPage = import.meta.env.DEV ? lazy(() => import('@/pages/dev/DesignSystemPage')) : null;
const AccountPreviewPage = import.meta.env.DEV ? lazy(() => import('@/pages/dev/AccountPreviewPage')) : null;
const devRoutes: RouteObject[] =
  DesignSystemPage && AccountPreviewPage
    ? [
        { path: 'dev/design-system', element: page(<DesignSystemPage />) },
        { path: 'dev/account', element: page(<AccountPreviewPage />) },
      ]
    : [];

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <ReaderLayout />,
    children: [
      { index: true, element: page(<HomePage />) }, // R1
      { path: 'search', element: page(<SearchPage />) }, // R2
      { path: 'stories/:slug', element: page(<StoryDetailPage />) }, // R3
      { path: 'authors/:authorId', element: page(<AuthorPage />) }, // R4
      { path: 'users/:username', element: page(<PublicProfilePage />) },
      // A1/A2: the design shows login/register as a popup over the home page; these routes host it.
      { path: 'login', element: page(<LoginPage />) },
      { path: 'register', element: page(<RegisterPage />) },
      {
        element: <RequireRole roles={['READER', 'AUTHOR']} />,
        children: [
          { path: 'library', element: page(<LibraryPage />) }, // R7
          { path: 'lists/:listId', element: page(<ReadingListPage />) }, // R8
        ],
      },
      {
        element: <RequireRole roles={['READER']} />,
        children: [{ path: 'become-author', element: page(<BecomeAuthorPage />) }], // R10
      },
      {
        element: <RequireRole />,
        children: [{ path: 'profile', element: page(<ProfilePage />) }],
      },
      ...devRoutes,
    ],
  },

  // R6: full-screen reader, no site header.
  { path: '/chapters/:chapterId', element: page(<ReaderPage />) },

  {
    path: '/studio',
    element: <RequireRole roles={['AUTHOR']} />,
    children: [
      {
        element: <StudioLayout />,
        children: [
          { index: true, element: page(<MyStoriesPage />) }, // S1
          { path: 'stories/new', element: page(<StoryCreatePage />) }, // S2
          { path: 'stories/:storyId', element: page(<StoryEditorPage />) }, // S3
          { path: 'dashboard', element: page(<AuthorDashboardPage />) }, // S5
          { path: 'profile', element: page(<AuthorProfilePage />) }, // S6
        ],
      },
      // S4: full-screen editor, no sidebar.
      { path: 'stories/:storyId/chapters/:chapterId', element: page(<ChapterEditorPage />) },
    ],
  },

  {
    path: '/admin',
    element: <RequireRole roles={['ADMIN']} />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { index: true, element: <Navigate to="dashboard" replace /> },
          { path: 'dashboard', element: page(<AdminDashboardPage />) }, // AD1
          { path: 'users', element: page(<UsersPage />) }, // AD2
          { path: 'author-requests', element: page(<AuthorRequestsPage />) }, // AD3
          { path: 'author-requests/:requestId', element: page(<AuthorRequestDetailPage />) }, // AD4
          { path: 'stories', element: page(<StoriesModerationPage />) }, // AD5
          { path: 'catalog', element: page(<CatalogPage />) }, // AD6
        ],
      },
    ],
  },

  { path: '*', element: <NotFoundPage /> },
];

export const router = createBrowserRouter(routes);
