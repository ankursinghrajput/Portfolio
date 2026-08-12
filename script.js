// anujsh.com — minimal script

// ---- Block pinch-zoom + double-tap zoom (iOS Safari ignores user-scalable=no) ----
['gesturestart', 'gesturechange', 'gestureend'].forEach(evt => {
    document.addEventListener(evt, (e) => e.preventDefault());
});

document.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1) e.preventDefault();
}, { passive: false });

let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
}, false);

// ---- Nav scroll state ----
const nav = document.getElementById('nav');
const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// ---- Mobile menu ----
const navToggle = document.getElementById('navToggle');
const mobileMenu = document.getElementById('mobileMenu');

function setMenuOpen(open) {
    mobileMenu.classList.toggle('open', open);
    navToggle.classList.toggle('active', open);
    mobileMenu.setAttribute('aria-hidden', String(!open));
    document.body.classList.toggle('menu-open', open);
    document.body.style.overflow = open ? 'hidden' : '';
}

navToggle.addEventListener('click', () => {
    setMenuOpen(!mobileMenu.classList.contains('open'));
});

mobileMenu.addEventListener('click', (e) => {
    if (e.target === mobileMenu) setMenuOpen(false);
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mobileMenu.classList.contains('open')) {
        setMenuOpen(false);
    }
});

document.querySelectorAll('.mobile-menu-items a, .mobile-menu-items button').forEach(el => {
    el.addEventListener('click', () => setMenuOpen(false));
});

// ---- Scroll reveal (staggered; progressive enhancement) ----
// Auto-stagger siblings within the same section when no explicit delay is set
document.querySelectorAll('.project-grid, .experience-list, .notes-grid, .contact-links').forEach(list => {
    [...list.children].forEach((child, i) => {
        if (!child.style.getPropertyValue('--reveal-delay')) {
            child.style.setProperty('--reveal-delay', `${i * 60}ms`);
        }
    });
});

// Enable the "hidden until revealed" state only after JS is running
document.body.classList.add('js-ready');

const revealables = document.querySelectorAll('.reveal');

// Anything already in viewport on first paint: mark visible immediately.
// Everything below the fold: animate in via IntersectionObserver on scroll.
requestAnimationFrame(() => {
    const vh = window.innerHeight;
    revealables.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.top < vh && rect.bottom > 0) {
            el.classList.add('visible');
        }
    });

    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                revealObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

    revealables.forEach(el => {
        if (!el.classList.contains('visible')) revealObserver.observe(el);
    });
});

// ---- Active section highlight ----
const navAnchors = document.querySelectorAll('.nav-links a[href^="#"]');
const sections = [...navAnchors]
    .map(a => document.querySelector(a.getAttribute('href')))
    .filter(Boolean);

if (sections.length) {
    const sectionObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.id;
                navAnchors.forEach(a => {
                    a.classList.toggle('nav-link-active', a.getAttribute('href') === `#${id}`);
                });
            }
        });
    }, { rootMargin: '-40% 0px -55% 0px' });

    sections.forEach(s => sectionObserver.observe(s));
}

// ---- Résumé preview modal + download ----
const resumeBtn = document.getElementById('resumeBtn');
const mobileResumeBtn = document.getElementById('mobileResumeBtn');
const resumeModal = document.getElementById('resumeModal');
const resumeModalOverlay = document.getElementById('resumeModalOverlay');
const resumeCloseBtn = document.getElementById('resumeCloseBtn');
const resumeDownloadBtn = document.getElementById('resumeDownloadBtn');
const resumeCanvasContainer = document.getElementById('resumeCanvasContainer');
const resumePreviewStatus = document.getElementById('resumePreviewStatus');

const RESUME_URL = '/Ankur_singh_resume_SE.pdf';
const PDFJS_VERSION = '4.0.379';
const PDFJS_BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;
const PDFJS_MODULE = `${PDFJS_BASE}/pdf.min.mjs`;
const PDFJS_WORKER = `${PDFJS_BASE}/pdf.worker.min.mjs`;

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

