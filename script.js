/* =========================================================
   PELLE REVESTIMENTOS — script.js
   JavaScript puro, sem dependências.
   ========================================================= */

(() => {
  'use strict';

  document.documentElement.classList.remove('no-js');

  /* -------------------------------------------------------
     CONFIGURAÇÃO DA SEQUÊNCIA DE FRAMES
     Os arquivos ficam em ./frames/ ao lado do index.html.
     pad = quantidade de dígitos do número:
       frame-001.jpg  -> pad: 3
       frame-0001.jpg -> pad: 4
     ------------------------------------------------------- */
  const SEQUENCE = {
    path: 'frames/',
    prefix: 'frame-',
    pad: 3,
    ext: '.jpg',
    count: 300,
    mobileStep: 2,           // no celular carrega 1 a cada 2 frames (150 imagens) para economizar dados
    concurrency: 6,          // downloads simultâneos
    smoothing: 0.14,         // 0–1: quanto menor, mais "macia" a transição entre frames
    maxDpr: 2,
    reducedMotionFrame: 150  // frame exibido quando o usuário prefere menos movimento
  };

  const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const frameUrl = (n) => `${SEQUENCE.path}${SEQUENCE.prefix}${String(n).padStart(SEQUENCE.pad, '0')}${SEQUENCE.ext}`;

  /* =======================================================
     SCROLL SEQUENCE
     ======================================================= */
  function initSequence() {
    const section = document.querySelector('[data-sequence]');
    if (!section) return null;

    const sticky = section.querySelector('.sequence-sticky');
    const canvas = section.querySelector('[data-sequence-canvas]');
    const ctx = canvas.getContext('2d', { alpha: false });
    const bar = section.querySelector('[data-sequence-bar]');
    const hint = section.querySelector('[data-sequence-hint]');
    const loader = section.querySelector('[data-sequence-loader]');
    const loaderText = section.querySelector('[data-sequence-loader-text]');
    const scenes = [...section.querySelectorAll('[data-scene]')].map((el) => ({
      el,
      start: parseFloat(el.dataset.start),
      end: parseFloat(el.dataset.end)
    }));

    const reduced = reduceMotionQuery.matches;
    const saveData = navigator.connection && navigator.connection.saveData;
    const isSmall = window.matchMedia('(max-width: 767px)').matches;
    const step = reduced ? 1 : (isSmall || saveData ? SEQUENCE.mobileStep : 1);

    // Lista de números de arquivo que serão usados (ex.: 1, 3, 5… no celular)
    const fileNumbers = reduced
      ? [SEQUENCE.reducedMotionFrame]
      : Array.from({ length: Math.ceil(SEQUENCE.count / step) }, (_, i) => Math.min(1 + i * step, SEQUENCE.count));
    if (!reduced && fileNumbers[fileNumbers.length - 1] !== SEQUENCE.count) fileNumbers.push(SEQUENCE.count);

    const total = fileNumbers.length;
    const images = new Array(total).fill(null);
    let loadedCount = 0;

    let current = 0;          // frame exibido (fracionado, para suavizar)
    let target = 0;           // frame alvo calculado pela rolagem
    let rafId = 0;
    let lastTime = 0;
    let lastDrawn = -1;
    let cw = 0, ch = 0;

    /* ---------- Canvas responsivo ---------- */
    function resizeCanvas() {
      const dpr = Math.min(window.devicePixelRatio || 1, SEQUENCE.maxDpr);
      const w = sticky.clientWidth;
      const h = sticky.clientHeight;
      if (!w || !h) return;
      cw = Math.round(w * dpr);
      ch = Math.round(h * dpr);
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
      }
      lastDrawn = -1;
      render(true);
    }

    /* Desenha preenchendo a tela (cover) e preservando a proporção */
    function drawCover(img, alpha) {
      const iw = img.naturalWidth || img.width;
      const ih = img.naturalHeight || img.height;
      const scale = Math.max(cw / iw, ch / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      ctx.globalAlpha = alpha;
      ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
    }

    /* Frame carregado mais próximo (enquanto o pré-carregamento não termina) */
    function nearestLoaded(index) {
      if (images[index]) return index;
      for (let d = 1; d < total; d++) {
        if (index - d >= 0 && images[index - d]) return index - d;
        if (index + d < total && images[index + d]) return index + d;
      }
      return -1;
    }

    function render(force = false) {
      if (!cw) return;
      const base = Math.floor(current);
      const frac = current - base;
      const key = Math.round(current * 100);
      if (!force && key === lastDrawn) return;

      const a = nearestLoaded(clamp(base, 0, total - 1));
      if (a === -1) return;
      lastDrawn = key;

      ctx.globalAlpha = 1;
      ctx.fillStyle = '#12100d';
      ctx.fillRect(0, 0, cw, ch);
      drawCover(images[a], 1);

      // Mistura com o próximo frame para uma troca ainda mais suave
      const next = base + 1;
      if (a === base && frac > 0.02 && next < total && images[next]) {
        drawCover(images[next], frac);
      }
      ctx.globalAlpha = 1;
    }

    /* ---------- Progresso da rolagem ---------- */
    function getProgress() {
      const rect = section.getBoundingClientRect();
      const scrollable = section.offsetHeight - sticky.offsetHeight;
      if (scrollable <= 0) return 0;
      return clamp(-rect.top / scrollable, 0, 1);
    }

    function smooth01(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }

    function updateScenes(p) {
      const fade = 0.05;
      for (const s of scenes) {
        let o;
        if (p < s.start || p > s.end) o = 0;
        else {
          const fin = s.start <= 0 ? 1 : smooth01((p - s.start) / fade);
          const fout = s.end >= 1 ? 1 : smooth01((s.end - p) / fade);
          o = Math.min(fin, fout);
        }
        s.el.style.opacity = o.toFixed(3);
        s.el.style.transform = `translate3d(0, ${((1 - o) * 28).toFixed(1)}px, 0)`;
        s.el.classList.toggle('is-active', o > 0.5);
      }
    }

    function onScroll() {
      const p = getProgress();
      target = p * (total - 1);
      bar.style.transform = `scaleX(${p.toFixed(4)})`;
      if (hint) hint.style.opacity = p > 0.02 ? '0' : '1';
      updateScenes(p);
      if (!rafId) {
        lastTime = performance.now();
        rafId = requestAnimationFrame(tick);
      }
    }

    function tick(now) {
      const dt = Math.min(64, now - lastTime);
      lastTime = now;
      // Interpolação independente da taxa de quadros
      const k = 1 - Math.pow(1 - SEQUENCE.smoothing, dt / 16.667);
      current += (target - current) * k;
      if (Math.abs(target - current) < 0.005) current = target;
      render();
      if (current !== target) rafId = requestAnimationFrame(tick);
      else rafId = 0;
    }

    /* ---------- Pré-carregamento ---------- */
    // Ordem progressiva: 1º frame, depois frames espaçados, depois os intermediários.
    // Assim a rolagem já funciona (com menos detalhe) antes de tudo terminar.
    function buildLoadOrder() {
      const order = [];
      const seen = new Uint8Array(total);
      const push = (i) => { if (i < total && !seen[i]) { seen[i] = 1; order.push(i); } };
      push(0);
      for (let stride = 32; stride >= 1; stride = Math.floor(stride / 2)) {
        for (let i = 0; i < total; i += stride) push(i);
      }
      push(total - 1);
      return order;
    }

    function loadImage(i) {
      return new Promise((resolve) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = async () => {
          // decode() evita travadas no primeiro desenho, mas pode nunca resolver
          // em abas em segundo plano — por isso o limite de tempo.
          if (img.decode) {
            await Promise.race([
              img.decode().catch(() => {}),
              new Promise((r) => setTimeout(r, 250))
            ]);
          }
          images[i] = img;
          loadedCount++;
          updateLoader();
          if (i === 0 || Math.abs(i - Math.round(current)) <= 1) render(true);
          resolve();
        };
        img.onerror = () => { loadedCount++; updateLoader(); resolve(); };
        img.src = frameUrl(fileNumbers[i]);
      });
    }

    function updateLoader() {
      const pct = Math.round((loadedCount / total) * 100);
      loaderText.textContent = `Preparando o ambiente… ${pct}%`;
      if (loadedCount >= total) {
        loader.classList.add('is-done');
        loaderText.textContent = 'Ambiente carregado';
      }
    }

    async function preload() {
      const queue = buildLoadOrder();
      // Primeiro frame antes de tudo, para a tela nunca ficar vazia
      await loadImage(queue.shift());
      const workers = Array.from({ length: SEQUENCE.concurrency }, async () => {
        while (queue.length) await loadImage(queue.shift());
      });
      await Promise.all(workers);
    }

    /* ---------- Inicialização ---------- */
    new ResizeObserver(resizeCanvas).observe(sticky);
    resizeCanvas();

    if (reduced) {
      // Sem animação: imagem estática + textos empilhados
      section.classList.add('is-static');
      scenes.forEach((s) => { s.el.style.opacity = ''; s.el.style.transform = ''; });
      loader.classList.add('is-done');
      loadImage(0).then(() => { resizeCanvas(); });
      return { getProgress: () => 1 };
    }

    preload();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    onScroll();

    return { getProgress };
  }

  /* =======================================================
     HEADER, MENU E CTA FLUTUANTE
     ======================================================= */
  function initChrome(sequenceApi) {
    const header = document.querySelector('[data-header]');
    const toggle = document.querySelector('[data-menu-toggle]');
    const menu = document.getElementById('menu');
    const sequence = document.querySelector('[data-sequence]');
    const floatBtn = document.querySelector('.whatsapp-float');
    const contact = document.getElementById('contato');
    let contactVisible = false;

    function update() {
      const seqEnd = sequence ? sequence.offsetTop + sequence.offsetHeight - header.offsetHeight : 0;
      const pastHero = window.scrollY > seqEnd - 1;
      const menuOpen = toggle.getAttribute('aria-expanded') === 'true';
      header.classList.toggle('is-solid', pastHero || menuOpen);

      const p = sequenceApi ? sequenceApi.getProgress() : 1;
      floatBtn.classList.toggle('is-hidden', (p < 0.08 && !pastHero) || contactVisible);
    }

    function setMenu(open) {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.querySelector('.sr-only').textContent = open ? 'Fechar menu' : 'Abrir menu';
      menu.classList.toggle('is-open', open);
      document.body.style.overflow = open ? 'hidden' : '';
      update();
    }

    toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
    window.matchMedia('(min-width: 901px)').addEventListener('change', (e) => { if (e.matches) setMenu(false); });

    if (contact && 'IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => { contactVisible = entry.isIntersecting; update(); }, { threshold: 0.2 }).observe(contact);
    }

    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    update();
  }

  /* =======================================================
     REVEAL AO ROLAR
     ======================================================= */
  function initReveal() {
    const items = document.querySelectorAll('.reveal');
    if (reduceMotionQuery.matches || !('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
    items.forEach((el, i) => {
      el.style.transitionDelay = `${(i % 4) * 80}ms`;
      io.observe(el);
    });
  }

  /* =======================================================
     COLEÇÕES: FILTRO + SELEÇÃO DE PLACAS
     ======================================================= */
  const picked = new Set();

  function initCollections() {
    const filter = document.querySelector('[data-filter]');
    const items = document.querySelectorAll('[data-swatches] li');
    if (!filter) return;

    filter.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-filter-btn]');
      if (!btn) return;
      const value = btn.dataset.filterBtn;
      filter.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
      items.forEach((li) => { li.hidden = value !== 'all' && li.dataset.line !== value; });
    });

    document.querySelectorAll('[data-pick]').forEach((btn) => {
      btn.setAttribute('aria-pressed', 'false');
      btn.addEventListener('click', () => {
        const name = btn.dataset.pick;
        if (picked.has(name)) picked.delete(name); else picked.add(name);
        syncPicked();
      });
    });
  }

  function syncPicked() {
    const box = document.querySelector('[data-picked]');
    const list = document.querySelector('[data-picked-list]');
    const foot = document.querySelector('.collections-foot p');

    document.querySelectorAll('[data-pick]').forEach((btn) => {
      const on = picked.has(btn.dataset.pick);
      btn.classList.toggle('is-picked', on);
      btn.setAttribute('aria-pressed', String(on));
    });

    list.innerHTML = '';
    picked.forEach((name) => {
      const li = document.createElement('li');
      li.textContent = name;
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.setAttribute('aria-label', `Remover ${name}`);
      rm.textContent = '×';
      rm.addEventListener('click', () => { picked.delete(name); syncPicked(); });
      li.appendChild(rm);
      list.appendChild(li);
    });
    box.hidden = picked.size === 0;

    if (foot) {
      foot.innerHTML = picked.size
        ? `${picked.size} ${picked.size === 1 ? 'placa selecionada' : 'placas selecionadas'} · <a href="#contato">Solicitar orçamento →</a>`
        : 'Clique em uma placa para incluí-la no seu pedido de orçamento.';
    }
  }

  /* =======================================================
     GALERIA DE PROJETOS
     ======================================================= */
  function initProjects() {
    const track = document.querySelector('[data-projects]');
    if (!track) return;
    const by = (dir) => {
      const card = track.querySelector('.project-card');
      const gap = parseFloat(getComputedStyle(track).columnGap) || 20;
      track.scrollBy({ left: dir * (card.offsetWidth + gap), behavior: reduceMotionQuery.matches ? 'auto' : 'smooth' });
    };
    document.querySelector('[data-projects-prev]').addEventListener('click', () => by(-1));
    document.querySelector('[data-projects-next]').addEventListener('click', () => by(1));
  }

  /* =======================================================
     FORMULÁRIO → WHATSAPP
     ======================================================= */
  function initForm() {
    const form = document.querySelector('[data-lead-form]');
    if (!form) return;
    const error = form.querySelector('[data-form-error]');
    const tipo = form.querySelector('#f-tipo');
    const PHONE = '5548992000359';

    // Botões "Orçar retroiluminado" / "Solicitar paginações" já pré-selecionam a aplicação
    document.querySelectorAll('[data-interest]').forEach((a) => {
      a.addEventListener('click', () => {
        const map = { 'Retroiluminados': 'Retroiluminados', 'Paginação bookmatch': 'Paginação bookmatch' };
        const v = map[a.dataset.interest];
        if (v) tipo.value = v;
      });
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const nome = form.nome.value.trim();
      const perfil = form.perfil.value;
      form.nome.classList.toggle('is-invalid', !nome);
      form.perfil.classList.toggle('is-invalid', !perfil);
      if (!nome || !perfil) {
        error.hidden = false;
        (nome ? form.perfil : form.nome).focus();
        return;
      }
      error.hidden = true;

      const lines = [
        'Olá, vim pelo site da Pelle e gostaria de um orçamento.',
        '',
        `*Nome:* ${nome}`,
        `*Perfil:* ${perfil}`
      ];
      if (form.cidade.value.trim()) lines.push(`*Cidade:* ${form.cidade.value.trim()}`);
      lines.push(`*Aplicação:* ${form.tipo.value}`);
      if (picked.size) lines.push(`*Placas de interesse:* ${[...picked].join(', ')}`);
      if (form.mensagem.value.trim()) lines.push('', form.mensagem.value.trim());

      const url = `https://wa.me/${PHONE}?text=${encodeURIComponent(lines.join('\n'))}`;
      const win = window.open(url, '_blank', 'noopener');
      if (!win) window.location.href = url;
    });
  }

  /* =======================================================
     START
     ======================================================= */
  const sequenceApi = initSequence();
  initChrome(sequenceApi);
  initReveal();
  initCollections();
  initProjects();
  initForm();

  // Se o usuário mudar a preferência de movimento com a página aberta, recarrega no modo certo
  reduceMotionQuery.addEventListener('change', () => window.location.reload());
})();
