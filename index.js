(() => {
  'use strict';
  const ID = 'repo-mask';
  const SCRIPT_URL = document.currentScript?.src || '';
  const DEFAULTS = { enabled: false, maskUser: true, maskChar: true, maskNpc: false, blur: 7, customNpcNames: '' };
  let cfg = { ...DEFAULTS }, panel, button, observer, queued = false, detectedNpc = new Set();
  const escapeRE = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function load() {
    try {
      const saved = window.parent.extension_settings?.[ID];
      if (saved) cfg = { ...DEFAULTS, ...saved };
      else cfg = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('repoMaskSettings') || '{}') };
    } catch (_) {
      try { cfg = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('repoMaskSettings') || '{}') }; } catch (_) {}
    }
  }
  function save() {
    try {
      const host = window.parent;
      if (host.extension_settings) {
        host.extension_settings[ID] = { ...cfg };
        host.saveSettingsDebounced?.();
        return;
      }
    } catch (_) {}
    try { localStorage.setItem('repoMaskSettings', JSON.stringify(cfg)); } catch (_) {}
  }
  function getNames() {
    const messages = [...document.querySelectorAll('#chat .mes, .chat .mes')];
    const speakerInfo = messages.map(m => ({
      name: (m.querySelector('.name_text, .mes_name, .name')?.textContent || '').trim(),
      isUser: m.getAttribute('is_user') === 'true' || m.classList.contains('is_user')
    })).filter(x => x.name);
    const userName = (document.querySelector('#user_name')?.textContent || document.querySelector('#user-settings .username')?.textContent || speakerInfo.find(x => x.isUser)?.name || '').trim();
    const charName = (document.querySelector('#character_name')?.textContent || document.querySelector('#char_name')?.textContent || speakerInfo.find(x => !x.isUser)?.name || '').trim();
    detectedNpc = new Set(speakerInfo.filter(x => !x.isUser && x.name && x.name !== charName && x.name !== userName).map(x => x.name));
    const targets = [];
    if (cfg.maskUser && userName) targets.push({ name: userName, type: 'user' });
    if (cfg.maskChar && charName) targets.push({ name: charName, type: 'char' });
    if (cfg.maskNpc) {
      const custom = cfg.customNpcNames.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      for (const name of new Set([...detectedNpc, ...custom])) if (name && name !== userName && name !== charName) targets.push({ name, type: 'npc' });
    }
    const uniq = new Map(); targets.forEach(t => uniq.set(t.name, t));
    return [...uniq.values()].sort((a,b) => b.name.length - a.name.length);
  }
  function unwrap() { document.querySelectorAll('.repo-mask-marked').forEach(el => el.replaceWith(document.createTextNode(el.textContent || ''))); }
  function skip(node) {
    const p = node.parentElement;
    return !p || !node.nodeValue?.trim() || p.closest('#repo-mask-panel,.repo-mask-marked,script,style,textarea,input,select,button,[contenteditable="true"]');
  }
  function scanNode(node, targets, re) {
    if (skip(node)) return;
    const text = node.nodeValue; re.lastIndex = 0;
    if (!re.test(text)) return;
    re.lastIndex = 0;
    const frag = document.createDocumentFragment(); let last = 0;
    for (const m of text.matchAll(re)) {
      if (m.index > last) frag.append(document.createTextNode(text.slice(last, m.index)));
      const target = targets.find(t => t.name.toLocaleLowerCase() === m[0].toLocaleLowerCase()) || targets[0];
      const span = document.createElement('span'); span.className = `repo-mask-marked repo-mask-${target.type}`; span.textContent = m[0]; span.setAttribute('aria-label','已打码名称'); frag.append(span);
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.append(document.createTextNode(text.slice(last)));
    node.replaceWith(frag);
  }
  function scan() {
    queued = false;
    if (!cfg.enabled) return;
    const targets = getNames(); if (!targets.length) { refreshNpc(); return; }
    const re = new RegExp(targets.map(t => escapeRE(t.name)).join('|'), 'giu');
    const root = document.querySelector('#chat') || document.querySelector('.chat');
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(n => scanNode(n, targets, re)); refreshNpc();
  }
  function queueScan() { if (queued) return; queued = true; requestAnimationFrame(scan); }
  function setEnabled(on) { cfg.enabled = !!on; if (cfg.enabled) queueScan(); else unwrap(); save(); updateUI(); }
  function setOpt(key, value) { cfg[key] = value; save(); if (cfg.enabled) { unwrap(); queueScan(); } updateUI(); }
  function updateUI() {
    if (button) { button.textContent = cfg.enabled ? '仓库打码●' : '仓库打码'; button.classList.toggle('repo-mask-active', cfg.enabled); }
    if (!panel) return;
    panel.querySelector('#rm-enabled').checked = cfg.enabled;
    panel.querySelector('#rm-user').checked = cfg.maskUser;
    panel.querySelector('#rm-char').checked = cfg.maskChar;
    panel.querySelector('#rm-npc').checked = cfg.maskNpc;
    panel.querySelector('#rm-blur').value = cfg.blur;
    panel.querySelector('#rm-blur-value').textContent = `${cfg.blur}px`;
  }
  function refreshNpc() { if (panel) panel.querySelector('#rm-npc-detected').textContent = [...detectedNpc].join('、') || '暂未识别到其他发言者'; }
  function createPanel() {
    if (panel) return;
    panel = document.createElement('section'); panel.id = 'repo-mask-panel';
    panel.innerHTML = `<header><strong>仓库打码</strong><button type="button" id="rm-close" aria-label="关闭">×</button></header>
      <p class="rm-tip">需要发布截图时再开启。只遮挡显示效果，不会修改原始聊天记录。</p>
      <label class="rm-switch rm-main"><input id="rm-enabled" type="checkbox"><span>开启名字打码</span></label>
      <hr>
      <label class="rm-switch"><input id="rm-user" type="checkbox"><span>User 名字</span></label>
      <label class="rm-switch"><input id="rm-char" type="checkbox"><span>当前 Char 名字</span></label>
      <label class="rm-switch"><input id="rm-npc" type="checkbox"><span>NPC 名字（可选）</span></label>
      <div class="rm-npc-box"><small>识别到的其他发言者：<span id="rm-npc-detected">暂未识别到其他发言者</span></small>
      <label for="rm-npcnames">额外指定 NPC 名字（每行一个）</label><textarea id="rm-npcnames" rows="3" placeholder="每行填写一个要打码的 NPC 名字"></textarea></div>
      <label class="rm-range" for="rm-blur"><span>模糊强度</span><output id="rm-blur-value"></output></label><input id="rm-blur" type="range" min="2" max="16" step="1">
      <footer><button id="rm-off" type="button">关闭并恢复原样</button></footer>
      <p class="rm-foot">发布前请检查头像、图片、状态栏等其他身份信息。视觉模糊不是数据删除。</p>`;
    document.body.append(panel);
    const $ = s => panel.querySelector(s);
    $('#rm-enabled').addEventListener('change', e => setEnabled(e.target.checked));
    $('#rm-user').addEventListener('change', e => setOpt('maskUser', e.target.checked));
    $('#rm-char').addEventListener('change', e => setOpt('maskChar', e.target.checked));
    $('#rm-npc').addEventListener('change', e => setOpt('maskNpc', e.target.checked));
    $('#rm-npcnames').value = cfg.customNpcNames;
    $('#rm-npcnames').addEventListener('input', e => { cfg.customNpcNames = e.target.value; save(); if (cfg.enabled) { unwrap(); queueScan(); } });
    $('#rm-blur').addEventListener('input', e => { cfg.blur = Number(e.target.value); document.documentElement.style.setProperty('--repo-mask-blur', `${cfg.blur}px`); $('#rm-blur-value').textContent = `${cfg.blur}px`; save(); });
    $('#rm-close').addEventListener('click', () => panel.classList.remove('repo-mask-open'));
    $('#rm-off').addEventListener('click', () => setEnabled(false));
    updateUI();
  }
  function addButton() {
    if (button?.isConnected) return;
    button = document.createElement('button'); button.id = 'repo-mask-toggle'; button.type = 'button'; button.className = 'menu_button';
    button.addEventListener('click', () => { if (!panel) createPanel(); panel.classList.toggle('repo-mask-open'); refreshNpc(); });
    const host = document.querySelector('#extensionsMenu') || document.querySelector('#top-bar .flex-container') || document.querySelector('#top-bar');
    if (host) host.append(button);
    updateUI();
  }
  function init() {
    load(); document.documentElement.style.setProperty('--repo-mask-blur', `${cfg.blur}px`);
    if (!document.getElementById('repo-mask-style')) { const link = document.createElement('link'); link.id = 'repo-mask-style'; link.rel = 'stylesheet'; link.href = SCRIPT_URL ? new URL('./style.css', SCRIPT_URL).href : './style.css'; document.head.append(link); }
    createPanel(); addButton();
    const root = document.querySelector('#chat') || document.querySelector('.chat') || document.body;
    observer = new MutationObserver(() => { if (cfg.enabled) queueScan(); }); observer.observe(root, { childList: true, subtree: true, characterData: true });
    const uiObserver = new MutationObserver(() => { if (!document.getElementById('repo-mask-toggle')) addButton(); }); uiObserver.observe(document.body, { childList: true, subtree: true });
    if (cfg.enabled) queueScan();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
