/**
 * Pro版: 共通設定（auth/pro-gate-config.js）の4桁パスワード → 同一ドメイン群では Cookie で入室状態を共有
 * rotationId を上げると全アプリで再入力が必要になります。
 */
(function () {
    const STORAGE_KEY_LEGACY = 'pitchTrainerProGateOk';
    const LS_ROTATION_KEY = 'soundcruise_pro_gate_rotation';
    const COOKIE_NAME = 'soundcruise_pro_gate_rid';

    function sharedDomainForCookie() {
        const h = location.hostname;
        if (h === 'localhost' || h.endsWith('.local')) return null;
        if (h.endsWith('soundcruise.jp')) return '.soundcruise.jp';
        return null;
    }

    function getConfig() {
        const g = window.__SOUNDCRUISE_PRO_GATE__;
        if (g && typeof g.password === 'string' && g.rotationId != null) {
            const p = String(g.password).trim();
            if (!/^\d{4}$/.test(p)) return null;
            const rid = Number(g.rotationId);
            if (!Number.isFinite(rid) || rid < 0) return null;
            return { rotationId: rid, password: p };
        }
        const legacy = window.__PRO_GATE_PASSWORD__;
        if (typeof legacy === 'string') {
            const p = legacy.trim();
            if (/^\d{4}$/.test(p)) return { rotationId: 1, password: p };
        }
        return null;
    }

    function getStoredRotationId() {
        const d = sharedDomainForCookie();
        if (d) {
            const re = new RegExp('(?:^|; )' + COOKIE_NAME + '=([^;]*)');
            const m = document.cookie.match(re);
            if (m) {
                const v = parseInt(decodeURIComponent(m[1]), 10);
                if (!Number.isNaN(v)) return v;
            }
        }
        try {
            const s = localStorage.getItem(LS_ROTATION_KEY);
            if (s != null) {
                const v = parseInt(s, 10);
                if (!Number.isNaN(v)) return v;
            }
        } catch (_) { /* ignore */ }
        return NaN;
    }

    function setStoredRotation(rid) {
        const d = sharedDomainForCookie();
        if (d) {
            const sec = location.protocol === 'https:' ? '; Secure' : '';
            document.cookie =
                COOKIE_NAME +
                '=' +
                encodeURIComponent(String(rid)) +
                '; Path=/; Domain=' +
                d +
                '; Max-Age=31536000; SameSite=Lax' +
                sec;
        }
        try {
            localStorage.setItem(LS_ROTATION_KEY, String(rid));
        } catch (_) { /* ignore */ }
    }

    function clearGateStorage() {
        const d = sharedDomainForCookie();
        if (d) {
            const sec = location.protocol === 'https:' ? '; Secure' : '';
            document.cookie =
                COOKIE_NAME +
                '=; Path=/; Domain=' +
                d +
                '; Max-Age=0' +
                sec;
        }
        try {
            localStorage.removeItem(LS_ROTATION_KEY);
            localStorage.removeItem(STORAGE_KEY_LEGACY);
        } catch (_) { /* ignore */ }
    }

    function isUnlocked(cfg) {
        if (!cfg) return false;
        const stored = getStoredRotationId();
        if (stored === cfg.rotationId) return true;
        /* 移行前の localStorage のみのユーザー（一度だけ救済） */
        try {
            if (
                localStorage.getItem(STORAGE_KEY_LEGACY) === '1' &&
                cfg.rotationId === 1 &&
                Number.isNaN(stored)
            ) {
                setStoredRotation(cfg.rotationId);
                localStorage.removeItem(STORAGE_KEY_LEGACY);
                return true;
            }
        } catch (_) { /* ignore */ }
        return false;
    }

    function dismissOverlay(overlay) {
        document.body.classList.remove('pro-gate-active');
        if (overlay && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
    }

    function showMissingConfigOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'pro-gate-overlay';
        overlay.className = 'pro-gate-overlay pro-gate-overlay--missing';
        overlay.setAttribute('role', 'alert');
        overlay.innerHTML =
            '<div class="pro-gate-panel">' +
            '<h2 id="pro-gate-title">設定エラー</h2>' +
            '<p class="pro-gate-hint">共通の <strong>auth/pro-gate-config.js</strong> が読み込めません。<br>' +
            'リポジトリの <code>auth/pro-gate-config.example.js</code> を <code>auth/pro-gate-config.js</code> にコピーしてデプロイしてください。</p>' +
            '</div>';
        document.body.classList.add('pro-gate-active');
        document.body.insertBefore(overlay, document.body.firstChild);
    }

    function attachResetButton() {
        const btn = document.getElementById('pro-gate-reset');
        if (!btn) return;
        btn.addEventListener('click', () => {
            clearGateStorage();
            window.location.reload();
        });
    }

    /** GitHub Pages: /<リポジトリ名>/pitch-trainer/... のときだけ先頭に /リポジトリ名 を付ける */
    function siteRootPrefix() {
        const segs = location.pathname.split('/').filter(Boolean);
        if (segs.length >= 2 && segs[1] === 'pitch-trainer') {
            return '/' + segs[0];
        }
        return '';
    }

    function loadAuthScriptThen(done) {
        if (getConfig()) {
            done();
            return;
        }
        const prefix = siteRootPrefix();
        const src = location.origin + prefix + '/auth/pro-gate-config.js?v=2';
        const el = document.createElement('script');
        el.src = src;
        el.async = false;
        el.onload = function () {
            done();
        };
        el.onerror = function () {
            showMissingConfigOverlay();
        };
        (document.head || document.documentElement).appendChild(el);
    }

    function mountGate() {
        try {
            const q = new URLSearchParams(location.search || '');
            if (q.get('resetGate') === '1') {
                clearGateStorage();
                q.delete('resetGate');
                const qs = q.toString();
                const clean = location.pathname + (qs ? '?' + qs : '') + (location.hash || '');
                history.replaceState(null, '', clean);
            }
        } catch (_) { /* ignore */ }

        const cfg = getConfig();
        if (!cfg) {
            showMissingConfigOverlay();
            return;
        }

        if (isUnlocked(cfg)) {
            attachResetButton();
            return;
        }

        const overlay = document.createElement('div');
        overlay.id = 'pro-gate-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'pro-gate-title');
        overlay.innerHTML =
            '<div class="pro-gate-panel">' +
            '<h2 id="pro-gate-title">音感クルーズ <span style="color:#ffe566;">PRO</span></h2>' +
            '<p class="pro-gate-hint">会員向けのページです。<br>4桁のパスワードを入力(初回のみ)</p>' +
            '<input type="password" id="pro-gate-input" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="one-time-code" aria-describedby="pro-gate-error" />' +
            '<p id="pro-gate-error" aria-live="polite"></p>' +
            '<button type="button" id="pro-gate-submit" class="btn-primary">入る</button>' +
            '</div>';

        document.body.classList.add('pro-gate-active');
        document.body.insertBefore(overlay, document.body.firstChild);

        const input = document.getElementById('pro-gate-input');
        const err = document.getElementById('pro-gate-error');
        const submit = document.getElementById('pro-gate-submit');
        const expected = cfg.password;

        function trySubmit() {
            const v = (input.value || '').replace(/\D/g, '').slice(0, 4);
            input.value = v;
            err.textContent = '';
            if (v.length !== 4) {
                err.textContent = '4桁の数字を入力してください。';
                return;
            }
            if (v !== expected) {
                err.textContent = 'パスワードが違います。';
                input.select();
                return;
            }
            try {
                localStorage.removeItem(STORAGE_KEY_LEGACY);
            } catch (_) { /* ignore */ }
            setStoredRotation(cfg.rotationId);
            dismissOverlay(overlay);
            attachResetButton();
        }

        input.addEventListener('input', () => {
            input.value = (input.value || '').replace(/\D/g, '').slice(0, 4);
            err.textContent = '';
        });

        submit.addEventListener('click', trySubmit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') trySubmit();
        });

        requestAnimationFrame(() => {
            input.focus();
        });
    }

    function boot() {
        function scheduleMount() {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', mountGate);
            } else {
                mountGate();
            }
        }
        if (getConfig()) {
            scheduleMount();
        } else {
            loadAuthScriptThen(scheduleMount);
        }
    }

    boot();
})();
