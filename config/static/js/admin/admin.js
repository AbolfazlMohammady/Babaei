(() => {
  const sidebar=document.querySelector('[data-admin-sidebar]'), overlay=document.querySelector('[data-admin-overlay]'), open=document.querySelector('[data-admin-menu]'), close=document.querySelector('[data-admin-close]');
  const setMenu=(state)=>{sidebar?.classList.toggle('is-open',state);overlay?.classList.toggle('is-visible',state);open?.setAttribute('aria-expanded',String(state));document.body.classList.toggle('ba-menu-open',state);};
  open?.addEventListener('click',()=>setMenu(!sidebar?.classList.contains('is-open'))); close?.addEventListener('click',()=>setMenu(false)); overlay?.addEventListener('click',()=>setMenu(false));
  document.querySelectorAll('[data-admin-group]').forEach(b=>b.addEventListener('click',()=>b.closest('.ba-nav-group')?.classList.toggle('is-collapsed')));
  const user=document.querySelector('[data-admin-user]'), menu=document.querySelector('[data-admin-user-menu]');
  user?.addEventListener('click',(e)=>{e.stopPropagation();const s=!menu?.classList.contains('is-open');menu?.classList.toggle('is-open',s);user.setAttribute('aria-expanded',String(s));});
  document.addEventListener('click',()=>{menu?.classList.remove('is-open');user?.setAttribute('aria-expanded','false');});
  document.querySelectorAll('.ba-sidebar a').forEach(a=>a.addEventListener('click',()=>{if(innerWidth<=980)setMenu(false);}));
})();