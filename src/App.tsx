import { useEffect } from 'react';
import { getToken, getUser, isAdmin } from './api';
import { ToastHost } from './components';
import { match, navigate, useRoute } from './router';
import AdminCompeEdit from './pages/AdminCompeEdit';
import AdminCompes from './pages/AdminCompes';
import AdminLogs from './pages/AdminLogs';
import AdminUsers from './pages/AdminUsers';
import ChangePassword from './pages/ChangePassword';
import CompeInput from './pages/CompeInput';
import CompeSelect from './pages/CompeSelect';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';

export default function App() {
  return (
    <>
      <Routes />
      <ToastHost />
    </>
  );
}

function Routes() {
  const path = useRoute();

  // ログインの有効期限切れなどでセッションが消えたらログイン画面へ
  useEffect(() => {
    const on = () => {
      if (!location.hash.startsWith('#/d/')) navigate('/login');
    };
    window.addEventListener('golf-compe-session', on);
    return () => window.removeEventListener('golf-compe-session', on);
  }, []);

  // 公開ダッシュボード（ログイン不要）
  const dash = match('/d/:token', path);
  if (dash) return <Dashboard token={dash.token} />;

  // 未ログインならログイン画面を出す（URLはそのまま。ログイン後に同じ画面へ進める）
  if (path === '/login' || !getToken()) return <Login />;

  let m: Record<string, string> | null;
  if ((m = match('/c/:id', path))) return <CompeInput key={m.id} id={m.id} />;
  if (path === '/password') return <ChangePassword />;

  if (isAdmin(getUser())) {
    if (path === '/admin') return <AdminCompes />;
    if (path === '/admin/users') return <AdminUsers />;
    if ((m = match('/admin/c/:id/logs', path))) return <AdminLogs key={m.id} id={m.id} />;
    if ((m = match('/admin/c/:id', path))) return <AdminCompeEdit key={m.id} id={m.id} />;
  }
  return <CompeSelect />;
}
