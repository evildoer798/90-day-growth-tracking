export function AdminPageHeader({ title }: { title: string }) {
  return <header className="role-dashboard__header"><div><p className="role-dashboard__eyebrow">ADMINISTRATION</p><h1>{title}</h1></div></header>;
}
