/**
 * Staging 検証のみ: ?stagingPreview=1 で Pro を開いたとき、カスタム STAGE ボタン文言を
 * 通常版と同じ「Proアイコン＋PROカスタムSTAGE」1行にし、pro-stage-teaser の字まわりを適用する。
 */
(function () {
    if (new URLSearchParams(location.search).get('stagingPreview') !== '1') return;

    document.documentElement.classList.add('staging-pro-custom-stage');

    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '../staging/pro-custom-stage-align.css?v=7';
    document.head.appendChild(link);

    function patch() {
        var m = document.getElementById('btn-level-pro');
        var c = document.getElementById('btn-level-pro-chord');
        var teaser =
            '<span class="pro-teaser-inline"><img src="../pro_icon_96.png" alt="" class="pro-ui-icon pro-ui-icon--teaser" width="22" height="22" decoding="async"> PROカスタムSTAGE</span>';
        if (m) {
            m.classList.add('pro-stage-teaser');
            m.innerHTML = teaser;
        }
        if (c) {
            c.classList.add('pro-stage-teaser');
            c.innerHTML = teaser;
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', patch);
    } else {
        patch();
    }
})();
