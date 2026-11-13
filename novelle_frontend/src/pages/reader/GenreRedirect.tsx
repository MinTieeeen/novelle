import { Navigate, useParams } from 'react-router-dom';

/** /genres/:slug → /search?genres=:slug (module-catalog §10.1). */
export default function GenreRedirect() {
  const { slug = '' } = useParams();
  return <Navigate to={slug ? `/search?genres=${encodeURIComponent(slug)}` : '/search'} replace />;
}
