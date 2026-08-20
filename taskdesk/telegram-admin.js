'use strict';
(() => {
  const BOT_EMAIL = 'youssem.am+taskdeskbot@gmail.com';
  const BOT_USER_ID = '8e6f95b2-cc71-4f6e-8792-f714cea6fac9';
  const originalRenderUsers = renderUsers;

  renderUsers = function () {
    originalRenderUsers();
    if (!me || me.role !== 'ADMIN') return;
    const content = document.querySelector('#main .content');
    if (!content || document.getElementById('telegram-bot-admin-card')) return;

    const card = document.createElement('div');
    card.id = 'telegram-bot-admin-card';
    card.className = 'o-card';
    card.style.marginBottom = '12px';
    card.innerHTML = `
      <div style="padding:14px;display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap">
        <div>
          <b>TaskDesk Telegram AI</b>
          <div class="subtle">${BOT_EMAIL}</div>
          <div class="subtle" style="margin-top:4px">${prefs.lang==='ar'?'تفعيل حساب البوت ومنحه صلاحية Admin لإدارة التاسكات من Telegram.':'Activate the bot account and grant Admin access for Telegram task management.'}</div>
        </div>
        <button class="btn btn-primary" id="authorize-telegram-bot">${prefs.lang==='ar'?'تفعيل البوت':'Authorize Bot'}</button>
      </div>`;
    content.prepend(card);

    document.getElementById('authorize-telegram-bot').onclick = async () => {
      const btn = document.getElementById('authorize-telegram-bot');
      btn.disabled = true;
      btn.textContent = prefs.lang==='ar'?'جاري التفعيل...':'Authorizing...';
      try {
        const rows = await rest('profiles', `id=eq.${BOT_USER_ID}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: { is_active: true, role: 'ADMIN', full_name: 'TaskDesk Telegram Bot' }
        });
        if (!rows || !rows.length) throw new Error('Bot profile update was blocked');
        toast(prefs.lang==='ar'?'تم تفعيل Telegram Bot كـ Admin':'Telegram Bot authorized as Admin');
        btn.textContent = prefs.lang==='ar'?'تم التفعيل ✓':'Authorized ✓';
        await loadData();
      } catch (e) {
        btn.disabled = false;
        btn.textContent = prefs.lang==='ar'?'تفعيل البوت':'Authorize Bot';
        toast(e.message);
      }
    };
  };
})();
