(() => {
  'use strict';

  const errors = [];
  const failedImages = new Map();
  let errorCount = 0;
  const ownUrl = document.currentScript.src;
  const unknownLocation = 'unknown:?:?';

  function describe(value) {
    if (value instanceof Error) return value.name + ': ' + value.message;
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value) ?? String(value); }
    catch { return Object.prototype.toString.call(value); }
  }

  function stackLocation(error) {
    for (const line of String(error?.stack || '').split('\n')) {
      const match = line.match(/((?:[a-z][\w+.-]*:\/\/|blob:|<anonymous>).*?):(\d+):(\d+)\)?$/i);
      if (match && match[1] !== ownUrl) return match.slice(1).join(':');
    }
    return unknownLocation;
  }

  function log(source, message, location) {
    errorCount++;
    errors.push({source, message, location});
    if (errors.length > 20) errors.shift();
  }

  const previousOnError = window.onerror;
  window.onerror = function (message, file, line, column, error) {
    log('window.onerror', describe(message), file ? `${file}:${line || '?'}:${column || '?'}` : stackLocation(error));
    return previousOnError?.apply(this, arguments);
  };
  window.addEventListener('unhandledrejection', event => {
    log('unhandledrejection', describe(event.reason), stackLocation(event.reason));
  });
  const originalConsoleError = console.error;
  console.error = function (...args) {
    const location = stackLocation(new Error());
    log('console.error', args.map(describe).join(' '), location);
    return originalConsoleError.apply(this, args);
  };
  window.addEventListener('error', event => {
    if (!(event.target instanceof HTMLImageElement)) return;
    const src = event.target.currentSrc || event.target.src;
    failedImages.set(src, (failedImages.get(src) || 0) + 1);
  }, true);

  function mount() {
    const host = document.createElement('aside');
    host.setAttribute('aria-label', 'TwinDiff debug');
    host.lang = 'en';
    host.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:2147483647;max-width:calc(100% - 16px);';
    const shadow = host.attachShadow({mode: 'open'});
    shadow.innerHTML = `<style>
      :host { color-scheme:dark; font:13px/1.45 ui-monospace,Consolas,monospace; color:#f3f4f6; }
      details { border:1px solid #706870; border-radius:9px; background:rgb(19 18 22 / 95%); box-shadow:0 4px 24px #0008; }
      details[open] { width:min(350px,calc(100vw - 18px)); }
      summary { padding:8px 12px; cursor:pointer; font-weight:bold; }
      pre { border-block:1px solid #504951; max-height:min(40vh,320px); overflow:auto; overscroll-behavior:contain; margin:0; padding:8px 12px; font:inherit; white-space:pre-wrap; overflow-wrap:anywhere; }
      .actions { display:flex; padding:6px 10px; align-items:center; gap:8px; }
      button { font:inherit; color:inherit; border:1px solid #766d75; background:#322d32; border-radius:5px; padding:4px 9px; cursor:pointer; }
      :focus-visible { outline:2px solid #ffac98; outline-offset:-2px; }
    </style>
    <details open><summary>TwinDiff debug</summary><pre tabindex="0" aria-label="Live diagnostics"></pre>
    <div class="actions"><button type="button">Copy report</button><span role="status"></span></div></details>`;
    document.body.append(host);

    const details = shadow.querySelector('details');
    const output = shadow.querySelector('pre');
    const status = shadow.querySelector('[role=status]');
    const sections = [...document.querySelectorAll('main > section[id], footer[id]')];
    const hero = document.querySelector('.hero-window');
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const dark = matchMedia('(prefers-color-scheme: dark)');
    const portrait = matchMedia('(orientation: portrait)');
    let previousFrame, sampleStart, frames = 0, fps, longFrames = 0;

    function sample(time) {
      if (previousFrame !== undefined) {
        if (time - previousFrame > 50) longFrames++;
        frames++;
      }
      previousFrame = time;
      sampleStart ??= time;
      if (time - sampleStart >= 1000) {
        fps = frames * 1000 / (time - sampleStart);
        sampleStart = time;
        frames = 0;
      }
      requestAnimationFrame(sample);
    }
    document.addEventListener('visibilitychange', () => {
      previousFrame = sampleStart = fps = undefined;
      frames = 0;
    });
    requestAnimationFrame(sample);

    function widestOffender(width) {
      let widest, widestWidth = -1;
      const textRange = document.createRange();
      for (const element of document.body.querySelectorAll('*')) {
        if (element === host || !element.getClientRects().length) continue;
        const rect = element.getBoundingClientRect();
        let left = rect.left + scrollX, right = rect.right + scrollX;
        // Include an overflowing line of text in a box that still fits the viewport.
        if (element.scrollWidth > element.clientWidth && getComputedStyle(element).overflowX === 'visible') {
          for (const child of element.childNodes) {
            if (child.nodeType !== Node.TEXT_NODE || !child.textContent.trim()) continue;
            textRange.selectNodeContents(child);
            const line = textRange.getBoundingClientRect();
            left = Math.min(left, line.left + scrollX);
            right = Math.max(right, line.right + scrollX);
          }
          // A leaf can also overflow via a generated pseudo-element.
          if (!element.childElementCount) right = Math.max(right, rect.left + scrollX + element.scrollWidth);
        }
        if (right <= width) continue;
        // Exclude the part of the element that an ancestor clips.
        for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
          if (getComputedStyle(parent).overflowX === 'visible') continue;
          const clip = parent.getBoundingClientRect();
          left = Math.max(left, clip.left + scrollX);
          right = Math.min(right, clip.right + scrollX);
        }
        if (right <= width || right - left <= widestWidth) continue;
        widest = element;
        widestWidth = right - left;
      }
      if (!widest) return 'unresolved (text or generated content)';
      const label = widest.localName + (widest.id ? '#' + widest.id : '') + [...widest.classList].map(name => '.' + name).join('');
      return `${label} (${Math.round(widestWidth)} px)`;
    }

    function report() {
      const root = document.documentElement;
      const excess = root.scrollWidth - root.clientWidth;
      const maxScroll = root.scrollHeight - root.clientHeight;
      const progress = maxScroll > 0 ? Math.min(100, Math.max(0, scrollY / maxScroll * 100)) : 0;
      const active = sections.filter(el => el.getBoundingClientRect().top <= innerHeight / 2).pop() || sections[0];
      const sectionId = maxScroll > 0 && scrollY >= maxScroll - 1 ? sections.at(-1)?.id : active?.id;
      const transform = hero && getComputedStyle(hero).transform;
      const matrix = new DOMMatrix(transform && transform !== 'none' ? transform : undefined);
      const tilt = Math.atan2(-matrix.m32, matrix.m33) * 180 / Math.PI;
      const lines = [
        `Viewport: ${innerWidth} × ${innerHeight} px · DPR ${devicePixelRatio} · ${portrait.matches ? 'portrait' : 'landscape'}`,
        excess > 0 ? `WARNING: horizontal overflow +${excess} px · widest: ${widestOffender(root.clientWidth)}` : 'Horizontal overflow: none',
        `Scroll: ${progress.toFixed(1)}% · #${sectionId} · hero tilt X: ${tilt.toFixed(1)}°`,
        `Reduced motion: ${motion.matches ? 'reduce' : 'no-preference'} · Color scheme: ${dark.matches ? 'dark' : 'light'} · Language: ${root.lang.toUpperCase()}`,
        `FPS (1 s): ${fps === undefined ? 'sampling' : fps.toFixed(1)} · Long frames (>50 ms): ${longFrames}`,
        `JS errors: ${errorCount} total · last ${errors.length}/20`
      ];
      const groups = [];
      for (const entry of errors) {
        const key = `${entry.source} · ${entry.message}\n  ${entry.location}`;
        const last = groups.at(-1);
        if (last && last.key === key) last.count++;
        else groups.push({key, count: 1});
      }
      for (const group of groups) lines.push(`[${group.count}×] ${group.key}`);
      let imageCount = 0;
      for (const count of failedImages.values()) imageCount += count;
      lines.push(`Failed images: ${imageCount}`);
      for (const [src, count] of failedImages) lines.push(`[${count}×] ${src}`);
      const oversized = [];
      let waiting = 0;
      for (const img of document.images) {
        if (!img.naturalWidth) {
          if (!img.complete) waiting++;
          continue;
        }
        const pixels = img.getBoundingClientRect().width * window.devicePixelRatio;
        if (pixels > img.naturalWidth) {
          const file = (img.currentSrc || img.src).split('/').pop();
          oversized.push(`${file} · rendered × DPR: ${pixels} px · natural: ${img.naturalWidth} px`);
        }
      }
      lines.push(`Oversized images: ${oversized.length}`, ...oversized);
      if (waiting) lines.push(`Images awaiting load: ${waiting}`);
      return lines.join('\n');
    }

    function refresh() {
      if (!details.open) return;
      const next = report();
      if (next !== output.textContent) output.textContent = next;
    }
    details.addEventListener('toggle', refresh);
    shadow.querySelector('button').addEventListener('click', async () => {
      const contents = report();
      output.textContent = contents;
      try {
        await navigator.clipboard.writeText(contents);
        status.textContent = 'Copied';
      } catch {
        const field = document.createElement('textarea');
        field.style.cssText = 'position:fixed;bottom:0;left:0;opacity:0';
        field.value = contents;
        shadow.append(field);
        field.select();
        const copied = document.execCommand('copy');
        field.remove();
        shadow.querySelector('button').focus();
        status.textContent = copied ? 'Copied' : 'Select and copy the report above.';
      }
    });
    refresh();
    setInterval(refresh, 250);
  }
  document.addEventListener('DOMContentLoaded', mount, {once: true});
})();
