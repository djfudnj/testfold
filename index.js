(function () {
    'use strict';

    // 이 확장은 채팅 데이터(chat 배열, chat.jsonl)에는 절대 손대지 않습니다.
    // 오직 화면에 보이는 DOM(.mes_text)의 display 속성만 토글하고,
    // 접힘 상태는 브라우저 localStorage 에만 저장합니다.

    const BTN_CLASS = 'mes-collapse-btn';
    const SUMMARY_CLASS = 'mes-collapse-summary';
    const STORAGE_PREFIX = 'st_mesCollapse_';

    function getChatKey() {
        try {
            const ctx = window.SillyTavern?.getContext?.();
            return String(ctx?.chatId ?? ctx?.characterId ?? ctx?.name2 ?? 'default');
        } catch (e) {
            return 'default';
        }
    }

    function getMesId($mes) {
        const v = $mes.attr('mesid') ?? $mes.attr('data-mesid') ?? $mes.data('mesid');
        return v === undefined || v === null ? null : String(v);
    }

    function storageKey(mesId) {
        return STORAGE_PREFIX + getChatKey() + '_' + mesId;
    }

    function setCollapsed($mes, collapsed) {
        const $text = $mes.find('.mes_text').first();
        const $summary = $mes.find('.' + SUMMARY_CLASS).first();
        const $btn = $mes.find('.' + BTN_CLASS).first();

        if (collapsed) {
            $text.hide();
            $summary.show();
            $btn.removeClass('fa-compress').addClass('fa-expand').attr('title', '펼치기');
        } else {
            $text.show();
            $summary.hide();
            $btn.removeClass('fa-expand').addClass('fa-compress').attr('title', '접기');
        }
    }

    function toggleCollapse($mes) {
        const $text = $mes.find('.mes_text').first();
        if (!$text.length) return;

        const willCollapse = $text.is(':visible');
        setCollapsed($mes, willCollapse);

        const mesId = getMesId($mes);
        if (mesId !== null) {
            try {
                localStorage.setItem(storageKey(mesId), willCollapse ? 'true' : 'false');
            } catch (e) {
                /* localStorage 사용 불가 시 무시 (상태 저장만 안 될 뿐 기능엔 영향 없음) */
            }
        }
    }

    function ensureUi($mes) {
        if ($mes.find('.' + BTN_CLASS).length) return;

        const $btnHost = $mes.find('.extraMesButtons').first().length
            ? $mes.find('.extraMesButtons').first()
            : $mes.find('.mes_buttons').first();

        if (!$btnHost.length) return;

        const $btn = $(
            `<div class="mes_button ${BTN_CLASS} fa-solid fa-compress interactable" title="접기" tabindex="0"></div>`
        );
        $btnHost.prepend($btn);

        const $text = $mes.find('.mes_text').first();
        if ($text.length && !$mes.find('.' + SUMMARY_CLASS).length) {
            const $summary = $(
                `<div class="${SUMMARY_CLASS}">📄 내용이 접혀 있습니다 — 클릭하여 펼치기</div>`
            );
            $summary.hide();
            $text.after($summary);
        }

        const mesId = getMesId($mes);
        if (mesId !== null) {
            let saved = null;
            try {
                saved = localStorage.getItem(storageKey(mesId));
            } catch (e) {
                /* ignore */
            }
            if (saved === 'true') {
                setCollapsed($mes, true);
            }
        }
    }

    function scan() {
        $('#chat .mes').each(function () {
            ensureUi($(this));
        });
    }

    $(document).on('click', '.' + BTN_CLASS, function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggleCollapse($(this).closest('.mes'));
    });

    $(document).on('click', '.' + SUMMARY_CLASS, function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggleCollapse($(this).closest('.mes'));
    });

    function init() {
        // 확장 로드 시점에 이미 화면에 떠 있는 메시지들 1회 전체 스캔
        scan();

        // 이후로는 새로 추가된 노드만 골라서 처리 (전체 재스캔 X)
        const chatEl = document.getElementById('chat');
        if (chatEl) {
            const observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType !== 1) return; // 텍스트 노드 등은 무시

                        const $node = $(node);
                        if ($node.hasClass('mes')) {
                            ensureUi($node);
                        } else {
                            // 혹시 .mes가 래퍼 노드 안에 중첩되어 추가되는 경우 대비
                            $node.find('.mes').each(function () {
                                ensureUi($(this));
                            });
                        }
                    });
                }
            });
            observer.observe(chatEl, { childList: true, subtree: false });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