function downloadResume() {
    // iOS Safari ignores the download attribute, so open inline and let the user save from there.
    if (isIOS()) {
        window.open(RESUME_URL, '_blank', 'noopener');
        return;
    }
    const link = document.createElement('a');
    link.href = RESUME_URL;
    link.download = 'Resume-AnkurSingh.pdf';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

let pdfjsLibPromise = null;
function loadPdfJs() {
    if (!pdfjsLibPromise) {
        pdfjsLibPromise = import(/* @vite-ignore */ PDFJS_MODULE).then(mod => {
            mod.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
            return mod;
        });
    }
    return pdfjsLibPromise;
}

let pdfDocPromise = null;
function loadPdfDoc() {
    if (!pdfDocPromise) {
        pdfDocPromise = loadPdfJs().then(pdfjsLib =>
            pdfjsLib.getDocument(RESUME_URL).promise
        );
    }
    return pdfDocPromise;
}

let resumeRendered = false;
let resumeRendering = false;

async function renderResumePreview() {
    if (resumeRendered || resumeRendering) return;
    resumeRendering = true;
    try {
        const pdf = await loadPdfDoc();

        const cssWidth = resumeCanvasContainer.clientWidth;
        if (!cssWidth) throw new Error('container has zero width');

        const dpr = window.devicePixelRatio || 1;
        // Oversample: bitmap = cssWidth * dpr * 1.25. No cap — DPR=3 iPhones
        // render at 3.75x for near-native crispness. Display size stays cssWidth.
        const bitmapScale = dpr * 1.25;

        resumeCanvasContainer.replaceChildren();

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const baseViewport = page.getViewport({ scale: 1 });
            const cssScale = cssWidth / baseViewport.width;
            const renderViewport = page.getViewport({ scale: cssScale * bitmapScale });

            const canvas = document.createElement('canvas');
            canvas.className = 'resume-page-canvas';
            canvas.width = Math.floor(renderViewport.width);
            canvas.height = Math.floor(renderViewport.height);

            const ctx = canvas.getContext('2d');
            resumeCanvasContainer.appendChild(canvas);

            await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;
        }

        resumePreviewStatus.hidden = true;
        resumeRendered = true;
    } catch (err) {
        console.warn('[resume] preview failed:', err);
        resumePreviewStatus.textContent = 'Preview unavailable';
        resumePreviewStatus.hidden = false;
    } finally {
        resumeRendering = false;
    }
}

let lastFocusedBeforeResume = null;

function openResumeModal() {
    lastFocusedBeforeResume = document.activeElement;
    resumeModal.classList.add('open');
    resumeModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('resume-open');

    // Two rAFs so the modal has finished laying out before we measure container width.
    requestAnimationFrame(() => requestAnimationFrame(() => {
        renderResumePreview();
        resumeDownloadBtn.focus();
    }));
}

function closeResumeModal() {
    resumeModal.classList.remove('open');
    resumeModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('resume-open');
    if (lastFocusedBeforeResume && typeof lastFocusedBeforeResume.focus === 'function') {
        lastFocusedBeforeResume.focus();
    }
}

resumeBtn.addEventListener('click', openResumeModal);
mobileResumeBtn.addEventListener('click', openResumeModal);
resumeCloseBtn.addEventListener('click', closeResumeModal);
resumeModalOverlay.addEventListener('click', closeResumeModal);
resumeDownloadBtn.addEventListener('click', downloadResume);

document.addEventListener('keydown', (e) => {
    if (!resumeModal.classList.contains('open')) return;

    if (e.key === 'Escape') {
        e.preventDefault();
        closeResumeModal();
        return;
    }

    if (e.key === 'Tab') {
        const focusable = [resumeDownloadBtn, resumeCloseBtn];
        const currentIndex = focusable.indexOf(document.activeElement);
        if (currentIndex === -1) {
            e.preventDefault();
            focusable[0].focus();
            return;
        }
        const nextIndex = e.shiftKey
            ? (currentIndex - 1 + focusable.length) % focusable.length
            : (currentIndex + 1) % focusable.length;
        e.preventDefault();
        focusable[nextIndex].focus();
    }
});

// ---- Smooth anchor scroll ----
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (href === '#' || href.length < 2) return;
        const target = document.querySelector(href);
        if (target) {
            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
});

