/**
 * Pro版: 初回のみ4桁パスワード（gate-config.js）→ localStorage に記録し以後スキップ
 */
(function () {
    const STORAGE_KEY = 'pitchTrainerProGateOk';

    function isUnlocked() {
        try {
            return localStorage.getItem(STORAGE_KEY) === '1';
        } catch (_) {
            return false;
        }
    }

    function setUnlocked() {
        try {
            localStorage.setItem(STORAGE_KEY, '1');
        } catch (_) { /* ignore */ }
    }

    function getExpectedPassword() {
        const p = window.__PRO_GATE_PASSWORD__;
        if (typeof p !== 'string') return null;
        const t = p.trim();
        return /^\d{4}$/.test(t) ? t : null;
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
            '<p class="pro-gate-hint">Pro版用の <strong>gate-config.js</strong> が読み込めません。<br>' +
            'リポジトリの <code>gate-config.example.js</code> を <code>gate-config.js</code> にコピーしてデプロイしてください。</p>' +
            '</div>';
        document.body.classList.add('pro-gate-active');
        document.body.insertBefore(overlay, document.body.firstChild);
    }

    function attachResetButton() {
        const btn = document.getElementById('pro-gate-reset');
        if (!btn) return;
        btn.addEventListener('click', () => {
            try {
                localStorage.removeItem(STORAGE_KEY);
            } catch (_) { /* ignore */ }
            window.location.reload();
        });
    }

    function mountGate() {
        if (isUnlocked()) {
            attachResetButton();
            return;
        }

        const expected = getExpectedPassword();
        if (!expected) {
            showMissingConfigOverlay();
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
            '<p class="pro-gate-hint">会員向けのページです。<br>初回のみ、4桁のパスワードを入力してください。</p>' +
            '<input type="password" id="pro-gate-input" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="one-time-code" aria-describedby="pro-gate-error" />' +
            '<p id="pro-gate-error" aria-live="polite"></p>' +
            '<button type="button" id="pro-gate-submit" class="btn-primary">入る</button>' +
            '</div>';

        document.body.classList.add('pro-gate-active');
        document.body.insertBefore(overlay, document.body.firstChild);

        const input = document.getElementById('pro-gate-input');
        const err = document.getElementById('pro-gate-error');
        const submit = document.getElementById('pro-gate-submit');

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
            setUnlocked();
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

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountGate);
    } else {
        mountGate();
    }
})();
