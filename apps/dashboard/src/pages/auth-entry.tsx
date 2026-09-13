import { Outlet } from 'react-router-dom';
import { AuthGatePage } from './auth-gate-page.js';

/** Keeps the auth shell mounted across /login ↔ /signup so flip physics can run. */
export function AuthEntry() {
  return (
    <>
      <AuthGatePage />
      <Outlet />
    </>
  );
}