// ---- Hero shader background (WebGL) ----
(function initHeroShader() {
    const canvas = document.querySelector('.hero-bg');
    const hero = document.querySelector('.hero');
    if (!canvas || !hero) return;

    const gl = canvas.getContext('webgl', {
        premultipliedAlpha: true,
        antialias: false,
        alpha: true,
        powerPreference: 'low-power',
    });
    if (!gl) return;

    const VERT = `
        attribute vec2 aPos;
        void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
    `;

    // ---- Aurora ribbon shader ----
    // Smooth, flowing aurora bands with spectral colour cycling and a
    // gravity-well cursor that gently warps the whole field.
    const FRAG = `
        precision highp float;
        uniform float uTime;
        uniform vec2 uRes;
        uniform vec2 uMouse;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform vec3 uColorC;
        uniform float uIntensity;

        // Quintic-smooth value noise — softer than simplex, great for warps
        float hash(vec2 p){
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float vnoise(vec2 p){
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f*f*f*(f*(f*6.0-15.0)+10.0); // quintic
            return mix(mix(hash(i),          hash(i+vec2(1,0)), u.x),
                       mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)), u.x), u.y);
        }
        float sn(vec2 p){
            float v=0.0, a=0.5;
            for(int i=0;i<4;i++){ v+=a*vnoise(p); p*=2.1; a*=0.5; }
            return v;
        }

        // HSL -> RGB for smooth spectral colour cycling
        vec3 hsl(float h, float s, float l){
            vec3 rgb = clamp(abs(mod(h*6.0+vec3(0,4,2),6.0)-3.0)-1.0,0.0,1.0);
            return l + s*(rgb-0.5)*(1.0-abs(2.0*l-1.0));
        }

        void main(){
            vec2 uv = gl_FragCoord.xy / uRes.xy;
            vec2 p  = uv*2.0-1.0;
            p.x    *= uRes.x/uRes.y;

            float t = uTime * 0.013; // majestic, slow drift

            vec2 m = (uMouse*2.0-1.0);
            m.x   *= uRes.x/uRes.y;

            // Gravity-well: warp space toward cursor position smoothly
            vec2 delta = m - p;
            float d2   = dot(delta,delta);
            vec2 pW    = p + delta*(0.28/(d2+1.1));

            // Domain warp with smooth noise (no chaotic curl)
            float wx = sn(pW*0.55 + vec2(t*0.55, 0.31));
            float wy = sn(pW*0.55 + vec2(0.73,   t*0.43));
            vec2 warped = pW + vec2(wx-0.5, wy-0.5)*0.65;

            // ---- Aurora ribbon layers ----
            // Each layer: a sine wave shaped into a narrow band via exp falloff,
            // then domain-warped so it flows organically.

            // Band 1 — wide, slow, dominant
            float n1 = sn(warped*vec2(0.38,1.5) + vec2(t*0.5, 0.0));
            float b1 = exp(-abs(sin(warped.y*2.8 + n1*3.8 + t)) * 3.2);

            // Band 2 — mid, slight counter-drift
            vec2 r2  = vec2(warped.x*0.966+warped.y*0.259, warped.y*0.966-warped.x*0.259);
            float n2 = sn(r2*vec2(0.3,1.4) + vec2(0.0, t*0.38));
            float b2 = exp(-abs(sin(r2.y*2.4 + n2*3.2 - t*0.75 + 1.05)) * 2.9) * 0.80;

            // Band 3 — narrow, faster, adds shimmer
            vec2 r3  = vec2(warped.x*0.966-warped.y*0.259, warped.y*0.966+warped.x*0.259);
            float n3 = sn(r3*vec2(0.32,1.3) + vec2(t*0.28, 0.52));
            float b3 = exp(-abs(sin(r3.y*1.9 + n3*2.8 + t*0.55 + 2.09)) * 2.6) * 0.62;

            // Band 4 — thin highlight thread
            float n4 = sn(warped*0.85 + vec2(t*0.72, t*0.27));
            float b4 = exp(-abs(sin(warped.y*4.2 + n4*4.5 - t*1.0)) * 5.5) * 0.35;

            float bands = clamp(b1 + b2 + b3 + b4, 0.0, 1.0);
            bands = pow(bands, 0.75); // open up mid-tones

            // ---- Spectral colour — cycles slowly in indigo/violet/cyan ----
            float hueShift = sn(warped*0.25 + t*0.018)*0.08;
            float hue = 0.64 + sin((t*0.06 + warped.x*0.06 + hueShift)*6.28)*0.09;
            vec3 spectral = hsl(hue, 0.72, 0.28 + bands*0.18);

            // Blend: palette for coherence, spectral for subtle life
            vec3 col = mix(uColorA, uColorB, bands*0.6);
            col = mix(col, spectral, bands*0.25);  // very light spectral tint
            col += uColorC * (1.0-bands)*0.08;

            // ---- Cursor glow — gentle, barely-there ----
            float cd   = length(p - m*0.91);
            float glow = exp(-cd*cd*1.4);           // tighter, dimmer
            col = mix(col, col + uColorB*0.08, glow*0.5);
            float breath = 0.5 + 0.5*sin(uTime*0.9);
            col += glow * breath * 0.018;

            // ---- Vignette ----
            float vy = smoothstep(1.55, -0.1, uv.y);
            float vx = smoothstep(1.35, 0.18, abs(uv.x-0.5)*2.0);
            float alpha = uIntensity * vy * mix(0.50, 1.0, vx);
            alpha *= (0.30 + bands*0.70);           // keeps bands light
            alpha += glow*0.03*uIntensity;

            gl_FragColor = vec4(col*alpha, alpha);
        }
    `;

    function compile(type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.warn('[hero-bg] shader:', gl.getShaderInfoLog(s));
            return null;
        }
        return s;
    }

    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.warn('[hero-bg] link:', gl.getProgramInfoLog(prog));
        return;
    }
    gl.useProgram(prog);

    // full-screen triangle (covers clip space)
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, 'uTime');
    const uRes = gl.getUniformLocation(prog, 'uRes');
    const uMouse = gl.getUniformLocation(prog, 'uMouse');
    const uColA = gl.getUniformLocation(prog, 'uColorA');
    const uColB = gl.getUniformLocation(prog, 'uColorB');
    const uColC = gl.getUniformLocation(prog, 'uColorC');
    const uIntensity = gl.getUniformLocation(prog, 'uIntensity');

    // Mouse tracking — target updated on move, actual lerps toward it each frame
    const mouseTarget = { x: 0.5, y: 0.4 };
    const mouse = { x: 0.5, y: 0.4 };

    function onPointerMove(e) {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = 1.0 - (e.clientY - rect.top) / rect.height;
        mouseTarget.x = Math.max(-0.2, Math.min(1.2, x));
        mouseTarget.y = Math.max(-0.2, Math.min(1.2, y));
    }
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', () => {
        mouseTarget.x = 0.5;
        mouseTarget.y = 0.4;
    }, { passive: true });

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const isDark = () => document.documentElement.classList.contains('dark-mode') || 
                         (!document.documentElement.classList.contains('light-mode') && 
                          window.matchMedia('(prefers-color-scheme: dark)').matches);
    const targetPalette = () => isDark()
        ? {
            a: [0.30, 0.28, 0.52],  // soft mid-indigo
            b: [0.52, 0.40, 0.72],  // muted violet
            c: [0.36, 0.52, 0.82],  // muted blue
            intensity: 0.13,        // very subtle in dark mode
        }
        : {
            a: [0.82, 0.80, 0.97],  // near-white lavender
            b: [0.90, 0.84, 0.98],  // barely-there mauve
            c: [0.84, 0.92, 1.00],  // pale sky
            intensity: 0.18,        // gentle wash in light mode
        };

    const lerp = (start, end, amt) => (1 - amt) * start + amt * end;
    const lerpArray = (start, end, amt) => start.map((val, i) => lerp(val, end[i], amt));

    const initPalette = targetPalette();
    const currentPalette = {
        a: [...initPalette.a],
        b: [...initPalette.b],
        c: [...initPalette.c],
        intensity: initPalette.intensity
    };

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        const rect = canvas.getBoundingClientRect();
        const w = Math.max(1, Math.floor(rect.width * dpr));
        const h = Math.max(1, Math.floor(rect.height * dpr));
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
            gl.viewport(0, 0, w, h);
        }
    }

    function updateOpacity() {
        const h = hero.offsetHeight || window.innerHeight;
        const s = Math.max(0, Math.min(1, window.scrollY / (h * 0.85)));
        canvas.style.opacity = (1 - s).toFixed(3);
    }

    let t = 0;
    let last = performance.now();
    let running = true;
    let raf;

    function frame(now) {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (!reduced.matches) t += dt;

        // Ease mouse toward target — smooth but responsive
        const k = 1 - Math.pow(0.0004, dt);
        mouse.x += (mouseTarget.x - mouse.x) * k;
        mouse.y += (mouseTarget.y - mouse.y) * k;

        const target = targetPalette();
        const lerpFactor = 1 - Math.pow(0.001, dt);
        currentPalette.a = lerpArray(currentPalette.a, target.a, lerpFactor);
        currentPalette.b = lerpArray(currentPalette.b, target.b, lerpFactor);
        currentPalette.c = lerpArray(currentPalette.c, target.c, lerpFactor);
        currentPalette.intensity = lerp(currentPalette.intensity, target.intensity, lerpFactor);

        gl.uniform1f(uTime, t);
        gl.uniform2f(uRes, canvas.width, canvas.height);
        gl.uniform2f(uMouse, mouse.x, mouse.y);
        gl.uniform3fv(uColA, currentPalette.a);
        gl.uniform3fv(uColB, currentPalette.b);
        gl.uniform3fv(uColC, currentPalette.c);
        gl.uniform1f(uIntensity, currentPalette.intensity);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        if (running && !reduced.matches) {
            raf = requestAnimationFrame(frame);
        }
    }

    function start() {
        resize();
        updateOpacity();
        canvas.classList.add('ready');
        last = performance.now();
        running = true;
        raf = requestAnimationFrame(frame);
    }

    function stop() {
        running = false;
        cancelAnimationFrame(raf);
    }

    // Pause when hero is out of view (saves GPU)
    const heroObserver = new IntersectionObserver((entries) => {
        const e = entries[0];
        if (e.isIntersecting) {
            if (!running) { last = performance.now(); running = true; raf = requestAnimationFrame(frame); }
        } else {
            stop();
        }
    }, { threshold: 0 });
    heroObserver.observe(hero);

    window.addEventListener('resize', () => { resize(); updateOpacity(); }, { passive: true });
    window.addEventListener('scroll', updateOpacity, { passive: true });
    reduced.addEventListener?.('change', () => {
        if (reduced.matches) stop();
        else if (!running) { last = performance.now(); running = true; raf = requestAnimationFrame(frame); }
        // always render at least one frame with new state
        requestAnimationFrame(frame);
    });

    // Stop WebGL on page unload or when navigating away to prevent page transition lag
    window.addEventListener('beforeunload', stop);
    document.querySelectorAll('a').forEach(link => {
        const href = link.getAttribute('href');
        if (href && !href.startsWith('#')) {
            link.addEventListener('click', stop);
        }
    });

    start();
    if (reduced.matches) {
        t = 1.8;
        requestAnimationFrame(frame);
        stop();
    }
})();

