/** @module App Discovery-only route composition; the router is owned by main.jsx. */
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import LandingPage from './pages/LandingPage';

/** Explain unavailable routes without pretending a future feature exists.
 * @returns {import('react').ReactElement} Useful not-found destination.
 */
function NotFound() {
  const location = useLocation();
  return (
    <main id="main-content" className="mx-auto max-w-2xl px-6 py-20">
      <h1 className="mb-5 font-display text-4xl font-bold">
        Page not found
      </h1>
      <p className="mb-3 text-lg text-slate-600">
        This discovery-only build does not include the requested page.
      </p>
      <p className="mb-8 break-words text-slate-600">
        Requested path: {location.pathname}
      </p>
      <Link to="/" className="button-primary">
        Back to Home
      </Link>
    </main>
  );
}

/** Compose only the landing route and explicit catch-all destination.
 * @returns {import('react').ReactElement} Route tree.
 */
export default function App() {
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}
