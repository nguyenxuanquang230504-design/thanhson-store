document.getElementById('adminLogout')?.addEventListener('click', async () => {
  const response = await fetch('/api/admin/logout', { method: 'POST' });
  if (response.ok) location.href = '/admin/login';
});