// ---- Console greeting ----
console.log('%c ankur.sh ', 'background:#8b8fff;color:#08090a;padding:2px 6px;border-radius:3px;font-weight:600');
console.log('%cLooking under the hood? Say hi — ankursinghrajput@gmail.com', 'color:#8a8f98');

// ---- Theme Toggler Logic (Liquid Glass Switch) ----
(function initThemeToggler() {
    const toggleBtn = document.getElementById('themeToggle');
    const mobileToggleBtn = document.getElementById('mobileThemeToggle');

    function getThemeState() {
        return document.documentElement.classList.contains('light-mode') || 
               (!document.documentElement.classList.contains('dark-mode') && 
                window.matchMedia('(prefers-color-scheme: light)').matches);
    }    let themeToggleTimeout = null;
    function toggleTheme() {
        const isCurrentlyLight = getThemeState();
        
        document.body.classList.add('theme-toggling');
        if (themeToggleTimeout) clearTimeout(themeToggleTimeout);
        themeToggleTimeout = setTimeout(() => {
            document.body.classList.remove('theme-toggling');
            themeToggleTimeout = null;
        }, 450);
        
        // Remove animation classes and trigger reflow
        [toggleBtn, mobileToggleBtn].forEach(btn => {
            if (btn) {
                btn.classList.remove('to-light', 'to-dark');
                void btn.offsetWidth; // Trigger reflow to restart CSS keyframe animation
            }
        });

        if (isCurrentlyLight) {
            // Switch to Dark Mode
            document.documentElement.classList.remove('light-mode');
            document.documentElement.classList.add('dark-mode');
            localStorage.setItem('theme', 'dark');

            [toggleBtn, mobileToggleBtn].forEach(btn => {
                if (btn) btn.classList.add('to-dark');
            });
        } else {
            // Switch to Light Mode
            document.documentElement.classList.remove('dark-mode');
            document.documentElement.classList.add('light-mode');
            localStorage.setItem('theme', 'light');

            [toggleBtn, mobileToggleBtn].forEach(btn => {
                if (btn) btn.classList.add('to-light');
            });
        }
    }
    if (toggleBtn) toggleBtn.addEventListener('click', toggleTheme);
    if (mobileToggleBtn) mobileToggleBtn.addEventListener('click', toggleTheme);

    // Apply the active class on initial load
    const savedTheme = localStorage.getItem('theme') || 'light';
    const systemIsLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    
    if (savedTheme === 'light' && !systemIsLight) {
        document.documentElement.classList.add('light-mode');
    } else if (savedTheme === 'dark' && systemIsLight) {
        document.documentElement.classList.add('dark-mode');
    }
})();

// Remove preload class to enable transitions after initial layout
requestAnimationFrame(() => {
    document.body.classList.remove('preload');
});

// ---- Total Experience Badge ------------------------------------------ //
// Earliest start date — update this if more roles are added.
// Format: { year: YYYY, month: 1–12 }   (month is 1-indexed)
const EXP_START = { year: 2024, month: 11 }; // November 2024

/**
 * Calculate total experience as completed months from `start` to today,
 * then format as human-readable string.
 * A month is only counted once the last day of that month has passed
 * relative to the same calendar day the role started (i.e., floor division).
 */
function calcExperience() {
    const now = new Date();
    const startDate = new Date(EXP_START.year, EXP_START.month - 1, 1); // 1st of start month

    let years  = now.getFullYear()  - startDate.getFullYear();
    let months = now.getMonth()     - startDate.getMonth();

    if (months < 0) {
        years--;
        months += 12;
    }

    // Build readable string
    const parts = [];
    if (years > 0)  parts.push(`${years} yr${years  !== 1 ? 's' : ''}`);
    if (months > 0) parts.push(`${months} mo${months !== 1 ? 's' : ''}`);
    if (parts.length === 0) parts.push('< 1 mo');

    return parts.join(' ');
}

function updateExpBadge() {
    const valueEl = document.getElementById('exp-total-value');
    if (!valueEl) return;

    const text = calcExperience();

    // Animate out → update → animate in
    valueEl.classList.add('updating');
    valueEl.classList.remove('visible');

    setTimeout(() => {
        valueEl.textContent = text;
        valueEl.classList.remove('updating');
        valueEl.classList.add('visible');
    }, 150);
}

/** Schedule the next update at the stroke of midnight (local time). */
function scheduleExpBadgeMidnightUpdate() {
    const now  = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5); // 00:00:05 next day
    const msUntilMidnight = next - now;

    setTimeout(() => {
        updateExpBadge();
        // After the first midnight tick, repeat every 24 h
        setInterval(updateExpBadge, 24 * 60 * 60 * 1000);
    }, msUntilMidnight);
}

// Initialise immediately once DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        updateExpBadge();
        scheduleExpBadgeMidnightUpdate();
    });
} else {
    updateExpBadge();
    scheduleExpBadgeMidnightUpdate();
}
